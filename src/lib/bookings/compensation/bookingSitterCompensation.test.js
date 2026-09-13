import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { compensationFixture } from "./fixtures.js";
import { commitBookingSitterCompensationWithDb } from "./commitBookingSitterCompensation.js";
import { MAX_MONEY_CENTS, calculateSitterEconomics } from "../../pricing/calculatePricing.js";

const rejectCode = async (f, code) => {
  await assert.rejects(f.commit(), { code }); assert.equal(f.state.booking?.sitterCompensation ?? null, null);
};
test("schema freezes typed cents, server-owned committedAt and restrictive history", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const model = schema.split("model BookingSitterCompensation {")[1].split("\n}")[0];
  assert.match(model, /bookingId String @unique/); assert.match(model, /rewardReservationId String\? @unique/);
  assert.match(model, /committedAt DateTime\n/); assert.doesNotMatch(model, /Json|onDelete: Cascade|updatedAt/);
  const service = await readFile("src/lib/bookings/compensation/bookingSitterCompensationService.js", "utf8");
  assert.match(service, /\{ bookingId \} = \{\}/); assert.match(service, /db: prisma, bookingId/);
});
test("2500 standard basis excludes client fee; caller economics, lane, sitter and time ignored", async () => {
  const f = compensationFixture(); const row = await f.commit({ sitterId: "evil", lane: "BUSINESS_ASSIGNED", currency: "CAD", sitterFeeBasisPoints: 0, rewardGrantId: "evil", committedAt: new Date(0), sitterCompensationSubtotalCents: 1 });
  assert.deepEqual([row.sitterCompensationSubtotalCents, row.sitterFeeBasisPoints, row.sitterFeeCents, row.sitterPayoutCents], [2500, 1000, 250, 2250]);
  assert.equal(row.clientServiceSubtotalCents, 2500); assert.equal(f.state.booking.pricingSnapshot.clientTotalCents, 2750);
  assert.equal(row.currency, "USD"); assert.equal(row.sitterId, "sitter"); assert.deepEqual(row.committedAt, f.state.now);
  assert.equal(row.rateSource, "CANONICAL_CLIENT_SERVICE_SUBTOTAL"); assert.equal(row.rewardApplied, false);
  assert(!f.state.calls.includes("defaultRate"));
});
for (const quantity of [1, 3]) test(`multi-pet frozen subtotal quantity ${quantity} is used exactly once`, async () => {
  const f = compensationFixture({ quantity, pets: [{ name: "A", species: "Dog" }, { name: "B", species: "Dog" }] });
  const row = await f.commit(); assert.equal(row.sitterCompensationSubtotalCents, 3000 * quantity);
});
for (const status of ["ACTIVE", "EXPIRED", "EXHAUSTED", "REVOKED"]) test(`RESERVED reward survives grant ${status}`, async () => {
  const f = compensationFixture({ reward: "RESERVED" }); f.state.reservation.grant.status = status;
  f.state.reservation.grant.expiresAt = new Date(0);
  const row = await f.commit();
  assert.deepEqual([row.sitterCompensationSubtotalCents, row.sitterFeeBasisPoints, row.sitterFeeCents, row.sitterPayoutCents], [2500, 500, 125, 2375]);
  assert.equal(row.rewardApplied, true); assert.equal(row.rewardReservationId, "reservation"); assert.equal(row.rewardGrantId, "grant"); assert.equal(row.rewardLevel, 1);
  assert.equal(f.state.reservation.status, "CONSUMED"); assert.deepEqual(f.state.reservation.consumedAt, row.committedAt);
  f.state.now = new Date("2026-09-14T00:00:00Z"); assert.deepEqual(await f.commit(), row); assert.equal(f.state.consumes, 1);
});
test("RELEASED reservation persists standard without resurrection", async () => {
  const f = compensationFixture({ reward: "RELEASED" }); const before = structuredClone(f.state.reservation);
  const row = await f.commit(); assert.equal(row.sitterFeeBasisPoints, 1000); assert.equal(row.rewardApplied, false);
  assert.deepEqual(f.state.reservation, before); assert.equal(f.state.consumes, 0); assert.deepEqual(await f.commit(), row);
});
for (const fee of [-1, 0, 501, 1000, 10001, 0.5, NaN]) test(`unsupported reward fee ${fee} fails closed`, async () => {
  const f = compensationFixture({ reward: "RESERVED" }); f.state.reservation.grant.feeBasisPoints = fee; await rejectCode(f, "UNSUPPORTED_REWARD_FEE");
});
for (const reward of ["RESERVED", "CONSUMED", "RELEASED"]) test(`business reservation ${reward} is contradictory`, async () => {
  await rejectCode(compensationFixture({ business: true, reward }), "BUSINESS_REWARD_CONTRADICTION");
});
test("default business economics freeze base, pet rule identities and actual rate version", async () => {
  const f = compensationFixture({ business: true, quantity: 3, pets: [{ name: "A", species: "Dog" }, { name: "B", species: "Dog" }] });
  const row = await f.commit();
  assert.deepEqual([row.clientBaseAggregateCents, row.baseAggregateCompensationCents, row.additionalPetCompensationCents, row.sitterCompensationSubtotalCents, row.sitterFeeCents, row.sitterPayoutCents], [7500, 6000, 1200, 7200, 720, 6480]);
  assert.equal(row.rateSource, "DEFAULT_RATE"); assert.equal(row.sourceRateId, "default-rate"); assert.equal(row.rateVersion, 4);
  assert.equal(row.petCharges[0].sourcePetChargeId, "pet-rule"); assert.equal(row.petCharges[0].aggregateAmountCents, 1200);
});
test("business override source is selected, including its own pet fallback", async () => {
  const f = compensationFixture({ business: true, pets: [{ name: "A", species: "Dog" }, { name: "B", species: "Dog" }] });
  f.state.sitterRate = { ...f.state.defaultRate, id: "override", sitterId: "sitter", version: 7, baseCompensationCents: 2200, petCharges: [], defaultAdditionalCents: 100 };
  const row = await f.commit(); assert.equal(row.rateSource, "SITTER_OVERRIDE"); assert.equal(row.sourceRateId, "override"); assert.equal(row.rateVersion, 7);
  assert.equal(row.sitterCompensationSubtotalCents, 2300); assert.equal(row.petCharges[0].sourcePetChargeId, null);
});
test("business ceiling uses frozen base, not subtotal or any current client catalog", async () => {
  const f = compensationFixture({ business: true }); f.state.defaultRate.baseCompensationCents = 2250;
  assert.equal((await f.commit()).baseAggregateCompensationCents, 2250);
  const g = compensationFixture({ business: true }); g.state.defaultRate.baseCompensationCents = 2251; await rejectCode(g, "COMPENSATION_CEILING_EXCEEDED");
});
test("business replay after rate deletion does not recalculate", async () => {
  const f = compensationFixture({ business: true }); const row = await f.commit();
  f.state.calls = []; f.state.defaultRate = null; f.state.sitterRate = null;
  assert.deepEqual(await f.commit(), row); assert(!f.state.calls.includes("defaultRate"));
});
for (const [label, change, code] of [
  ["legacy", (s) => { s.booking.canonicalCreationKey = null; s.booking.canonicalInputHash = null; s.booking.careOptionId = null; }, "NOT_CANONICAL"],
  ["missing pricing", (s) => { s.booking.pricingSnapshot = null; }, "PRICING_SNAPSHOT_MISSING"],
  ["missing attribution", (s) => { s.booking.attributionSnapshot = null; }, "ATTRIBUTION_SNAPSHOT_MISSING"],
  ["legacy money", (s) => { s.booking.clientTotalCents = 99; }, "INVALID_CANONICAL_CONTRACT"],
  ["pricing currency", (s) => { s.booking.pricingSnapshot.currency = "CAD"; }, "CURRENCY_MISMATCH"],
  ["pricing quantity", (s) => { s.booking.pricingSnapshot.quantity++; }, "INVALID_PRICING_SNAPSHOT"],
  ["pricing fee", (s) => { s.booking.pricingSnapshot.clientFeeCents++; }, "INVALID_PRICING_SNAPSHOT"],
  ["pricing base", (s) => { s.booking.pricingSnapshot.baseAggregateCents++; }, "INVALID_PRICING_SNAPSHOT"],
  ["negative money", (s) => { s.booking.pricingSnapshot.baseUnitCents = -1; }, "INVALID_MONEY"],
  ["overflow", (s) => { s.booking.pricingSnapshot.serviceSubtotalCents = MAX_MONEY_CENTS + 1; }, "INVALID_MONEY"],
  ["wrong sitter", (s) => { s.booking.sitterId = "other"; }, "SITTER_MISMATCH"],
  ["requested sitter", (s) => { s.booking.attributionSnapshot.requestedSitterId = "other"; }, "INVALID_ATTRIBUTION"],
  ["missing sitter", (s) => { s.booking.sitter = null; }, "SITTER_MISMATCH"],
  ["lane", (s) => { s.booking.attributionSnapshot.compensationLane = "OTHER"; }, "INVALID_ATTRIBUTION"],
  ["no visits", (s) => { s.booking.visits = []; }, "VISITS_MISSING"],
  ["visit sitter", (s) => { s.booking.visits[0].sitterId = "other"; }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["visit completed", (s) => { s.booking.visits[0].status = "COMPLETED"; }, "INVALID_VISIT_STATE"],
  ["visit pending", (s) => { s.booking.visits[0].status = "PENDING"; }, "INVALID_VISIT_STATE"],
  ["visit canceled", (s) => { s.booking.visits[0].status = "CANCELED"; }, "INVALID_VISIT_STATE"],
  ["completed timestamp", (s) => { s.booking.visits[0].completedAt = s.now; }, "INVALID_VISIT_STATE"],
  ["performer exists", (s) => { s.booking.visits[0].performedBySitterId = "sitter"; }, "INVALID_VISIT_STATE"],
  ["invalid window", (s) => { s.booking.visits[0].endTime = s.booking.visits[0].startTime; }, "INVALID_VISIT_STATE"],
  ["invalid database time", (s) => { s.now = new Date(NaN); }, "INVALID_DATABASE_TIME"],
  ["exact start", (s) => { s.now = s.booking.visits[0].startTime; }, "CARE_ALREADY_STARTED"],
  ["after start", (s) => { s.now = new Date(+s.booking.visits[0].startTime + 1); }, "CARE_ALREADY_STARTED"],
]) test(`${label} fails closed`, async () => { const f = compensationFixture(); change(f.state); await rejectCode(f, code); });
for (const status of ["REQUESTED", "CANCELED", "COMPLETED", "UNKNOWN"]) test(`${status} initial commitment rejected`, async () => {
  const f = compensationFixture(); f.state.booking.status = status; await rejectCode(f, "BOOKING_NOT_COMMITTABLE");
});
test("one millisecond before first visit succeeds", async () => {
  const f = compensationFixture(); f.state.now = new Date(+f.state.booking.visits[0].startTime - 1); assert(await f.commit());
});
test("mixed visit assignments fail closed", async () => {
  const f = compensationFixture({ quantity: 2 }); f.state.booking.visits[1].sitterId = "other"; await rejectCode(f, "VISIT_ASSIGNMENT_MISMATCH");
});
for (const status of ["COMPLETED", "CANCELED"]) test(`existing snapshot replays after ${status} without clock gate`, async () => {
  const f = compensationFixture(); const row = await f.commit(); f.state.booking.status = status; f.state.booking.completedAt = f.state.now;
  f.state.booking.visits[0].status = "COMPLETED"; f.state.booking.visits[0].completedAt = f.state.now; f.state.booking.visits[0].performedBySitterId = "another-performer";
  f.state.now = new Date("2035-01-01"); assert.deepEqual(await f.commit(), row);
});
for (const field of ["sitterId", "compensationLane", "currency", "bookingId"]) test(`contradictory existing ${field} rejected`, async () => {
  const f = compensationFixture(); await f.commit(); f.state.booking.sitterCompensation[field] = "wrong";
  await assert.rejects(f.commit(), { code: "COMPENSATION_IDENTITY_CONFLICT" });
});
test("business precommit reassignment selects current sitter; missing assignment rejects", async () => {
  const f = compensationFixture({ business: true }); f.state.booking.sitterId = "new"; f.state.booking.sitter.id = "new"; f.state.booking.visits[0].sitterId = "new";
  assert.equal((await f.commit()).sitterId, "new");
  const g = compensationFixture({ business: true }); g.state.booking.sitterId = null; await rejectCode(g, "SITTER_MISMATCH");
});
test("CONSUMED without compensation is never recreated", async () => { await rejectCode(compensationFixture({ reward: "CONSUMED" }), "CONSUMED_WITHOUT_COMPENSATION"); });
for (const field of ["sitterId", "bookingId", "grantId"]) test(`reward ${field} contradiction`, async () => {
  const f = compensationFixture({ reward: "RESERVED" }); f.state.reservation[field] = "wrong"; await rejectCode(f, "REWARD_IDENTITY_MISMATCH");
});
test("reward snapshot with RESERVED reservation fails replay", async () => {
  const f = compensationFixture({ reward: "RESERVED" }); await f.commit(); f.state.reservation.status = "RESERVED"; f.state.reservation.consumedAt = null;
  await assert.rejects(f.commit(), { code: "COMPENSATION_REWARD_CONFLICT" });
});
for (const fail of ["afterInsert", "afterConsume", "transitionCount"]) test(`${fail} rolls back snapshot, consume and account; retry succeeds once`, async () => {
  const f = compensationFixture({ reward: "RESERVED" }); const before = structuredClone(f.state.reservation); f.state.fail = fail;
  await rejectCode(f, fail === "transitionCount" ? "REWARD_TRANSITION_CONFLICT" : "COMPENSATION_PERSISTENCE_ERROR");
  assert.deepEqual(f.state.reservation, before); assert.equal(f.state.consumes, 0); assert.equal(f.state.account.version, 1);
  f.state.fail = null; const row = await f.commit(); assert.deepEqual(await f.commit(), row); assert.equal(f.state.consumes, 1);
});
for (const code of ["P2034", "40001", "40P01", "P2002"]) test(`${code} retries outside failed transaction`, async () => {
  const f = compensationFixture(); let attempts = 0;
  const db = { $transaction(...args) { if (++attempts === 1) throw Object.assign(new Error("raw db"), { code }); return f.db.$transaction(...args); } };
  assert(await commitBookingSitterCompensationWithDb({ db, bookingId: "booking" })); assert.equal(attempts, 2);
});
test("retry exhaustion is sanitized", async () => {
  await assert.rejects(commitBookingSitterCompensationWithDb({ db: { $transaction() { throw Object.assign(new Error("private"), { code: "P2002" }); } }, bookingId: "booking" }), { code: "COMPENSATION_TRANSACTION_CONFLICT" });
});
test("business currency mismatch", async () => { const f = compensationFixture({ business: true }); f.state.defaultRate.currency = "CAD"; await rejectCode(f, "CURRENCY_MISMATCH"); });
test("business aggregate money overflow", async () => {
  const f = compensationFixture({ business: true, quantity: 2, pets: [{ name: "A", species: "Dog" }, { name: "B", species: "Dog" }] });
  f.state.defaultRate.petCharges[0].additionalCents = MAX_MONEY_CENTS; await rejectCode(f, "INVALID_MONEY_CONFIGURATION");
});
test("shared reward fee uses the same half-up rounding and safe range", () => {
  assert.deepEqual(calculateSitterEconomics(2510, 500), { sitterCompensationSubtotalCents: 2510, sitterFeeCents: 126, sitterPayoutCents: 2384 });
  assert.throws(() => calculateSitterEconomics(2500, -1), RangeError);
});
