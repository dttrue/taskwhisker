import test from "node:test";
import assert from "node:assert/strict";
import { compensationFixture } from "../compensation/fixtures.js";
import { ownerConfiguration } from "../ownerIdentityFixtures.js";
import { distributeClientUnits, activeAuthorization, inspectFinancialReadiness } from "./contract.js";
import { careReadiness, actionableCareUnavailable } from "./readiness.js";
import { readVisitCompensationExposure } from "./reconciliation.js";
import { readBookingEconomics } from "../economics/bookingEconomics.js";
for (const [quantity, base, pet] of [[1,2500,500],[4,10000,2000],[4,10003,2000],[4,10000,2003],[4,10003,2001]]) test(`distribution ${quantity}/${base}/${pet}`, () => {
  const units = distributeClientUnits({ quantity, baseAggregateCents: base, additionalPetAggregateCents: pet, serviceSubtotalCents: base + pet });
  assert.equal(units.reduce((s,u) => s + u.unitBaseCents, 0), base);
  assert.equal(units.reduce((s,u) => s + u.unitAdditionalPetCents, 0), pet);
  assert.equal(units.reduce((s,u) => s + u.unitServiceSubtotalCents, 0), base + pet);
  units.forEach((u,i) => { assert.equal(u.canonicalUnitPosition,i); assert.equal(u.unitServiceSubtotalCents,u.unitBaseCents+u.unitAdditionalPetCents); });
  assert.equal(units[0].unitBaseCents, Math.ceil(base/quantity));
  assert.equal(units.at(-1).unitAdditionalPetCents, Math.floor(pet/quantity));
});
test("distribution reconciles every supported quantity and does not mutate pricing", () => {
  for (let quantity=1; quantity<=366; quantity++) {
    const p = { quantity, baseAggregateCents: 123457, additionalPetAggregateCents: 731, serviceSubtotalCents: 124188 }, before = structuredClone(p);
    const units = distributeClientUnits(p);
    assert.equal(units.reduce((n,u)=>n+u.unitServiceSubtotalCents,0),p.serviceSubtotalCents); assert.deepEqual(p,before);
  }
});
test("invalid frozen aggregates fail closed", () => assert.throws(()=>distributeClientUnits({ quantity: 4, baseAggregateCents: 5, additionalPetAggregateCents: 1, serviceSubtotalCents: 7 })));
for (const business of [false,true]) test(`configured owner bypasses ordinary rates, business=${business}`, async () => {
  const f = compensationFixture({ business, quantity: 4 }); const b=f.state.booking;
  b.sitterId=ownerConfiguration.sitterId; b.sitter.id=b.sitterId; b.visits.forEach(v=>v.sitterId=b.sitterId);
  if (!business) b.attributionSnapshot.referringSitterId=b.attributionSnapshot.requestedSitterId=b.sitterId;
  f.state.defaultRate=null;
  const c=await f.commit();
  assert.equal(c.performerPolicy,"OWNER_OPERATOR"); assert.equal(c.feePolicy,"OWNER_0_PERCENT"); assert.equal(c.sitterFeeBasisPoints,0);
  assert.equal(c.sitterPayoutCents,b.pricingSnapshot.serviceSubtotalCents); assert.equal(c.rewardApplied,false);
  assert.equal(c.rewardReservationId,null); assert(!f.state.calls.includes("defaultRate")); assert(!f.state.calls.includes("sitterRate"));
  const ready={...b,rewardReservation:null}; assert.equal(careReadiness(ready).ok,true); assert.equal(readBookingEconomics(ready).sitter.payoutCents,10000);
  b.visits.forEach(v=> { const a=activeAuthorization(v); assert.equal(a.sitterPayoutCents,2500); assert.equal(a.sitterFeeCents,0); assert.equal(a.rewardGrantId,null); });
});
for (const [business,reward,bps] of [[false,null,1000],[false,"RESERVED",500],[true,null,1000]]) test(`ordinary unit policy business=${business}, reward=${reward}`, async () => {
  const f=compensationFixture({business,reward,quantity:4}); await f.commit();
  const b={...f.state.booking,rewardReservation:f.state.reservation};
  assert.equal(careReadiness(b).ok,true);
  for(const v of b.visits) { const a=activeAuthorization(v); assert.equal(a.sitterFeeBasisPoints,bps); assert.equal(a.performerPolicy,"ORDINARY"); }
  const before=structuredClone(b.visits); b.visits.reverse(); assert.equal(inspectFinancialReadiness(b).ok,true); assert.deepEqual(b.visits.toReversed(),before);
  if(business) { f.state.defaultRate.baseCompensationCents=1; assert.equal((await f.commit()).baseUnitCompensationCents,2000); }
});
for (const [label,change] of [
  ["requested with contradictory finance",b=>b.status="REQUESTED"],
  ["missing",b=>b.visits[0].compensationAuthorizations=[]],
  ["wrong sitter",b=>b.visits[0].compensationAuthorizations[0].sitterId="replacement"],
  ["voided",b=>b.visits[0].compensationAuthorizations[0].void={reason:"cancel"}],
  ["bad position",b=>b.visits[0].canonicalUnitPosition=null],
  ["late authorization",b=>b.visits[0].compensationAuthorizations[0].authorizedAt=b.visits[0].startTime],
  ["invalid fee",b=>b.visits[0].compensationAuthorizations[0].sitterFeeBasisPoints=0],
  ["broken revision",b=>b.visits[0].compensationAuthorizations[0].revision=2],
]) test(`${label} fails financial readiness`, async()=>{
  const f=compensationFixture();await f.commit();const b={...f.state.booking,rewardReservation:null};change(b);
  assert.equal(careReadiness(b).ok,false);assert.equal(actionableCareUnavailable(b),true);
});
test("exposure counts allocation once and excludes canceled terms", async()=>{
  const f=compensationFixture({quantity:4});await f.commit();const b=f.state.booking;
  b.visits[0].status="COMPLETED"; b.visits[0].compensationAllocation={sitterPayoutCents:2250};
  b.visits[1].status="CANCELED";
  assert.deepEqual(readVisitCompensationExposure(b),{originalCommitmentPayoutCents:9000,earnedPayoutCents:2250,unearnedAuthorizedPayoutCents:4500,currentExposurePayoutCents:6750,reviewVisitCount:0});
  b.visits[2].status="COMPLETED"; assert.equal(readVisitCompensationExposure(b).currentExposurePayoutCents,null);
});

test("finished operational history stays readable without inventing financial readiness", async()=>{
  const f=compensationFixture(); const b={...f.state.booking,rewardReservation:null};
  b.visits[0].status="COMPLETED";
  assert.equal(actionableCareUnavailable(b),false); assert.equal(careReadiness(b).ok,false);
});
test("per-unit fee rounding can differ from the original commitment without rewriting it", async () => {
  const f = compensationFixture({ quantity: 4 });
  Object.assign(f.state.booking.pricingSnapshot, { baseUnitCents: 2505, baseAggregateCents: 10020,
    additionalPetAggregateCents: 0, serviceSubtotalCents: 10020, clientFeeCents: 1002, clientTotalCents: 11022 });
  const commitment = await f.commit(), before = structuredClone(commitment);
  const exposure = readVisitCompensationExposure(f.state.booking);
  assert.equal(commitment.sitterFeeCents, 1002);
  assert.equal(exposure.originalCommitmentPayoutCents, 9018);
  assert.equal(exposure.currentExposurePayoutCents, 9016);
  assert.deepEqual(f.state.booking.sitterCompensation, before);
});
