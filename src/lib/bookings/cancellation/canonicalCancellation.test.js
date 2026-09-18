import test from "node:test";
import assert from "node:assert/strict";
import { compensationFixture } from "../compensation/fixtures.js";
import { inspectCanonicalCancellation, cancelCanonicalBookingWithDb, CANCELLATION_REVIEW } from "./canonicalCancellation.js";
import { calculateCancellationFeeCents, cancelBookingTransaction } from "../cancelBookingTransaction.js";

async function fixture({ reward = null, committed = false, requested = false, business = false } = {}) {
  const f = compensationFixture({ reward, business });
  if (committed) await f.commit();
  const booking = structuredClone({ ...f.state.booking, rewardReservation: f.state.reservation });
  if (requested) { booking.status = "REQUESTED"; booking.visits.forEach((v) => { v.status = "PENDING"; }); }
  return { booking, now: f.state.now };
}
function runtime(f) {
  const state = { booking: f.booking, history: [], messages: [], account: { id: "account", version: 1 }, now: f.now, actor: "OPERATOR", request: true, fail: null, clocks: 0, calls: [] };
  const tx = {
    visitCompensationAuthorizationVoid: { async create({ data }) {
      for (const v of state.booking.visits) for (const a of v.compensationAuthorizations ?? []) if (a.id === data.authorizationId) a.void = data;
      return data;
    } },
    async $queryRaw(parts) {
      const sql = parts.join("?"); state.calls.push(sql);
      if (sql.includes("clock_timestamp")) { state.clocks++; return [{ now: state.fail === "crossStart" && state.clocks > 1 ? state.booking.visits[0].startTime : state.now }]; }
      return [{ id: "lock" }];
    },
    user: { async findUnique() { return { role: state.actor }; } },
    booking: {
      async findUnique() { return structuredClone(state.booking); },
      async update({ data }) { assert.deepEqual(Object.keys(data).sort(), ["canceledAt", "status"]); Object.assign(state.booking, data); },
    },
    visit: { async updateMany({ data }) { assert.deepEqual(data, { status: "CANCELED" }); state.booking.visits.forEach((v) => { v.status = data.status; }); } },
    bookingHistory: { async create({ data }) { if (state.fail === "history") throw new Error("private database detail"); state.history.push(data); } },
    conversation: { async upsert() { return { id: "conversation" }; } },
    message: { async findFirst() { return state.request ? { id: "request" } : null; }, async create({ data }) { state.messages.push(data); } },
    sitterRewardAccount: { async findUnique() { return structuredClone(state.account); }, async update() { state.account.version++; } },
    sitterRewardReservation: {
      async findUnique() { return structuredClone(state.booking.rewardReservation); },
      async update({ data }) { Object.assign(state.booking.rewardReservation, data); return structuredClone(state.booking.rewardReservation); },
    },
  };
  const db = { async $transaction(work, config) {
    assert.equal(config.isolationLevel, "Serializable"); const before = structuredClone(state);
    try { return await work(tx); } catch (e) { Object.assign(state, before); throw e; }
  } };
  return { state, db, cancel: (args = {}) => cancelCanonicalBookingWithDb({ db, bookingId: "booking", actorId: "operator", reason: "Client plans changed", ...args }) };
}
for (const requested of [false, true]) for (const committed of (requested ? [false] : [false, true])) test(`pre-service ${requested ? "requested" : "confirmed"}, compensation ${committed}: operational only; immutable financial evidence`, async () => {
  const f = await fixture({ requested, committed }), r = runtime(f), before = structuredClone(f.booking);
  const result = await r.cancel();
  assert.equal(result.status, "CANCELED"); assert.equal(result.reasonCode, CANCELLATION_REVIEW); assert.equal(result.financialReviewRequired, true);
  assert.equal(result.compensationCommitted, committed); assert.equal(result.careStarted, false);
  assert.deepEqual(r.state.booking.pricingSnapshot, before.pricingSnapshot); assert.deepEqual(r.state.booking.sitterCompensation, before.sitterCompensation);
  assert.deepEqual([r.state.booking.clientTotalCents, r.state.booking.platformFeeCents, r.state.booking.sitterPayoutCents], [null, null, null]);
  assert(r.state.booking.visits.every((v) => v.status === "CANCELED" && v.completedAt === null && v.performedBySitterId === null));
  assert.equal(r.state.history.length, 1); assert.equal(r.state.history[0].changedByUserId, "operator"); assert.match(r.state.history[0].note, /CANONICAL_CANCELLATION_REQUIRES_REVIEW/);
  assert.equal("cancellationFeeCents" in result, false); assert.equal("refundCents" in result, false); assert.equal("sitterPayoutCents" in result, false);
  const after = structuredClone(r.state.booking);
  assert.equal((await r.cancel()).status, "ALREADY_CANCELED"); assert.deepEqual(r.state.booking, after); assert.equal(r.state.history.length, 1); assert.equal(r.state.messages.length, 1);
});
for (const type of ["started", "completed", "performed", "completedAt"]) test(`${type} care: repeated review preserves all operational truth`, async () => {
  const f = await fixture(), v = f.booking.visits[0];
  if (type === "started") v.startTime = new Date(+f.now - 1);
  if (type === "completed") v.status = "COMPLETED";
  if (["performed", "completed"].includes(type)) v.performedBySitterId = "sitter";
  if (["completedAt", "completed"].includes(type)) v.completedAt = f.now;
  const r = runtime(f), before = structuredClone(r.state.booking);
  for (let i = 0; i < 2; i++) { const result = await r.cancel(); assert.equal(result.status, CANCELLATION_REVIEW); assert.equal(result.reviewReason, "CARE_STARTED_OR_PERFORMED"); }
  assert.deepEqual(r.state.booking, before); assert.equal(r.state.history.length, 0); assert.equal(r.state.messages.length, 0);
});
for (const [name, change] of [
  ["missing pricing", (b) => { b.pricingSnapshot = null; }],
  ["contradictory legacy money", (b) => { b.clientTotalCents = 0; }],
  ["invalid attribution source", (b) => { b.attributionSnapshot.attributionSource = "UNVERIFIED"; }],
  ["future commitment", (b) => { b.pricingSnapshot.committedAt = new Date("2040-01-01"); }],
  ["missing attribution", (b) => { b.attributionSnapshot = null; }],
  ["missing visits", (b) => { b.visits = []; }],
  ["visit assignment mismatch", (b) => { b.visits[0].sitterId = "other"; }],
  ["invalid visit clock", (b) => { b.visits[0].startTime = null; }],
  ["missing loaded reservation", (b) => { delete b.rewardReservation; }],
  ["missing loaded compensation", (b) => { delete b.sitterCompensation; }],
]) test(`${name} fails closed without falling back to legacy`, async () => {
  const f = await fixture(); change(f.booking); const r = runtime(f), before = structuredClone(f.booking);
  assert.equal((await r.cancel()).status, CANCELLATION_REVIEW); assert.deepEqual(r.state.booking, before); assert.equal(r.state.history.length, 0);
});
test("contradictory committed compensation never zeroed or recalculated", async () => {
  const f = await fixture({ committed: true }); f.booking.sitterCompensation.sitterPayoutCents++;
  const r = runtime(f), before = structuredClone(f.booking); assert.equal((await r.cancel()).reviewReason, "COMPENSATION_SNAPSHOT_INVALID"); assert.deepEqual(r.state.booking, before);
});
for (const status of ["RESERVED", "RELEASED", "CONSUMED"]) test(`${status} reward lifecycle`, async () => {
  const f = await fixture({ reward: status }), r = runtime(f), grant = structuredClone(f.booking.rewardReservation.grant);
  const result = await r.cancel();
  assert.equal(result.status, status === "CONSUMED" ? CANCELLATION_REVIEW : "CANCELED");
  assert.equal(r.state.booking.rewardReservation.status, status === "RESERVED" ? "RELEASED" : status);
  assert.deepEqual(r.state.booking.rewardReservation.grant, grant);
});
test("boosted compensation retains consumed entitlement and immutable commitment", async () => {
  const f = await fixture({ reward: "RESERVED", committed: true }), r = runtime(f), before = structuredClone(f.booking);
  assert.equal((await r.cancel()).status, "CANCELED"); assert.deepEqual(r.state.booking.rewardReservation, before.rewardReservation); assert.deepEqual(r.state.booking.sitterCompensation, before.sitterCompensation);
});
for (const fail of ["history", "crossStart"]) test(`${fail} rolls back cancellation, visits, history, message and reward release atomically`, async () => {
  const r = runtime(await fixture({ reward: "RESERVED" })); r.state.fail = fail; const before = structuredClone(r.state);
  assert.equal((await r.cancel()).ok, false); assert.deepEqual(r.state, before);
});
test("explicit canonical waiver is review only", async () => { const r = runtime(await fixture()); assert.equal((await r.cancel({ waiveFee: true })).reviewReason, "CANONICAL_WAIVER_UNDEFINED"); assert.equal(r.state.history.length, 0); });
test("actor and client request checked server-side", async () => {
  const r = runtime(await fixture()); r.state.actor = "CLIENT"; assert.equal((await r.cancel()).status, "NOT_AUTHORIZED");
  r.state.actor = "SITTER"; assert.equal((await r.cancel()).status, "NOT_AUTHORIZED");
  r.state.request = false; assert.equal((await r.cancel({ actorId: "sitter" })).status, "REQUEST_REQUIRED");
  r.state.request = true; assert.equal((await r.cancel({ actorId: "sitter" })).status, "CANCELED");
});
test("completed terminal booking cannot be canceled", async () => { const f = await fixture(); f.booking.status = "COMPLETED"; assert.equal(inspectCanonicalCancellation(f.booking, f.now).status, "INVALID_STATUS"); });
test("missing booking and noncanonical input are explicit", () => {
  assert.equal(inspectCanonicalCancellation(null).status, "NOT_FOUND"); assert.equal(inspectCanonicalCancellation({ id: "legacy" }).status, "NOT_CANONICAL");
});
test("legacy fee remains rounded 15 percent and null cannot become zero", () => { assert.equal(calculateCancellationFeeCents(2750), 413); assert.equal(calculateCancellationFeeCents(0), 0); assert.throws(() => calculateCancellationFeeCents(null)); });
for (const waived of [false, true]) test(`legacy cancellation unchanged with waived=${waived}`, async () => {
  const booking = { id: "legacy", status: "CONFIRMED", clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250 };
  let write;
  const tx = { $queryRaw: async () => [{ id: "c" }], booking: { findUnique: async () => booking, updateMany: async ({ data }) => { write = data; return { count: 1 }; } }, visit: { updateMany: async ({ where }) => { assert.deepEqual(where.status.in, ["PENDING", "CONFIRMED"]); } }, bookingHistory: { create: async () => {} }, conversation: { upsert: async () => ({ id: "c" }) }, message: { create: async () => {} } };
  assert.equal((await cancelBookingTransaction({ tx, bookingId: "legacy", actorId: "operator", cancellationFeeCents: waived ? 0 : 413, cancellationFeeWaived: waived, cancellationFeeRateBps: waived ? 0 : 1500, systemMessage: "Legacy cancellation" })).ok, true);
  assert.equal(write.cancellationFeeCents, waived ? 0 : 413); assert.equal(write.cancellationFeeWaived, waived); assert.equal(write.cancellationFeeRateBps, waived ? 0 : 1500);
  for (const status of ["CANCELED", "COMPLETED"]) { booking.status = status; assert.equal((await cancelBookingTransaction({ tx, bookingId: "legacy" })).reason, status === "CANCELED" ? "ALREADY_CANCELED" : status); }
});

test("requested booking with committed compensation is contradictory and remains review-only", async () => {
  const f = await fixture({ requested: true, committed: true }), r = runtime(f), before = structuredClone(f.booking);
  assert.equal((await r.cancel()).reviewReason, "COMPENSATION_STATUS_CONTRADICTION"); assert.deepEqual(r.state.booking, before);
});
for (const error of [{ code: "P2034" }, { code: "P2010", meta: { code: "40001" } }, { code: "P2010", meta: { code: "40P01" } }]) test(`transaction conflict ${error.meta?.code || error.code} retries with one persisted transition`, async () => {
  const r = runtime(await fixture()); let attempts = 0;
  const db = { $transaction: (...args) => { if (++attempts === 1) throw error; return r.db.$transaction(...args); } };
  assert.equal((await r.cancel({ db })).status, "CANCELED"); assert.equal(attempts, 2); assert.equal(r.state.history.length, 1);
});
test("persistent serialization conflict returns a stable retry outcome without writes", async () => {
  const r = runtime(await fixture()); let attempts = 0;
  const db = { $transaction: () => { attempts++; throw { code: "P2034" }; } };
  assert.equal((await r.cancel({ db })).status, "CANCELLATION_TRANSACTION_CONFLICT"); assert.equal(attempts, 3); assert.equal(r.state.history.length, 0);
});

for (const committed of [false, true]) test(`business-assigned pre-service cancellation, committed=${committed}`, async () => {
  const f = await fixture({ business: true, committed }), r = runtime(f), before = structuredClone(f.booking);
  assert.equal((await r.cancel()).status, "CANCELED"); assert.deepEqual(r.state.booking.pricingSnapshot, before.pricingSnapshot); assert.deepEqual(r.state.booking.sitterCompensation, before.sitterCompensation);
});
