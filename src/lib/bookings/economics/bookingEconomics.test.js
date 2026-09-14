import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compensationFixture } from "../compensation/fixtures.js";
import { readBookingEconomics, clientTotalDisplay, sitterPayoutDisplay, aggregateBookingAmounts, completionGuard, cancellationGuard, visitPayoutEstimate, sumKnownAmounts, economicsSelect } from "./bookingEconomics.js";
import { completeVisitWithDb, completeWholeBookingWithDb } from "./completionService.js";
import { calculateCancellationFeeCents, cancelBookingTransaction } from "../cancelBookingTransaction.js";
const legacy = () => ({ id: "booking", status: "CONFIRMED", sitterId: "sitter", clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
  visits: [{ id: "visit-0", bookingId: "booking", sitterId: "sitter", status: "CONFIRMED", performedBySitterId: null, startTime: new Date("2030-09-12T13:00:00Z"), endTime: new Date("2030-09-12T13:30:00Z") }] });
async function canonical({ committed = false, reward = false } = {}) {
  const f = compensationFixture({ reward: reward ? "RESERVED" : null });
  if (committed) await f.commit();
  return { ...f.state.booking, rewardReservation: f.state.reservation };
}
function harness(booking) {
  const state = { booking: structuredClone(booking), history: [], visitWrites: 0, bookingWrites: 0, selects: [] };
  const tx = {
    async $queryRaw() { return []; },
    booking: {
      async findUnique(args) { state.selects.push(args); return state.booking; },
      async update({ data }) { state.bookingWrites++; Object.assign(state.booking, data); return state.booking; },
    },
    visit: {
      async findUnique() { return { bookingId: state.booking.id }; },
      async update({ where, data }) { state.visitWrites++; Object.assign(state.booking.visits.find((v) => v.id === where.id), data); },
    },
    bookingHistory: { async create({ data }) { state.history.push(data); } },
  };
  return { state, tx, db: { async $transaction(work, config) { assert.equal(config.isolationLevel, "Serializable"); return work(tx); } } };
}
const complete = (h, actorRole = "SITTER") => completeVisitWithDb({ db: h.db, visitId: "visit-0", actorId: actorRole === "SITTER" ? "sitter" : "operator", actorRole, now: new Date("2030-09-12T13:10:00Z") });

test("legacy stored client total and payout retain independent historical semantics", () => {
  const e = readBookingEconomics(legacy()); assert.equal(e.economicsKind, "LEGACY"); assert.equal(e.client.totalCents, 2750); assert.equal(e.sitter.payoutCents, 2250); assert.equal(e.legacyPlatformFeeCents, 500); assert.equal(e.client.feeCents, null); assert.equal(e.sitter.feeCents, null);
});
test("canonical client total, service and fee come exclusively from frozen pricing", async () => {
  const b = await canonical(); const e = readBookingEconomics(b); assert.deepEqual([e.client.subtotalCents, e.client.feeCents, e.client.totalCents, e.client.currency], [2500, 250, 2750, "USD"]); assert.equal(e.legacyPlatformFeeCents, null);
});
test("canonical null legacy columns produce pending compensation, never zero", async () => {
  const e = readBookingEconomics(await canonical()); assert.equal(e.sitter.status, "PENDING"); assert.equal(e.sitter.payoutCents, null); assert.equal(e.sitter.subtotalCents, null);
});
test("committed canonical sitter snapshot supplies frozen amounts and lane", async () => {
  const e = readBookingEconomics(await canonical({ committed: true })); assert.deepEqual([e.sitter.subtotalCents, e.sitter.feeCents, e.sitter.payoutCents, e.sitter.compensationLane], [2500, 250, 2250, "SITTER_ORIGINATED"]);
});
test("reward-applied snapshot displays frozen 2375 payout", async () => {
  const b = await canonical({ committed: true, reward: true }); assert.equal(sitterPayoutDisplay(b), "$23.75"); assert.equal(readBookingEconomics(b).sitter.rewardApplied, true);
});
for (const [name, change, reason] of [
  ["missing canonical pricing", (b) => b.pricingSnapshot = null, "PRICING_SNAPSHOT_REQUIRED"],
  ["unloaded pricing", (b) => delete b.pricingSnapshot, "PRICING_SNAPSHOT_REQUIRED"],
  ["populated legacy column", (b) => b.clientTotalCents = 2750, "PRICING_SNAPSHOT_INVALID"],
  ["snapshot from other booking", (b) => b.pricingSnapshot.bookingId = "other", "PRICING_SNAPSHOT_INVALID"],
  ["unbalanced pricing", (b) => b.pricingSnapshot.clientTotalCents++, "PRICING_SNAPSHOT_INVALID"],
  ["currency mismatch", (b) => b.pricingSnapshot.currency = "EUR", "PRICING_SNAPSHOT_INVALID"],
]) test(`${name} fails closed without fallback`, async () => { const b = await canonical(); change(b); const e = readBookingEconomics(b); assert.equal(e.client.reason, reason); assert.equal(e.client.totalCents, null); assert.equal(completionGuard(b).ok, false); });
for (const [name, change] of [
  ["wrong sitter", (b) => b.sitterCompensation.sitterId = "other"],
  ["wrong quantity", (b) => b.sitterCompensation.quantity++],
  ["unbalanced compensation", (b) => b.sitterCompensation.sitterPayoutCents++],
  ["wrong lane", (b) => b.sitterCompensation.compensationLane = "BUSINESS_ASSIGNED"],
  ["unloaded compensation", (b) => delete b.sitterCompensation],
  ["invalid reward consumption", (b) => b.rewardReservation.status = "RESERVED"],
]) test(`${name} preserves client total but blocks sitter amount and completion`, async () => { const b = await canonical({ committed: true, reward: true }); change(b); const e = readBookingEconomics(b); assert.equal(e.client.totalCents, 2750); assert.equal(e.sitter.payoutCents, null); assert.equal(completionGuard(b).code, "COMPENSATION_REQUIRED_FOR_COMPLETION"); });
test("partial legacy money is unavailable, never null arithmetic", () => { const b = legacy(); b.sitterPayoutCents = null; assert.equal(readBookingEconomics(b).client.totalCents, null); assert.equal(aggregateBookingAmounts([b]).totalCents, null); });
test("mixed client charges aggregate even while canonical payout is pending", async () => { assert.deepEqual(aggregateBookingAmounts([legacy(), await canonical()]), { totalCents: 5500, knownTotalCents: 5500, pendingCount: 0, unavailableCount: 0 }); });
test("mixed committed payouts aggregate", async () => { assert.equal(aggregateBookingAmounts([legacy(), await canonical({ committed: true, reward: true })], "sitter").totalCents, 4625); });
test("pending payouts flag incomplete aggregate and retain known subtotal", async () => { assert.deepEqual(aggregateBookingAmounts([legacy(), await canonical()], "sitter"), { totalCents: null, knownTotalCents: 2250, pendingCount: 1, unavailableCount: 0 }); });
test("unavailable client pricing flags aggregate rather than dropping row", async () => { const b = await canonical(); b.pricingSnapshot = null; assert.equal(aggregateBookingAmounts([legacy(), b]).unavailableCount, 1); assert.equal(aggregateBookingAmounts([legacy(), b]).totalCents, null); });
test("platform fee cannot accidentally become a generic aggregate", () => { assert.throws(() => aggregateBookingAmounts([legacy()], "fee")); });
test("legacy per-visit estimate unchanged; canonical allocation explicitly unavailable", async () => { assert.equal(visitPayoutEstimate(legacy(), 3), 750); assert.equal(visitPayoutEstimate(await canonical({ committed: true }), 3), null); assert.equal(sumKnownAmounts([750, null]), null); });
for (const surface of ["operator table", "operator detail", "client detail"]) test(`${surface} total display supports frozen canonical and legacy totals`, async () => { assert.equal(clientTotalDisplay(await canonical()), "$27.50"); assert.equal(clientTotalDisplay(legacy()), "$27.50"); });
for (const surface of ["operator detail", "sitter card", "sitter table", "sitter detail", "route panel"]) test(`${surface} payout display distinguishes committed, pending, and legacy`, async () => { assert.equal(sitterPayoutDisplay(await canonical()), "Pending"); assert.equal(sitterPayoutDisplay(await canonical({ committed: true })), "$22.50"); assert.equal(sitterPayoutDisplay(legacy()), "$22.50"); });
test("historical readers neither recalculate rates nor mutate frozen input", async () => {
  const b = await canonical({ committed: true, reward: true }); const before = structuredClone(b); readBookingEconomics(b); assert.deepEqual(b, before);
  const source = await readFile(new URL("./bookingEconomics.js", import.meta.url), "utf8"); assert(!/import .*pricing|calculateCanonical|calculateSitter|calculateClient|\.update\(|\.create\(/.test(source));
});
for (const role of ["SITTER", "OPERATOR"]) {
  test(`${role} final visit persists with stable booking block; retry has no duplicate writes`, async () => {
    const h = harness(await canonical()); const result = await complete(h, role); assert.equal(result.ok, true); assert.equal(result.code, "COMPENSATION_REQUIRED_FOR_COMPLETION"); assert.equal(result.completionBlocked, true); assert.equal(h.state.booking.visits[0].status, "COMPLETED"); assert.equal(h.state.booking.status, "CONFIRMED"); assert.equal(h.state.bookingWrites, 0);
    const before = structuredClone(h.state); const retry = await complete(h, role); assert.equal(retry.alreadyCompleted, true); assert.equal(retry.code, result.code); assert.equal(h.state.visitWrites, 1); assert.deepEqual(h.state.history, before.history);
  });
  test(`${role} valid canonical compensation permits normal auto-completion without rewriting money`, async () => { const h = harness(await canonical({ committed: true })); assert.equal((await complete(h, role)).ok, true); assert.equal(h.state.booking.status, "COMPLETED"); assert.deepEqual([h.state.booking.clientTotalCents, h.state.booking.platformFeeCents, h.state.booking.sitterPayoutCents], [null, null, null]); assert.equal(h.state.booking.sitterCompensation.sitterPayoutCents, 2250); });
  test(`${role} legacy visit auto-completion remains operational`, async () => { const h = harness(legacy()); assert.equal((await complete(h, role)).ok, true); assert.equal(h.state.booking.status, "COMPLETED"); });
}
test("whole-booking completion enforces required compensation", async () => { const b = await canonical(); b.visits[0].status = "COMPLETED"; const h = harness(b); assert.equal((await completeWholeBookingWithDb({ db: h.db, bookingId: b.id, actorId: "operator" })).code, "COMPENSATION_REQUIRED_FOR_COMPLETION"); assert.equal(h.state.bookingWrites, 0); });
test("whole-booking canonical completion uses independent snapshots, not legacy equation", async () => { const b = await canonical({ committed: true }); b.visits[0].status = "COMPLETED"; const h = harness(b); assert.equal((await completeWholeBookingWithDb({ db: h.db, bookingId: b.id, actorId: "operator" })).ok, true); assert.equal(h.state.visitWrites, 0); });
test("legacy whole-booking equation remains enforced", async () => { const b = legacy(); b.visits[0].status = "COMPLETED"; b.platformFeeCents++; const h = harness(b); assert.equal((await completeWholeBookingWithDb({ db: h.db, bookingId: b.id, actorId: "operator" })).code, "LEGACY_PAYMENT_INCONSISTENT"); assert.equal(h.state.bookingWrites, 0); });
test("contradictory compensation persists visit but blocks booking", async () => { const b = await canonical({ committed: true }); b.sitterCompensation.sitterId = "other"; const h = harness(b); assert.equal((await complete(h)).code, "COMPENSATION_REQUIRED_FOR_COMPLETION"); assert.equal(h.state.booking.visits[0].status, "COMPLETED"); assert.equal(h.state.booking.status, "CONFIRMED"); });
test("missing pricing persists operational completion but blocks booking", async () => { const b = await canonical(); b.pricingSnapshot = null; const h = harness(b); assert.equal((await complete(h)).code, "PRICING_SNAPSHOT_REQUIRED"); assert.equal(h.state.booking.visits[0].status, "COMPLETED"); });
test("legacy cancellation math remains 15 percent with rounding", () => { assert.equal(calculateCancellationFeeCents(2750), 413); assert.equal(calculateCancellationFeeCents(0), 0); assert.throws(() => calculateCancellationFeeCents(null)); assert.equal(cancellationGuard(legacy()).ok, true); });
test("canonical cancellation transaction guards even waived fees before any writes", async () => { const b = await canonical(); const tx = { booking: { async findUnique() { return b; } } }; const result = await cancelBookingTransaction({ tx, bookingId: b.id, cancellationFeeCents: 0, cancellationFeeWaived: true }); assert.equal(result.reason, "CANONICAL_CANCELLATION_REQUIRES_REVIEW"); assert.equal(result.ok, false); });
test("all retained completion actions delegate to the canonical gate, with no retroactive commitment", async () => {
  for (const [path, name] of [["../../../app/dashboard/operator/bookings/actions.js", "completeWholeBookingWithDb"], ["../../../app/dashboard/sitter/actions.js", "completeVisitWithDb"], ["../../../app/actions/completeBooking.js", "guardedCompleteBooking"]]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8"); assert(source.includes(name)); assert(!source.includes('status: "COMPLETED"')); assert(!source.includes("commitBookingSitterCompensation"));
  }
});
test("financial select includes both snapshots and discriminator in a single Booking read", () => { for (const key of ["pricingSnapshot", "sitterCompensation", "canonicalCreationKey", "canonicalInputHash", "careOptionId", "attributionSnapshot", "rewardReservation"]) assert(economicsSelect[key]); });

test("Prisma wrapped serialization failure retries outside the failed transaction", async () => {
  const h = harness(await canonical()); let attempts = 0;
  const db = { async $transaction(work, config) { if (++attempts === 1) throw { code: "P2010", meta: { code: "40001" } }; return h.db.$transaction(work, config); } };
  const result = await completeVisitWithDb({ db, visitId: "visit-0", actorId: "operator", actorRole: "OPERATOR" });
  assert.equal(result.code, "COMPENSATION_REQUIRED_FOR_COMPLETION"); assert.equal(attempts, 2); assert.equal(h.state.visitWrites, 1);
});
test("retry exhaustion returns stable conflict without operational writes", async () => {
  let attempts = 0; const db = { async $transaction() { attempts++; throw { code: "P2010", meta: { code: "40001" } }; } };
  const result = await completeVisitWithDb({ db, visitId: "visit-0", actorId: "operator", actorRole: "OPERATOR" });
  assert.equal(result.code, "COMPLETION_TRANSACTION_CONFLICT"); assert.equal(attempts, 3);
});
test("confirmed visit with prior performer evidence cannot be overwritten by sitter", async () => {
  const b = legacy(); b.visits[0].performedBySitterId = "other"; const h = harness(b); assert.equal((await complete(h)).ok, false); assert.equal(h.state.visitWrites, 0);
});
test("later whole-booking completion reads approved existing compensation without rewriting completed visits", async () => {
  const b = await canonical({ committed: true }); const snapshot = b.sitterCompensation; b.sitterCompensation = null;
  const h = harness(b); await complete(h); const visits = structuredClone(h.state.booking.visits);
  // Represents an externally approved state; the completion service never creates it.
  h.state.booking.sitterCompensation = snapshot;
  assert.equal((await completeWholeBookingWithDb({ db: h.db, bookingId: b.id, actorId: "operator" })).ok, true);
  assert.deepEqual(h.state.booking.visits, visits); assert.equal(h.state.visitWrites, 1);
});
for (const [path, expressions] of [
  ["../../../app/dashboard/operator/_components/BookingsTable.jsx", ["clientTotalDisplay(b, formatMoney)"]],
  ["../../../app/dashboard/operator/bookings/[id]/page.jsx", ["...economicsInclude", "clientTotalDisplay(booking, formatMoney)", "displaySitterPayout(booking)"]],
  ["../../../app/client/bookings/[clientLinkToken]/page.jsx", ["...economicsInclude", "economics.client.subtotalCents", "economics.client.feeCents"]],
  ["../../../app/dashboard/sitter/bookings/[id]/page.jsx", ["...economicsInclude", "displaySitterPayout(booking)"]],
  ["../../../app/dashboard/sitter/_components/BookingCard.jsx", ["displaySitterPayout(booking)"]],
  ["../../../app/dashboard/sitter/_components/BookingTable.jsx", ["displaySitterPayout(booking)"]],
  ["../../../app/dashboard/sitter/_components/SitterRoutePanel.jsx", ["displaySitterPayout(selectedBooking)"]],
  ["../../../app/dashboard/sitter/page.jsx", ["...economicsInclude", "...economicsSelect", "visitPayoutEstimate(visit.booking, totalVisits)"]],
  ["../../../app/dashboard/operator/operations/page.jsx", ["...economicsSelect", "visitPayoutEstimate(visit.booking, visitCount)"]],
  ["../../../app/dashboard/operator/lib/dashboardData.js", ["...economicsInclude", "...economicsSelect", "aggregateBookingAmounts(rows)"]],
]) test(`reader wiring: ${path}`, async () => {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const expression of expressions) assert(source.includes(expression), expression);
  assert(!/\.(?:clientTotalCents|platformFeeCents|sitterPayoutCents)\s*(?:\?\?|\|\|)\s*0/.test(source));
});
test("unloaded reward linkage cannot silently validate committed compensation", async () => { const b = await canonical({ committed: true }); delete b.rewardReservation; assert.equal(readBookingEconomics(b).sitter.status, "UNAVAILABLE"); });
test("invalid all-null legacy state cannot bypass automatic completion", () => { const b = legacy(); b.clientTotalCents = b.platformFeeCents = b.sitterPayoutCents = null; assert.equal(completionGuard(b, { legacyInvariant: false }).ok, false); assert.equal(clientTotalDisplay(b, () => "$0.00"), "Unavailable"); });
test("completion rejects Visit count that contradicts frozen quantity", async () => { const b = await canonical({ committed: true }); b.visits.push({ ...b.visits[0], id: "unexpected" }); assert.equal(completionGuard(b).code, "COMPENSATION_REQUIRED_FOR_COMPLETION"); });
