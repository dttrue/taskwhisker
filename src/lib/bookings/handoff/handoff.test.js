import test from "node:test";
import assert from "node:assert/strict";
import { compensationFixture } from "../compensation/fixtures.js";
import { normalizeHandoff, validateHandoff } from "./contract.js";
import { participantCareDto, participationKind, ownVisitMoney, leadVisibleVisits } from "./participation.js";
import { activeAuthorization } from "../visitCompensation/contract.js";
const input = () => normalizeHandoff({ bookingId: "booking", visitIds: ["visit-1", "visit-0"], sitterId: "bob", actorId: "operator", operationId: "operation", reason: "Coverage" });
async function fixture() { const f = compensationFixture({ quantity: 4 }); await f.commit(); f.state.booking.rewardReservation = null; return f; }
test("operation identity is stable for reordered selections and distinct for payload changes", () => {
 const a=input(); assert.deepEqual(a.visitIds,["visit-0","visit-1"]);
 assert.equal(a.fingerprint,normalizeHandoff({...a,operationId:"operation",visitIds:a.visitIds.toReversed()}).fingerprint);
 assert.notEqual(a.fingerprint,normalizeHandoff({...a,operationId:"operation",sitterId:"alice"}).fingerprint);
 assert.throws(()=>normalizeHandoff({...a,visitIds:["visit-0","visit-0"]}));
});
for(const [label,change] of [
 ["requested",b=>b.status="REQUESTED"],["completed booking",b=>b.status="COMPLETED"],["canceled booking",b=>b.status="CANCELED"],
 ["completed visit",b=>b.visits[0].status="COMPLETED"],["performed visit",b=>b.visits[0].performedBySitterId="sitter"],
 ["allocated visit",b=>b.visits[0].compensationAllocation={id:"earned"}],["canceled visit",b=>b.visits[0].status="CANCELED"],
 ["missing authorization",b=>b.visits[0].compensationAuthorizations=[]],["started",b=>b.visits[0].startTime=new Date("2026-09-13T12:00:01Z")],
]) test(`${label} rejects entire selection`,async()=>{const f=await fixture();change(f.state.booking);if(label === "started") { f.state.now = new Date("2026-09-13T12:00:02Z"); assert.throws(()=>validateHandoff(f.state.booking,input(),f.state.now), { code: "HANDOFF_AFTER_START_REQUIRES_REVIEW" }); } else assert.throws(()=>validateHandoff(f.state.booking,input(),f.state.now));});
test("eligibility preserves inputs and rejects unknown Visits",async()=>{const f=await fixture(),before=structuredClone(f.state.booking);assert.equal(validateHandoff(f.state.booking,input(),f.state.now).length,2);assert.deepEqual(f.state.booking,before);assert.throws(()=>validateHandoff(f.state.booking,{...input(),visitIds:["unrelated"]},f.state.now));});
test("participant DTO exposes only assigned units and own amounts, no generic notes or history",async()=>{
 const f=await fixture(),b=f.state.booking,v=b.visits[2],a=activeAuthorization(v);
 v.sitterId="bob";v.compensationAuthorizations.push({...a,id:"replacement",revision:2,predecessorId:a.id,sitterId:"bob",compensationLane:"BUSINESS_ASSIGNED",rateSource:"DEFAULT_RATE",sourceRateId:"rate",rateVersion:1,sitterBaseCents:2000,sitterPetCents:0,sitterCompensationSubtotalCents:2000,sitterFeeCents:200,sitterPayoutCents:1800,reason:"handoff",operationId:"handoff"});
 Object.assign(b,{client:{name:"Client",phone:"555",email:"PRIVATE",secret:"PRIVATE"},notes:"PRIVATE",history:"PRIVATE",conversation:"PRIVATE",clientLinkToken:"PRIVATE"});
 v.sitter = { id: "bob", name: "Bob" };
 const visible = leadVisibleVisits(b,"sitter");
 assert.equal(visible.length,4);assert.equal(visible[2].scheduledSitterName,"Bob");assert.equal(visible[2].canExecute,false);assert.equal(visible[2].ownMoney,null);
 assert.equal(visible.filter(v=>v.canExecute).length,3);assert.equal(visible.filter(v=>v.canExecute).reduce((sum,v)=>sum+v.ownMoney.payoutCents,0),6750);
 assert(!JSON.stringify(visible).includes('"sitterPayoutCents"'));assert.deepEqual(leadVisibleVisits(b,"bob"),[]);
 assert.deepEqual(participantCareDto(b,"sitter"),{kind:"LEAD",bookingId:b.id,useLeadView:true});
 assert.equal(participationKind(b,"sitter"),"LEAD");assert.equal(participationKind(b,"bob"),"VISIT_PARTICIPANT");assert.equal(participantCareDto(b,"nobody"),null);
 const dto=participantCareDto(b,"bob");assert.equal(dto.visits.length,1);assert.equal(dto.visits[0].id,v.id);assert.equal(dto.visits[0].money.payoutCents,1800);
 assert(!JSON.stringify(dto).includes("PRIVATE"));assert.equal(ownVisitMoney(b,b.visits[0],"bob"),null);
 assert.deepEqual(Object.keys(dto).sort(),["bookingId","care","client","kind","location","service","status","visits"].sort());
 v.sitterId="sitter";assert.equal(participantCareDto(b,"bob"),null);
});

test("single-sitter lead retains every Visit, identity, own earnings and execution scope",async()=>{
 const f=await fixture(),b=f.state.booking;b.visits.forEach(v=>v.sitter={id:"sitter",name:"Bridget"});
 const visits=leadVisibleVisits(b,"sitter");assert.equal(visits.length,4);
 assert(visits.every(v=>v.canExecute && v.scheduledSitterName === "Bridget" && v.ownMoney.payoutCents === 2250));
});
