import test from "node:test";
import assert from "node:assert/strict";
import { compensationFixture } from "../compensation/fixtures.js";
import { resolveEffectiveBookingCompensationLane } from "../compensation/effectiveCompensationLane.js";
import { readBookingEconomics } from "../economics/bookingEconomics.js";
import { inspectCanonicalCancellation } from "../cancellation/canonicalCancellation.js";
import { assignBookingSitterWithDb } from "./confirmationService.js";

function harness(options = {}) {
  const f = compensationFixture(options), state = f.state;
  Object.assign(state, { history: [], conflicts: [], role: "SITTER", failHistory: false, clockReads: 0, crossStart: false });
  if (options.requested) { state.booking.status = "REQUESTED"; state.booking.visits.forEach((v) => { v.status = "PENDING"; }); }
  if (options.legacy) { for (const key of ["canonicalCreationKey", "canonicalInputHash", "careOptionId", "careOfferingId", "careOptionCode", "careOfferingCode", "quantity", "billingUnit", "scheduleKind", "pricingSnapshot", "attributionSnapshot"]) state.booking[key] = null; Object.assign(state.booking, { clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250 }); }
  const load = () => structuredClone({ ...state.booking, rewardReservation: state.reservation });
  const tx = {
    async $queryRaw(parts) { const sql = parts.join("?"); state.calls.push(sql); if (sql.includes("clock_timestamp")) return [{ now: state.crossStart && ++state.clockReads > 1 ? state.booking.visits[0].startTime : state.now }]; return [{ id: "locked" }]; },
    user: { async findUnique({ where }) { return where.id === "missing" ? null : { id: where.id, role: where.id === "operator" ? "OPERATOR" : state.role }; } },
    booking: { async findUnique({ select }) { assert.equal(select.sitterCompensation, true); return load(); }, async update({ data }) { assert.deepEqual(Object.keys(data), ["sitterId"]); Object.assign(state.booking, data); state.booking.sitter = data.sitterId ? { id: data.sitterId, role: "SITTER" } : null; } },
    visit: {
      async findFirst({ where }) { assert.deepEqual(where.OR, [{ status: "CONFIRMED" }, { status: "PENDING", booking: { status: "CONFIRMED" } }]); return state.conflicts.find((v) => v.sitterId === where.sitterId && v.startTime < where.startTime.lt && v.endTime > where.endTime.gt) || null; },
      async updateMany({ where, data }) { assert.deepEqual(Object.keys(data), ["sitterId"]); for (const v of state.booking.visits) if (where.status.in.includes(v.status)) Object.assign(v, data); },
    },
    bookingHistory: { async create({ data }) { state.history.push(data); if (state.failHistory) throw new Error("private DB failure"); } },
    sitterRewardAccount: { async findUnique() { return structuredClone(state.account); }, async update() { state.account.version++; } },
    sitterRewardReservation: { async findUnique() { return structuredClone(state.reservation); }, async update({ data }) { Object.assign(state.reservation, data); return structuredClone(state.reservation); } },
  };
  const db = { async $transaction(work, config) { assert.equal(config.isolationLevel, "Serializable"); const before = structuredClone(state); try { return await work(tx); } catch (error) { Object.assign(state, before); throw error; } } };
  return { ...f, load, assign: (sitterId = "other", extras = {}) => assignBookingSitterWithDb({ db, bookingId: "booking", actorId: "operator", sitterId, ...extras }) };
}
for (const business of [false, true]) for (const requested of [false, true]) test(`pre-service ${requested ? "REQUESTED" : "CONFIRMED"}, historical business=${business}: consistent assignment and one history`, async () => {
  const h = harness({ business, requested }), before = h.load();
  const result = await h.assign(); assert.equal(result.code, "ASSIGNED"); assert.equal(result.effectiveCompensationLane, "BUSINESS_ASSIGNED");
  assert.equal(h.state.booking.sitterId, "other"); assert(h.state.booking.visits.every((v) => v.sitterId === "other"));
  assert.deepEqual(h.state.booking.attributionSnapshot, before.attributionSnapshot); assert.deepEqual(h.state.booking.pricingSnapshot, before.pricingSnapshot); assert.equal(h.state.booking.sitterCompensation, null);
  assert.equal(h.state.history.length, 1); assert.equal(h.state.history[0].fromSitterId, "sitter"); assert.equal(h.state.history[0].toSitterId, "other"); assert.equal(h.state.history[0].changedByUserId, "operator");
  assert.equal((await h.assign()).code, "ALREADY_ASSIGNED"); assert.equal(h.state.history.length, 1);
});
for (const reward of [null, "RESERVED", "RELEASED"]) test(`reassignment then commitment freezes business lane/new sitter; reward=${reward}`, async () => {
  const h = harness({ reward }), attribution = structuredClone(h.state.booking.attributionSnapshot), grant = structuredClone(h.state.reservation?.grant);
  if (reward === "RESERVED") h.state.reservation.grant.status = "EXHAUSTED";
  assert.equal((await h.assign()).code, "ASSIGNED"); if (reward) assert.equal(h.state.reservation.status, "RELEASED");
  if (reward === "RESERVED") assert.equal(h.state.reservation.grant.status, "EXHAUSTED"); else if (reward) assert.deepEqual(h.state.reservation.grant, grant);
  const c = await h.commit(); assert.equal(c.sitterId, "other"); assert.equal(c.compensationLane, "BUSINESS_ASSIGNED"); assert.equal(c.rewardApplied, false); assert.equal(c.sitterFeeBasisPoints, 1000); assert.equal(c.clientBaseAggregateCents, h.state.booking.pricingSnapshot.baseAggregateCents);
  assert.deepEqual(h.state.booking.attributionSnapshot, attribution); assert.equal(attribution.compensationLane, "SITTER_ORIGINATED");
  assert.equal(readBookingEconomics(h.load()).sitter.status, "COMMITTED"); assert.equal(inspectCanonicalCancellation(h.load(), h.state.now).status, "CANCELED");
  assert.deepEqual(await h.commit(), c); assert.equal((await h.assign("third")).code, "COMPENSATION_COMMITTED_REASSIGNMENT_REQUIRES_REVIEW"); assert.deepEqual(h.state.booking.sitterCompensation, c);
  assert.equal((await h.assign("other")).code, "ALREADY_ASSIGNED"); assert.equal(h.state.history.length, 1);
});
test("originating sitter retained: lane stays sitter-originated", async () => { const h = harness(); assert.equal((await h.assign("sitter")).code, "ALREADY_ASSIGNED"); assert.equal(resolveEffectiveBookingCompensationLane(h.load()).compensationLane, "SITTER_ORIGINATED"); assert.equal((await h.commit()).compensationLane, "SITTER_ORIGINATED"); });
for (const reward of [null, "RESERVED"]) test(`committed compensation blocks change and unassignment, preserves reward/pet rows; reward=${reward}`, async () => {
  const h = harness({ reward }); await h.commit(); const before = h.load();
  for (const id of ["other", null]) assert.equal((await h.assign(id)).code, "COMPENSATION_COMMITTED_REASSIGNMENT_REQUIRES_REVIEW");
  assert.equal((await h.assign("sitter")).code, "ALREADY_ASSIGNED"); assert.deepEqual(h.load(), before); assert.equal(h.state.history.length, 0);
});
for (const [name, mutate, code] of [
  ["started", (s) => { s.booking.visits[0].startTime = s.now; }, "CARE_ALREADY_STARTED"],
  ["completed", (s) => { Object.assign(s.booking.visits[0], { status: "COMPLETED", completedAt: s.now, performedBySitterId: "sitter" }); }, "CARE_ALREADY_STARTED"],
  ["performer evidence", (s) => { s.booking.visits[0].performedBySitterId = "sitter"; }, "CARE_ALREADY_STARTED"],
  ["completion timestamp", (s) => { s.booking.visits[0].completedAt = s.now; }, "CARE_ALREADY_STARTED"],
  ["wrong Visit assignment", (s) => { s.booking.visits[0].sitterId = "third"; }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["canceled Visit", (s) => { s.booking.visits[0].status = "CANCELED"; }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["invalid interval", (s) => { s.booking.visits[0].endTime = s.booking.visits[0].startTime; }, "VISIT_TIME_INVALID"],
  ["missing pricing", (s) => { s.booking.pricingSnapshot = null; }, "INVALID_CANONICAL_CONTRACT"],
  ["missing attribution", (s) => { s.booking.attributionSnapshot = null; }, "SITTER_ORIGINATED_REASSIGNMENT_REQUIRES_LANE_CHANGE"],
  ["invalid sitter role", (s) => { s.role = "CLIENT"; }, "INVALID_SITTER"],
]) test(`${name}: blocked without operational, history or financial changes`, async () => {
  const h = harness(); mutate(h.state); const before = h.load(); assert.equal((await h.assign()).code, code); assert.deepEqual(h.load(), before); assert.equal(h.state.history.length, 0);
});
for (const status of ["CANCELED", "COMPLETED"]) test(`${status} rejects even same-sitter assignment`, async () => { const h = harness(); h.state.booking.status = status; assert.equal((await h.assign("sitter")).code, "INVALID_BOOKING_STATUS"); assert.equal(h.state.history.length, 0); });
test("invalid sitter rejected", async () => { const h = harness(); assert.equal((await h.assign("missing")).code, "INVALID_SITTER"); });
test("consumed reward without compensation blocks change/replay and is never released", async () => {
  const h = harness({ reward: "CONSUMED" }), before = h.load();
  for (const sitterId of ["other", "sitter"]) assert.equal((await h.assign(sitterId)).code, "REWARD_STATE_CONFLICT");
  assert.deepEqual(h.load(), before); assert.equal(h.state.history.length, 0);
});
for (const failure of ["failHistory", "crossStart"]) test(`${failure}: assignment, release and history roll back together`, async () => {
  const h = harness({ reward: "RESERVED" }); h.state[failure] = true; const before = h.load(), account = structuredClone(h.state.account);
  assert.equal((await h.assign()).ok, false); assert.deepEqual(h.load(), before); assert.deepEqual(h.state.account, account); assert.equal(h.state.history.length, 0);
});
for (const offset of [-1, 0, 1]) test(`cross-midnight availability, next Visit start offset=${offset}: zero-buffer boundary`, async () => {
  const h = harness(); const v = h.state.booking.visits[0]; v.startTime = new Date("2030-09-12T23:00Z"); v.endTime = new Date("2030-09-13T01:00Z");
  h.state.conflicts.push({ sitterId: "other", startTime: new Date(+v.endTime + offset), endTime: new Date(+v.endTime + 3600000) });
  assert.equal((await h.assign()).code, offset < 0 ? "SITTER_UNAVAILABLE" : "ASSIGNED");
});
for (const legacy of [false, true]) test(`pre-service unassignment allowed without commitment; legacy=${legacy}`, async () => {
  const h = harness({ legacy, reward: legacy ? null : "RESERVED" }); assert.equal((await h.assign(null)).code, "ASSIGNED"); assert.equal(h.state.booking.sitterId, null);
  if (!legacy) { assert.equal(h.state.reservation.status, "RELEASED"); await assert.rejects(h.commit(), { code: "SITTER_MISMATCH" }); }
  assert.equal((await h.assign("other")).code, "ASSIGNED");
});
test("safe legacy reassignment preserves legacy money", async () => {
  const h = harness({ legacy: true }); assert.equal((await h.assign()).code, "ASSIGNED"); assert.deepEqual([h.state.booking.clientTotalCents, h.state.booking.platformFeeCents, h.state.booking.sitterPayoutCents], [2750, 500, 2250]);
});
for (const mutate of [
  (b) => { b.attributionSnapshot.compensationLane = "BUSINESS_ASSIGNED"; },
  (b) => { b.sitterCompensation.sitterId = "third"; },
  (b) => { b.sitterCompensation.compensationLane = "BUSINESS_ASSIGNED"; },
]) test("reader rejects arbitrary frozen identity/lane mismatch", async () => {
  const h = harness(); await h.commit(); const b = h.load(); mutate(b); assert.equal(readBookingEconomics(b).sitter.status, "UNAVAILABLE");
});
test("BUSINESS_ASSIGNED historical lane cannot upgrade to sitter-originated on return to referrer", () => {
  const h = harness(); h.state.booking.attributionSnapshot.compensationLane = "BUSINESS_ASSIGNED";
  assert.equal(resolveEffectiveBookingCompensationLane(h.load()).compensationLane, "BUSINESS_ASSIGNED");
});
test("a released reservation belongs to original sitter and cannot be forged for a third party", async () => {
  const h = harness({ reward: "RELEASED" }); h.state.reservation.sitterId = "third"; assert.equal((await h.assign()).code, "REWARD_STATE_CONFLICT");
});

for (const reward of ["RESERVED", "CONSUMED", "RELEASED"]) test(`legacy reward=${reward}: preserve money and do not silently invalidate active entitlement`, async () => {
  const h = harness({ legacy: true, reward });
  h.state.booking.attributionSnapshot = compensationFixture().state.booking.attributionSnapshot;
  const before = h.load(); const result = await h.assign();
  assert.equal(result.code, reward === "RELEASED" ? "ASSIGNED" : "REWARD_STATE_CONFLICT");
  assert.deepEqual(h.state.reservation, before.rewardReservation);
  assert.deepEqual([h.state.booking.clientTotalCents, h.state.booking.platformFeeCents, h.state.booking.sitterPayoutCents], [2750, 500, 2250]);
  if (reward !== "RELEASED") { assert.deepEqual(h.load(), before); assert.equal(h.state.history.length, 0); }
});
