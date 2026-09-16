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
import { commitBookingSitterCompensationWithDb } from "../compensation/commitBookingSitterCompensation.js";
import { completeVisitWithDb } from "../economics/completionService.js";
import { reviewMissedVisitWithDb } from "../../visits/reviewMissedVisit.js";
import { cancelCanonicalBookingWithDb } from "../cancellation/canonicalCancellation.js";
import { economicsInclude } from "../economics/bookingEconomics.js";
import { visitFinancialInclude, distributeClientUnits } from "./contract.js";
import { careReadiness } from "./readiness.js";

test("PostgreSQL atomic canonical readiness, owner terms, allocations and forced races", {
  skip: process.env.TASKWHISKER_VISIT_COMPENSATION_QA_TESTS !== "1", timeout: 600000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db=new PrismaClient(), marker=`visit-finance-qa-${randomUUID()}`;
  const operatorId=`${marker}-operator`, sitterId=`${marker}-sitter`, ownerId=`${marker}-owner`, otherId=`${marker}-other`;
  const baseline=await compensationProtectedState(db);
  const envKeys=["BUSINESS_OWNER_OPERATOR_USER_ID","BUSINESS_OWNER_SITTER_USER_ID","DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID"];
  const oldEnv=envKeys.map(k=>process.env[k]);
  let option, publicCode, ordinal=0;
  const load=id=>db.booking.findUnique({where:{id},include:{...economicsInclude,visits:{orderBy:{canonicalUnitPosition:"asc"},include:visitFinancialInclude},sitterCompensation:{include:{petCharges:true}}}});
  const confirm=(b,database=db)=>confirmBookingWithDb({db:database,bookingId:b.id,actorId:operatorId});
  const finish=(b,{database=db,role="SITTER",performer=sitterId}={})=>completeVisitWithDb({db:database,visitId:b.visits[0].id,actorId:role==="SITTER"?performer:operatorId,actorRole:role,now:new Date(+b.visits[0].startTime+1000)});
  async function create({business=false,owner=false,quantity=1,pets=bookingInput().pets}={}) {
    process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID=owner?ownerId:sitterId;
    const schedule=timedSchedule(quantity), offset=++ordinal*7*86400000;
    schedule.visits=schedule.visits.map(v=>({...v,date:new Date(Date.parse(`${v.date}T00:00:00Z`)+offset).toISOString().slice(0,10)}));
    return createCanonicalBookingWithDb({db,operatorId,creationKey:randomUUID(),input:bookingInput({client:{name:"Visit finance QA",email:`${marker}-${randomUUID()}@example.invalid`},careOptionCode:option.code,pets,schedule,...(business||owner?{}:{referralCode:publicCode,requestReferringSitter:true})})});
  }
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
    for(const policy of ["owner","ordinary","reward","business"]) await t.test(`${policy} confirmation atomically creates commitment and every positioned authorization`,async()=>{
      const b=await create({owner:policy==="owner",business:policy==="business",quantity:4,pets:[{name:"A",species:"Dog"},{name:"B",species:"Dog"}]});
      if(policy==="reward")await reward(b);
      const result=await confirm(b,policy==="owner"?wrapped(null,null,{forbidRates:true}):db);assert.equal(result.code,"CONFIRMED");
      const after=await load(b.id),c=after.sitterCompensation,bps=policy==="owner"?0:policy==="reward"?500:1000;
      assert.equal(after.status,"CONFIRMED");assert.equal(c.sitterFeeBasisPoints,bps);assert.equal(c.sitterPayoutCents,policy==="owner"?12000:policy==="reward"?11400:policy==="business"?8640:10800);
      assert.equal(careReadiness(after).ok,true);assert.equal(after.visits.length,4);
      after.visits.forEach((v,i)=>{assert.equal(v.canonicalUnitPosition,i);assert.equal(v.compensationAuthorizations.length,1);const a=v.compensationAuthorizations[0];assert.equal(a.sitterFeeBasisPoints,bps);assert.equal(a.revision,1);assert(a.authorizedAt<v.startTime);assert.equal(a.sitterId,v.sitterId);});
      for(const [unit,aggregate] of [["unitBaseCents","baseAggregateCents"],["unitAdditionalPetCents","additionalPetAggregateCents"],["unitServiceSubtotalCents","serviceSubtotalCents"]])assert.equal(after.visits.reduce((n,v)=>n+v.compensationAuthorizations[0][unit],0),after.pricingSnapshot[aggregate]);
      if(policy==="owner"){assert.equal(c.rewardApplied,false);assert.equal(c.rewardReservationId,null);assert.equal(c.sourceRateId,null);}
      if(policy==="reward")assert.equal(after.rewardReservation.status,"CONSUMED");
      const history=await db.bookingHistory.count({where:{bookingId:b.id,toStatus:"CONFIRMED"}});assert.equal(history,1);
      assert.equal((await confirm(b)).code,"ALREADY_CONFIRMED");assert.deepEqual(await load(b.id),after);
    });
    for(const [model,operation] of [["bookingSitterCompensation","create"],["visitSitterCompensationAuthorization","create"],["sitterRewardReservation","updateMany"],["bookingHistory","create"]])await t.test(`failure after ${model} rolls all readiness and reward writes back`,async()=>{
      const b=await create({quantity:3});await reward(b);const before=await load(b.id),history=await db.bookingHistory.count({where:{bookingId:b.id}});
      assert.equal((await confirm(b,wrapped(model,operation))).ok,false);
      assert.deepEqual(await load(b.id),before);assert.equal(await db.bookingHistory.count({where:{bookingId:b.id}}),history);
      assert.equal(await db.visitSitterCompensationAuthorization.count({where:{bookingId:b.id}}),0);
      assert.equal((await confirm(b)).ok,true);
    });
    await t.test("normal standalone writer still refuses REQUESTED",async()=>{const b=await create();await assert.rejects(commitBookingSitterCompensationWithDb({db,bookingId:b.id}),{code:"BOOKING_NOT_COMMITTABLE"});assert.equal((await load(b.id)).sitterCompensation,null);});
    await t.test("CONFIRMED missing financial readiness cannot replay or perform retroactive repair",async()=>{
      const b=await create();await db.booking.update({where:{id:b.id},data:{status:"CONFIRMED"}});await db.visit.updateMany({where:{bookingId:b.id},data:{status:"CONFIRMED"}});
      assert.equal((await confirm(b)).code,"FINANCIAL_READINESS_MISSING");assert.equal((await finish(b)).code,"FINANCIAL_READINESS_MISSING");
      assert.equal((await load(b.id)).visits[0].status,"CONFIRMED");assert.equal(await db.visitFinancialReview.count({where:{visitId:b.visits[0].id}}),1);
      await finish(b);assert.equal(await db.visitFinancialReview.count({where:{visitId:b.visits[0].id}}),1);
    });
    await t.test("missing authorization with existing commitment fails confirmed replay and completion",async()=>{
      const b=await create();await confirm(b);await cleanupVisitFinance(db,[b.id]);const before=await load(b.id);
      assert.equal(careReadiness(before).ok,false);assert.equal((await confirm(b)).code,"FINANCIAL_READINESS_MISSING");assert.equal((await finish(b)).ok,false);
      assert.deepEqual((await load(b.id)).sitterCompensation,before.sitterCompensation);assert.equal(await db.visitSitterCompensationAllocation.count({where:{visitId:b.visits[0].id}}),0);
    });
    await t.test("matching performer allocates frozen terms without rate lookup and retries unchanged",async()=>{
      const b=await create({business:true});await confirm(b);const before=await load(b.id),a=before.visits[0].compensationAuthorizations[0];
      await db.defaultSitterCareRate.update({where:{id:option.defaultSitterRate.id},data:{baseCompensationCents:999999,version:5}});
      try { const result=await finish(b,{database:wrapped(null,null,{forbidRates:true})});assert.equal(result.ok,true);assert.equal(result.allocation.authorizationId,a.id);assert.equal(result.allocation.sitterPayoutCents,a.sitterPayoutCents);
        const retry=await finish(b);assert.equal(retry.alreadyCompleted,true);assert.deepEqual(retry.allocation,result.allocation);
      } finally {await db.defaultSitterCareRate.update({where:{id:option.defaultSitterRate.id},data:{baseCompensationCents:2000,version:4}});}
    });
    for(const mismatch of [false,true])await t.test(`operator truth persists with ${mismatch?"mismatched":"null"} performer and durable review`,async()=>{
      const b=await create();await confirm(b);
      if(mismatch)await db.visit.update({where:{id:b.visits[0].id},data:{performedBySitterId:otherId}});
      const result=await finish(b,{role:"OPERATOR"});assert.equal(result.ok,true);assert.equal(result.allocation,null);assert.equal(result.financialReview.reason,mismatch?"PERFORMER_AUTHORIZATION_MISMATCH":"PERFORMER_REQUIRED_FOR_ALLOCATION");
      const again=await finish(b,{role:"OPERATOR"});assert.equal(again.financialReview.id,result.financialReview.id);assert.equal((await load(b.id)).visits[0].status,"COMPLETED");
    });
    await t.test("duplicate completion race produces one immutable allocation",async()=>{
      const b=await create();await confirm(b);const results=await orderedRace(d=>finish(b,{database:d}),d=>finish(b,{database:d}));assert(results.every(r=>r.status==="fulfilled"&&r.value.ok));
      assert.equal(results[0].value.allocation.id,results[1].value.allocation.id);assert.equal(await db.visitSitterCompensationAllocation.count({where:{visitId:b.visits[0].id}}),1);
      await assert.rejects(db.visitSitterCompensationAllocation.update({where:{visitId:b.visits[0].id},data:{sitterPayoutCents:1}}));
    });
    for(const completionFirst of [false,true])await t.test(`missed-review vs completion lock race, completion first=${completionFirst}`,async()=>{
      // Existing missed review semantics also apply to legacy visits. Persist real overdue times.
      const parent=await create(),now=new Date(),b=await db.booking.create({data:{clientId:parent.clientId,operatorId,sitterId,status:"CONFIRMED",startTime:new Date(+now-7200000),endTime:new Date(+now-3600000),clientTotalCents:2750,platformFeeCents:500,sitterPayoutCents:2250,
        visits:{create:{operatorId,sitterId,status:"CONFIRMED",date:now,startTime:new Date(+now-7200000),endTime:new Date(+now-3600000)}}},include:{visits:true}});
      const complete=d=>completeVisitWithDb({db:d,visitId:b.visits[0].id,actorId:sitterId,actorRole:"SITTER",lateReason:"QA delayed reporting evidence"});
      const review=d=>reviewMissedVisitWithDb({db:d,visitId:b.visits[0].id,actorId:operatorId,status:"EXCUSED",note:"QA missed review"});
      const results=await orderedRace(completionFirst?complete:review,completionFirst?review:complete);assert.equal(results[0].value.ok,true);assert.equal(results[1].value.ok,false);
      const v=await db.visit.findUnique({where:{id:b.visits[0].id}});assert.equal(v.status,completionFirst?"COMPLETED":"CANCELED");assert.equal(v.performedBySitterId,completionFirst?sitterId:null);assert.equal(Boolean(v.completedAt),completionFirst);
    });
    for (const completionFirst of [false, true]) await t.test(`canonical missed review vs earned allocation, completion first=${completionFirst}`, async () => {
      const b = await create(); await confirm(b);
      // Seed ONLY this disposable fixture as historical authorized care. This is
      // not an application repair: production has no authorization rewrite API.
      const snapshot = await load(b.id), original = snapshot.visits[0].compensationAuthorizations[0];
      const now = new Date(), start = new Date(+now - 7200000), end = new Date(+now - 3600000), authorizedAt = new Date(+start - 60000);
      await cleanupVisitFinance(db, [b.id]);
      await db.bookingPricingSnapshot.update({ where: { bookingId: b.id }, data: { committedAt: new Date(+authorizedAt - 60000) } });
      await db.bookingSitterCompensation.update({ where: { bookingId: b.id }, data: { committedAt: authorizedAt } });
      await db.visit.update({ where: { id: b.visits[0].id }, data: { startTime: start, endTime: end } });
      const { petCharges, void: _void, ...data } = original;
      await db.visitSitterCompensationAuthorization.create({ data: { ...data, authorizedAt,
        petCharges: { create: petCharges.map(({ id: _id, authorizationId: _authId, ...charge }) => charge) } } });
      const complete = d => completeVisitWithDb({ db: d, visitId: b.visits[0].id, actorId: sitterId, actorRole: "SITTER", lateReason: "QA delayed completion evidence" });
      const review = d => reviewMissedVisitWithDb({ db: d, visitId: b.visits[0].id, actorId: operatorId, status: "EXCUSED", note: "QA canonical missed review" });
      const results = await orderedRace(completionFirst ? complete : review, completionFirst ? review : complete);
      assert.equal(results[0].value.ok, true); assert.equal(results[1].value.ok, false);
      const after = await load(b.id), visit = after.visits[0];
      assert.equal(visit.status, completionFirst ? "COMPLETED" : "CANCELED");
      assert.equal(visit.performedBySitterId, completionFirst ? sitterId : null);
      assert.equal(Boolean(visit.compensationAllocation), completionFirst);
      assert.equal(Boolean(visit.compensationAuthorizations[0].void), !completionFirst);
    });
    await t.test("a competing different performer cannot claim an authorized Visit", async () => {
      const b = await create(); await confirm(b);
      const results = await orderedRace(d => finish(b, { database: d }), d => finish(b, { database: d, performer: otherId }));
      assert.equal(results[0].value.ok, true); assert.equal(results[1].value.ok, false);
      const after = await load(b.id); assert.equal(after.visits[0].compensationAllocation.performedBySitterId, sitterId);
    });
    await t.test("pre-service cancellation voids authorization without earnings or reward release",async()=>{
      const b=await create();await reward(b);await confirm(b);assert.equal((await cancelCanonicalBookingWithDb({db,bookingId:b.id,actorId:operatorId,reason:"QA cancellation"})).ok,true);
      const after=await load(b.id);assert(after.visits[0].compensationAuthorizations[0].void);assert.equal(after.visits[0].compensationAllocation,null);assert.equal(after.rewardReservation.status,"CONSUMED");
    });
    await t.test("positions and frozen authorizations reject mutation in PostgreSQL",async()=>{const b=await create();await confirm(b);await assert.rejects(db.visit.update({where:{id:b.visits[0].id},data:{canonicalUnitPosition:9}}));await assert.rejects(db.visitSitterCompensationAuthorization.updateMany({where:{bookingId:b.id},data:{sitterPayoutCents:0}}));});
    await t.test("remainder distribution reconstructs frozen PostgreSQL integer aggregates",async()=>{
      const [p]=await db.$queryRaw`SELECT 4::int AS quantity, 10003::int AS "baseAggregateCents", 2001::int AS "additionalPetAggregateCents", 12004::int AS "serviceSubtotalCents"`;
      const units=distributeClientUnits(p);assert.deepEqual(units.map(u=>u.unitBaseCents),[2501,2501,2501,2500]);assert.deepEqual(units.map(u=>u.unitAdditionalPetCents),[501,500,500,500]);assert.equal(units.reduce((n,u)=>n+u.unitServiceSubtotalCents,0),12004);
    });
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
