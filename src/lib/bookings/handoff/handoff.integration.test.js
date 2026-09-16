import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authenticateCanonicalQa } from "../../../../scripts/canonical-booking-qa.mjs";
import { compensationProtectedState } from "../../../../scripts/booking-sitter-compensation-qa.mjs";
import { cleanupVisitFinance } from "../../../../scripts/visit-compensation-qa.mjs";
import { createCanonicalBookingWithDb } from "../canonical/createCanonicalBooking.js";
import { optionFixture, bookingInput, timedSchedule } from "../canonical/fixtures.js";
import { createSitterReferralCode } from "../../referrals/sitterReferralCodeWrites.js";
import { reserveRewardForBookingWithDb } from "../../rewards/rewardReservationWrites.js";
import { confirmBookingWithDb } from "../confirmation/confirmationService.js";
import { handoffSelectedVisitsWithDb } from "./handoffService.js";
import { participantCareDto, leadVisibleVisits, resolveSitterBookingParticipationWithDb } from "./participation.js";
import { evaluateRewardQualification } from "../../rewards/rewardQualification.js";
import { completeVisitWithDb } from "../economics/completionService.js";
import { reviewMissedVisitWithDb } from "../../visits/reviewMissedVisit.js";
import { cancelCanonicalBookingWithDb } from "../cancellation/canonicalCancellation.js";
import { economicsInclude } from "../economics/bookingEconomics.js";
import { visitFinancialInclude, activeAuthorization } from "../visitCompensation/contract.js";
import { careReadiness } from "../visitCompensation/readiness.js";

test("PostgreSQL selected handoff, bounded participation and synchronized lifecycle races", {
  skip: process.env.TASKWHISKER_HANDOFF_QA_TESTS !== "1", timeout: 600000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db=new PrismaClient(), marker=`handoff-qa-${randomUUID()}`;
  const operatorId=`${marker}-operator`, sitterId=`${marker}-sitter`, ownerId=`${marker}-owner`, otherId=`${marker}-other`;
  const baseline=await compensationProtectedState(db);
  const envKeys=["BUSINESS_OWNER_OPERATOR_USER_ID","BUSINESS_OWNER_SITTER_USER_ID","DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID"];
  const oldEnv=envKeys.map(k=>process.env[k]);
  let option, publicCode, ordinal=0;
  const load=id=>db.booking.findUnique({where:{id},include:{...economicsInclude,visits:{orderBy:{canonicalUnitPosition:"asc"},include:visitFinancialInclude},sitterCompensation:{include:{petCharges:true}}}});
  const confirm=(b,database=db)=>confirmBookingWithDb({db:database,bookingId:b.id,actorId:operatorId});
  const finish=(b,{database=db,role="SITTER",performer=sitterId,index=0}={})=>completeVisitWithDb({db:database,visitId:b.visits[index].id,actorId:role==="SITTER"?performer:operatorId,actorRole:role,now:new Date(+b.visits[index].startTime+1000)});
  async function create({business=false,owner=false,quantity=1,pets=bookingInput().pets}={}) {
    process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID=owner?ownerId:sitterId;
    const schedule=timedSchedule(quantity), offset=++ordinal*7*86400000;
    schedule.visits=schedule.visits.map(v=>({...v,date:new Date(Date.parse(`${v.date}T00:00:00Z`)+offset).toISOString().slice(0,10)}));
    return createCanonicalBookingWithDb({db,operatorId,creationKey:randomUUID(),input:bookingInput({client:{name:"Visit finance QA",email:`${marker}-${randomUUID()}@example.invalid`},careOptionCode:option.code,pets,schedule,...(business||owner?{}:{referralCode:publicCode,requestReferringSitter:true})})});
  }
  const handoff=(b,{database=db,ids=b.visits.slice(-1).map(v=>v.id),replacement=otherId,key=randomUUID(),reason="Coverage",actor=operatorId}={})=>handoffSelectedVisitsWithDb({db:database,bookingId:b.id,visitIds:ids,sitterId:replacement,actorId:actor,operationId:key,reason});
  async function ready(options){const b=await create(options);assert.equal((await confirm(b)).ok,true);return load(b.id);}
  async function reward(b) {
    const [{now}]=await db.$queryRaw`SELECT clock_timestamp() AS "now"`;
    const event=await db.sitterRewardEvent.create({data:{sitterId,type:"OPERATOR_PROGRESS_ADJUSTMENT",rewardCycle:0,progressDelta:0,occurredAt:now,reason:marker}});
    const grant=await db.sitterRewardGrant.create({data:{sitterId,rewardLevel:1,feeBasisPoints:500,maximumUses:10,triggerEventId:event.id,startsAt:new Date(+now-60000),expiresAt:new Date(+now+3600000)}});
    await db.sitterRewardAccount.upsert({where:{sitterId},create:{sitterId,rewardLevel:1,currentGrantId:grant.id},update:{currentGrantId:grant.id}});
    assert.equal((await reserveRewardForBookingWithDb({db,bookingId:b.id})).status,"RESERVED");
  }
  function wrapped(failModel,failOperation,{forbidRates=false}={}) {
    return {$transaction:(work,options)=>db.$transaction(tx=>work(new Proxy(tx,{get(target,key){
      if(forbidRates && ["sitterCareRate","defaultSitterCareRate"].includes(key)) throw new Error("Rate lookup forbidden");
      if(key!==failModel)return Reflect.get(target,key);
      return new Proxy(target[key],{get(delegate,op){if(op!==failOperation)return delegate[op];return async(...args)=>{await delegate[op](...args);throw new Error("FORCED_ROLLBACK");};}});
    }})),options)};
  }
    async function orderedRace(first, second, lockTable = "Booking") {
      let locked, attempted, firstPid, secondPid;
      const ready = new Promise((resolve) => { locked = resolve; });
      const attempt = new Promise((resolve) => { attempted = resolve; });
      let observed = false;
      function wrapped(leader) {
        let gated = false;
        return { $transaction: (work, options) => db.$transaction(async (tx) => {
          const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
          if (leader) firstPid = pid; else secondPid = pid;
          return work(new Proxy(tx, { get(target, key) {
            if (key !== "$queryRaw") return Reflect.get(target, key);
            return async (parts, ...values) => {
              if (gated || (!parts.join("?").includes("FOR UPDATE") || !parts.join("?").includes(`"${lockTable}"`))) return target.$queryRaw(parts, ...values);
              gated = true;
              if (!leader) {
                const pending = target.$queryRaw(parts, ...values).then((value) => value);
                attempted(); return pending;
              }
              const result = await target.$queryRaw(parts, ...values); locked(); await attempt;
              for (let i = 0; i < 80; i++) {
                const [{ blockers }] = await target.$queryRaw`SELECT pg_blocking_pids(${secondPid}::int) AS blockers`;
                if (blockers.includes(firstPid)) { observed = true; break; }
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              assert(observed, "Follower must actually wait on leader's PostgreSQL lock");
              return result;
            };
          } }));
        }, { ...options, timeout: 30000 }) };
      }
      const a = first(wrapped(true));
      // Always consume failures, including when the leader fails before its lock.
      await Promise.race([ready, a.then(() => { throw new Error("Leader did not acquire a lifecycle lock"); })]);
      const b = second(wrapped(false));
      const results = await Promise.allSettled([a, b]); assert(observed); return results;
    }
  try {
    process.env.BUSINESS_OWNER_OPERATOR_USER_ID=operatorId;process.env.BUSINESS_OWNER_SITTER_USER_ID=ownerId;
    await db.user.createMany({data:[operatorId,sitterId,ownerId,otherId].map(id=>({id,role:id===operatorId?"OPERATOR":"SITTER",email:`${id}@example.invalid`}))});
    const f=optionFixture(),{id:_oid,speciesPolicies,...offering}=f.offering,{id:_rid,petCharges,...rate}=f.clientRate;
    option=await db.careOption.create({data:{code:`${marker}-option`,label:f.label,primarySpecies:"Dog",durationMinutes:30,
      offering:{create:{...offering,code:`${marker}-offering`,speciesPolicies:{create:speciesPolicies}}},
      clientRate:{create:{...rate,setByUserId:operatorId,petCharges:{create:petCharges}}},
      defaultSitterRate:{create:{baseCompensationCents:2000,version:4,setByUserId:operatorId,petCharges:{create:[{species:"Dog",includedCount:1,additionalCents:400}]}}}
    },include:{defaultSitterRate:true,clientRate:true}});
    ({publicCode}=await createSitterReferralCode({db,sitterId,operatorUserId:operatorId}));

    for(const count of [1,2]) await t.test(`${count} selected units hand off atomically, preserving lead, history, unselected and earned rows`,async()=>{
      const b=await ready({quantity:4});assert.equal((await finish(b)).ok,true);const before=await load(b.id);
      const ids=b.visits.slice(-count).map(v=>v.id),key=randomUUID();const result=await handoff(b,{ids,key});assert.equal(result.ok,true,JSON.stringify(result));
      const after=await load(b.id);assert.equal(after.sitterId,sitterId);assert.equal(after.status,"CONFIRMED");assert.deepEqual(after.sitterCompensation,before.sitterCompensation);
      for(let i=0;i<4;i++){const v=after.visits[i];if(!ids.includes(v.id)){assert.deepEqual(v,before.visits[i]);continue;}
        assert.equal(v.sitterId,otherId);assert.equal(v.performedBySitterId,null);assert.deepEqual(v.compensationAuthorizations[0],before.visits[i].compensationAuthorizations[0]);
        const a=activeAuthorization(v);assert.equal(a.revision,2);assert.equal(a.predecessorId,v.compensationAuthorizations[0].id);assert.equal(a.sitterPayoutCents,1800);assert(a.authorizedAt<v.startTime);
      }
      assert.equal(careReadiness(after).ok,true);const h=await db.bookingHistory.findMany({where:{bookingId:b.id,note:{contains:`handoff:${key}`}}});assert.equal(h.length,1);
      const replay=await handoff(b,{ids:ids.toReversed(),key});assert.equal(replay.code,"HANDOFF_REPLAY");assert.deepEqual(replay.assignments,result.assignments);
      assert.equal((await handoff(b,{ids,key,replacement:ownerId})).code,"HANDOFF_OPERATION_CONFLICT");
      assert.equal((await handoff(b,{ids:[b.visits[1].id],key})).code,"HANDOFF_OPERATION_CONFLICT");
      assert.deepEqual(await load(b.id),after);
    });
    for(const [name,data] of [["completed",{status:"COMPLETED",completedAt:new Date()}],["performed",{performedBySitterId:sitterId}],["canceled",{status:"CANCELED"}],["started",{startTime:new Date(Date.now()-1000)}]]) await t.test(`${name} selected Visit rejects complete transaction`,async()=>{
      const b=await ready({quantity:2});
      if(name === "started") {
        // Seed only this isolated fixture as valid historical authorized care.
        // This exercises the clock cutoff independently of readiness corruption.
        const [{now}]=await db.$queryRaw`SELECT clock_timestamp() AS "now"`;
        const authorizedAt=new Date(+now-120000),startTime=new Date(+now-60000);
        await cleanupVisitFinance(db,[b.id]);
        await db.bookingPricingSnapshot.update({where:{bookingId:b.id},data:{committedAt:new Date(+authorizedAt-60000)}});
        await db.bookingSitterCompensation.update({where:{bookingId:b.id},data:{committedAt:authorizedAt}});
        await db.visit.update({where:{id:b.visits[1].id},data:{startTime,endTime:new Date(+startTime+1800000)}});
        for(const v of b.visits) {
          const {petCharges,void:_void,...row}=v.compensationAuthorizations[0];
          await db.visitSitterCompensationAuthorization.create({data:{...row,authorizedAt,
            petCharges:{create:petCharges.map(({id:_id,authorizationId:_auth,...p})=>p)}}});
        }
        assert.equal(careReadiness(await load(b.id)).ok,true);
      } else await db.visit.update({where:{id:b.visits[1].id},data});
      const before=await load(b.id),result=await handoff(b,{ids:b.visits.map(v=>v.id)});
      assert.equal(result.ok,false);if(name === "started")assert.equal(result.code,"HANDOFF_AFTER_START_REQUIRES_REVIEW");assert.deepEqual(await load(b.id),before);
    });
    for(const status of ["REQUESTED","CANCELED","COMPLETED"]) await t.test(`${status} Booking rejected`,async()=>{const b=await ready();await db.booking.update({where:{id:b.id},data:{status}});const before=await load(b.id);assert.equal((await handoff(b)).ok,false);assert.deepEqual(await load(b.id),before);});
    await t.test("earned allocation and unrelated selection are never rewritten",async()=>{const b=await ready({quantity:2});await finish(b);const before=await load(b.id);assert.equal((await handoff(b,{ids:[b.visits[0].id]})).ok,false);assert.equal((await handoff(b,{ids:["unrelated"]})).ok,false);assert.deepEqual(await load(b.id),before);});
    await t.test("replacement-specific override and pet rules are frozen",async()=>{
      const b=await ready({pets:[{name:"A",species:"Dog"},{name:"B",species:"Dog"}]});
      const rate=await db.sitterCareRate.create({data:{careOptionId:option.id,sitterId:otherId,baseCompensationCents:1900,includedPetCount:1,version:7,setByUserId:operatorId,petCharges:{create:[{species:"Dog",includedCount:1,additionalCents:300}]}}});
      try{assert.equal((await handoff(b)).ok,true);const a=activeAuthorization((await load(b.id)).visits[0]);assert.equal(a.rateSource,"SITTER_OVERRIDE");assert.equal(a.sourceRateId,rate.id);assert.equal(a.rateVersion,7);assert.equal(a.sitterBaseCents,1900);assert.equal(a.sitterPetCents,300);assert.equal(a.sitterPayoutCents,1980);
        await db.sitterCareRate.update({where:{id:rate.id},data:{baseCompensationCents:1}});const result=await finish(await load(b.id),{performer:otherId,database:wrapped(null,null,{forbidRates:true})});assert.equal(result.allocation.sitterPayoutCents,1980);
      }finally{await db.sitterCareRate.delete({where:{id:rate.id}});}
    });
    await t.test("owner replacement is 0 percent with no rate lookup or reward inheritance",async()=>{const b=await ready();const result=await handoff(b,{replacement:ownerId,database:wrapped(null,null,{forbidRates:true})});assert.equal(result.ok,true,JSON.stringify(result));const a=activeAuthorization((await load(b.id)).visits[0]);assert.equal(a.sitterFeeBasisPoints,0);assert.equal(a.sitterPayoutCents,2500);assert.equal(a.sourceRateId,null);assert.equal(a.rewardReservationId,null);});
    await t.test("reward stays consumed, replacement pays ten percent, return restores original entitlement without consumption",async()=>{
      const b=await create({quantity:2});await reward(b);await confirm(b);const before=await load(b.id),reservation=await db.sitterRewardReservation.findUnique({where:{bookingId:b.id}});
      assert.equal((await handoff(b)).ok,true);let after=await load(b.id),a=activeAuthorization(after.visits[1]);assert.equal(a.sitterFeeBasisPoints,1000);assert.equal(a.rewardGrantId,null);assert.deepEqual(after.visits[1].compensationAuthorizations[0],before.visits[1].compensationAuthorizations[0]);
      assert.equal((await handoff(b,{replacement:sitterId})).ok,true);after=await load(b.id);a=activeAuthorization(after.visits[1]);assert.equal(a.revision,3);assert.equal(a.sitterFeeBasisPoints,500);assert.equal(a.rewardReservationId,reservation.id);assert.deepEqual(await db.sitterRewardReservation.findUnique({where:{bookingId:b.id}}),reservation);
    });
    await t.test("replacement availability rejects overlap and accepts strict back-to-back including cross-midnight",async()=>{
      const b=await ready({quantity:2});const start=new Date(b.visits[0].startTime);start.setUTCHours(23,30,0,0);const end=new Date(+start+7200000);
      await db.visit.update({where:{id:b.visits[0].id},data:{startTime:start,endTime:end}});
      const blocker=await ready();await db.visit.update({where:{id:blocker.visits[0].id},data:{sitterId:otherId,startTime:new Date(+end-1000),endTime:new Date(+end+3600000)}});
      assert.equal((await handoff(b,{ids:[b.visits[0].id]})).code,"SITTER_UNAVAILABLE");
      await db.visit.update({where:{id:blocker.visits[0].id},data:{startTime:end}});assert.equal((await handoff(b,{ids:[b.visits[0].id]})).ok,true);
    });
    await t.test("replacement bounded DTO, revoked access, lead access, role checks and cancellation denial",async()=>{
      const b=await ready({quantity:3});assert.equal((await handoff(b)).ok,true);const current=await load(b.id);
      assert.deepEqual(participantCareDto(current,sitterId),{kind:"LEAD",bookingId:b.id,useLeadView:true});
      current.visits[2].sitter = { id: otherId, name: "Replacement" };
      const visible=leadVisibleVisits(current,sitterId);assert.equal(visible.length,3);assert.equal(visible[2].scheduledSitterName,"Replacement");assert.equal(visible[2].ownMoney,null);assert.equal(visible[2].canExecute,false);
      assert.equal(visible.reduce((sum,v)=>sum+(v.ownMoney?.payoutCents??0),0),4500);
      assert.equal((await finish(b,{performer:sitterId,index:2})).ok,false);
      const dto=await resolveSitterBookingParticipationWithDb({db,bookingId:b.id,userId:otherId});assert.equal(dto.kind,"VISIT_PARTICIPANT");assert.equal(dto.visits.length,1);assert.equal(dto.visits[0].id,b.visits[2].id);assert.equal(dto.visits[0].money.payoutCents,1800);
      for(const forbidden of ["sitterCompensation","rewardReservation","compensationAuthorizations","compensationAllocation","conversation","history","clientLinkToken","notes"])assert(!JSON.stringify(dto).includes(`"${forbidden}"`));
      assert.equal(await resolveSitterBookingParticipationWithDb({db,bookingId:b.id,userId:ownerId}),null);assert.equal(await resolveSitterBookingParticipationWithDb({db,bookingId:b.id,userId:operatorId}),null);
      assert.equal((await finish(b,{performer:otherId})).ok,false);assert.equal((await cancelCanonicalBookingWithDb({db,bookingId:b.id,actorId:otherId,reason:"Must deny"})).status,"NOT_AUTHORIZED");
      assert.equal((await handoff(b,{actor:otherId,replacement:ownerId})).code,"NOT_AUTHORIZED");
      assert.equal(await db.conversationParticipant.count({where:{userId:otherId}}),0);
      assert.equal((await handoff(b,{replacement:sitterId})).ok,true);assert.equal(await resolveSitterBookingParticipationWithDb({db,bookingId:b.id,userId:otherId}),null);
    });
    await t.test("split completion earns own terms, preserves prior allocation, auto-completes and grants no split reward credit",async()=>{
      const b=await ready({quantity:2});const first=await finish(b);assert.equal(first.ok,true);assert.equal((await handoff(b)).ok,true);
      const second=await finish(b,{performer:otherId,index:1});assert.equal(second.ok,true);assert.equal(second.allocation.sitterPayoutCents,1800);assert.equal(second.allocation.performedBySitterId,otherId);
      const after=await load(b.id);assert.equal(after.status,"COMPLETED");assert.deepEqual(after.visits[0].compensationAllocation,first.allocation);assert.equal(evaluateRewardQualification(after,{id:sitterId,role:"SITTER"}).reasonCode,"PERFORMER_MISMATCH");
      assert.equal((await finish(b,{performer:sitterId,index:1})).ok,false);assert.equal((await finish(b,{performer:otherId,index:1})).allocation.id,second.allocation.id);
    });
    await t.test("operator mismatched performer after handoff produces review without allocation",async()=>{const b=await ready();await handoff(b);await db.visit.update({where:{id:b.visits[0].id},data:{performedBySitterId:sitterId}});const result=await finish(b,{role:"OPERATOR"});assert.equal(result.ok,true);assert.equal(result.allocation,null);assert.equal(result.financialReview.reason,"PERFORMER_AUTHORIZATION_MISMATCH");});
    for(const [model,op] of [["visitSitterCompensationAuthorization","create"],["visit","update"],["bookingHistory","create"]]) await t.test(`forced ${model} failure rolls back selected assignments, revisions and history`,async()=>{const b=await ready({quantity:2});const before=await load(b.id),n=await db.bookingHistory.count({where:{bookingId:b.id}});assert.equal((await handoff(b,{ids:b.visits.map(v=>v.id),database:wrapped(model,op)})).ok,false);assert.deepEqual(await load(b.id),before);assert.equal(await db.bookingHistory.count({where:{bookingId:b.id}}),n);});
    for(const firstHandoff of [false,true]) await t.test(`handoff vs final completion/allocation synchronized, handoff first=${firstHandoff}`,async()=>{
      const b=await ready();const h=d=>handoff(b,{database:d,ids:[b.visits[0].id]}),c=d=>finish(b,{database:d});const results=await orderedRace(firstHandoff?h:c,firstHandoff?c:h);
      assert.equal(results[0].value.ok,true);assert.equal(results[1].value.ok,false);const after=await load(b.id),v=after.visits[0];assert.equal(v.sitterId,firstHandoff?otherId:sitterId);assert.equal(activeAuthorization(v).sitterId,v.sitterId);assert.equal(v.performedBySitterId,firstHandoff?null:sitterId);assert.equal(Boolean(v.compensationAllocation),!firstHandoff);
    });
    for(const firstHandoff of [false,true]) await t.test(`handoff vs cancellation synchronized, handoff first=${firstHandoff}`,async()=>{
      const b=await ready({quantity:2});const h=d=>handoff(b,{database:d}),c=d=>cancelCanonicalBookingWithDb({db:d,bookingId:b.id,actorId:operatorId,reason:"Coverage canceled"});const results=await orderedRace(firstHandoff?h:c,firstHandoff?c:h);
      assert.equal(results[0].value.ok,true);assert.equal(results[1].value.ok,firstHandoff);const after=await load(b.id);assert.equal(after.status,"CANCELED");assert(after.visits.every(v=>activeAuthorization(v)===null));
    });
    for(const firstHandoff of [false,true]) await t.test(`handoff vs missed review synchronized, handoff first=${firstHandoff}`,async()=>{
      const b=await ready({quantity:2});const h=d=>handoff(b,{database:d}),m=d=>reviewMissedVisitWithDb({db:d,visitId:b.visits[1].id,actorId:operatorId,status:"EXCUSED",note:"Not overdue"});const results=await orderedRace(firstHandoff?h:m,firstHandoff?m:h);
      assert.equal(results[firstHandoff?0:1].value.ok,true);assert.equal(results[firstHandoff?1:0].value.ok,false);const v=(await load(b.id)).visits[1];assert.equal(v.status,"CONFIRMED");assert.equal(activeAuthorization(v).sitterId,v.sitterId);
    });
    await t.test("synchronized identical operation replays once",async()=>{const b=await ready(),key=randomUUID();const results=await orderedRace(d=>handoff(b,{database:d,key}),d=>handoff(b,{database:d,key}));assert(results.every(r=>r.value.ok));assert.deepEqual(results[0].value.assignments,results[1].value.assignments);assert.equal((await load(b.id)).visits[0].compensationAuthorizations.length,2);});
    await t.test("synchronized different handoffs form one unbroken immutable revision chain",async()=>{const b=await ready();const results=await orderedRace(d=>handoff(b,{database:d}),d=>handoff(b,{database:d,replacement:ownerId}));assert(results.every(r=>r.value.ok));const v=(await load(b.id)).visits[0];assert.equal(v.sitterId,ownerId);assert.equal(v.compensationAuthorizations.length,3);assert.equal(activeAuthorization(v).sitterId,ownerId);assert.equal(careReadiness(await load(b.id)).ok,true);});

  } finally {
    envKeys.forEach((k,i)=>{if(oldEnv[i]===undefined)delete process.env[k];else process.env[k]=oldEnv[i];});
    try {
      const bookings=await db.booking.findMany({where:{operatorId},select:{id:true,clientId:true}}),bookingIds=bookings.map(b=>b.id),clientIds=bookings.map(b=>b.clientId);
      await db.$transaction(async tx=>{
        await cleanupVisitFinance(tx,bookingIds);
        await tx.bookingSitterCompensationPetCharge.deleteMany({where:{compensation:{bookingId:{in:bookingIds}}}});await tx.bookingSitterCompensation.deleteMany({where:{bookingId:{in:bookingIds}}});
        await tx.sitterRewardReservation.deleteMany({where:{bookingId:{in:bookingIds}}});await tx.sitterRewardAccount.deleteMany({where:{sitterId}});await tx.sitterRewardGrant.deleteMany({where:{sitterId}});await tx.sitterRewardEvent.deleteMany({where:{sitterId}});
        await tx.message.deleteMany({where:{conversation:{bookingId:{in:bookingIds}}}});await tx.conversation.deleteMany({where:{bookingId:{in:bookingIds}}});
        await tx.visit.deleteMany({where:{bookingId:{in:bookingIds}}});await tx.bookingHistory.deleteMany({where:{bookingId:{in:bookingIds}}});await tx.booking.deleteMany({where:{id:{in:bookingIds}}});
        await tx.clientOrigin.deleteMany({where:{clientId:{in:clientIds}}});await tx.client.deleteMany({where:{id:{in:clientIds}}});await tx.sitterReferralCode.deleteMany({where:{sitterId}});
        if(option){await tx.careOption.delete({where:{id:option.id}});await tx.careOffering.delete({where:{id:option.offeringId}});}await tx.user.deleteMany({where:{id:{in:[operatorId,sitterId,ownerId,otherId]}}});
      },{timeout:30000});
      assert.deepEqual(await compensationProtectedState(db),baseline);console.log("Visit compensation QA: protected state exactly restored; synchronized lock races verified.");
    } finally {await db.$disconnect();}
  }
});
