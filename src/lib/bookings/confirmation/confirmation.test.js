import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { confirmBookingWithDb, assignBookingSitterWithDb } from "./confirmationService.js";

const start = new Date("2035-01-02T23:00:00Z");
const end = new Date("2035-01-03T01:00:00Z");
const now = new Date("2035-01-01T00:00:00Z");
function fixture() {
  return {
    id: "booking", operatorId: "operator", status: "REQUESTED", sitterId: "sitter",
    sitter: { id: "sitter", role: "SITTER" }, confirmedAt: null, canceledAt: null, completedAt: null,
    updatedAt: now,
    visits: [{ id: "visit", bookingId: "booking", operatorId: "operator", sitterId: "sitter",
      status: "PENDING", startTime: start, endTime: end, completedAt: null, performedBySitterId: null, updatedAt: now }],
  };
}
// Honor the actual Prisma select: omission of sitterId/times cannot pass these tests.
function project(row, select) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(select).map(([key, value]) => [key,
    value === true ? row[key] : Array.isArray(row[key])
      ? row[key].map((item) => project(item, value.select)) : project(row[key], value.select),
  ]));
}
function harness({ booking = fixture(), conflicts = [], times = [now], actorRole = "OPERATOR", fail = null, updateCount = 1 } = {}) {
  const state = { booking, history: [], queries: [], attempts: 0 };
  return { state, db: { async $transaction(work, options) {
    assert.equal(options.isolationLevel, "Serializable");
    state.attempts++;
    const copy = structuredClone({ booking: state.booking, history: state.history });
    let clockReads = 0;
    const result = await work({
      async $queryRaw(strings) {
        const sql = strings.join("?"); state.queries.push(sql);
        if (sql.includes("clock_timestamp")) return [{ now: times[Math.min(clockReads++, times.length - 1)] }];
        return [{ id: "locked" }];
      },
      user: { async findUnique({ where }) { return { role: where.id === "operator" ? actorRole : "SITTER" }; } },
      booking: {
        async findUnique({ select }) { return project(copy.booking, select); },
        async updateMany({ where, data }) {
          assert.equal(where.status, "REQUESTED"); assert.equal(where.sitterId, copy.booking.sitterId);
          Object.assign(copy.booking, data); return { count: updateCount };
        },
        async update({ data }) { Object.assign(copy.booking, data); },
      },
      visit: {
        async findFirst({ where }) {
          assert(state.queries.some((q) => q.includes('FROM "Visit"') && q.includes("FOR UPDATE")));
          assert.equal(where.booking.status.not, "CANCELED");
          assert.deepEqual(where.OR, [{ status: "CONFIRMED" }, { status: "PENDING", booking: { status: "CONFIRMED" } }]);
          return conflicts.find((v) => v.bookingId !== where.bookingId.not && v.sitterId === where.sitterId &&
            v.bookingStatus !== "CANCELED" && (v.status === "CONFIRMED" || (v.status === "PENDING" && v.bookingStatus === "CONFIRMED")) &&
            v.startTime < where.startTime.lt && v.endTime > where.endTime.gt) ?? null;
        },
        async updateMany({ where, data }) {
          for (const v of copy.booking.visits) {
            if (typeof where.status === "string" ? v.status === where.status : where.status.in.includes(v.status)) Object.assign(v, data);
          }
        },
      },
      bookingHistory: { async create({ data }) { copy.history.push(data); if (fail) throw fail; } },
    });
    Object.assign(state, copy);
    return result;
  } } };
}
const confirm = (h, extras = {}) => confirmBookingWithDb({ db: h.db, bookingId: "booking", actorId: "operator", ...extras });

test("REQUESTED confirms persisted cross-midnight Visits atomically", async () => {
  const h = harness(); assert.equal((await confirm(h)).code, "CONFIRMED");
  assert.equal(h.state.booking.status, "CONFIRMED"); assert.equal(h.state.booking.visits[0].status, "CONFIRMED");
  assert.deepEqual(h.state.booking.confirmedAt, now); assert.equal(h.state.history.length, 1);
  assert.deepEqual([h.state.booking.visits[0].startTime, h.state.booking.visits[0].endTime], [start, end]);
});
test("same Booking replay preserves every timestamp, Visit and history event", async () => {
  const h = harness(); await confirm(h);
  const original = structuredClone({ booking: h.state.booking, history: h.state.history });
  assert.equal((await confirm(h)).code, "ALREADY_CONFIRMED");
  assert.deepEqual({ booking: h.state.booking, history: h.state.history }, original);
});
test("elapsed time alone does not make matching confirmation replay a new transition", async () => {
  const b = fixture(); b.status = "CONFIRMED"; b.visits[0].status = "CONFIRMED"; b.confirmedAt = now;
  const h = harness({ booking: b, times: [end] }); assert.equal((await confirm(h)).code, "ALREADY_CONFIRMED");
  assert.equal(h.state.history.length, 0);
});

for (const [name, mutate, code] of [
  ["canceled", (b) => { b.status = "CANCELED"; }, "INVALID_BOOKING_STATUS"],
  ["completed", (b) => { b.status = "COMPLETED"; }, "INVALID_BOOKING_STATUS"],
  ["cancellation timestamp", (b) => { b.canceledAt = now; }, "INVALID_BOOKING_STATUS"],
  ["completion timestamp", (b) => { b.completedAt = now; }, "INVALID_BOOKING_STATUS"],
  ["missing sitter", (b) => { b.sitterId = null; }, "SITTER_NOT_ASSIGNED"],
  ["non-SITTER", (b) => { b.sitter.role = "OPERATOR"; }, "INVALID_SITTER"],
  ["missing sitter relation", (b) => { b.sitter = null; }, "INVALID_SITTER"],
  ["no visits", (b) => { b.visits = []; }, "NO_VISITS"],
  ["unassigned Visit", (b) => { b.visits[0].sitterId = null; }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["mismatched sitter", (b) => { b.visits[0].sitterId = "other"; }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["mixed sitters", (b) => { b.visits.push({ ...b.visits[0], id: "second", sitterId: "other" }); }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["wrong operator", (b) => { b.visits[0].operatorId = "other"; }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["wrong Booking", (b) => { b.visits[0].bookingId = "other"; }, "VISIT_ASSIGNMENT_MISMATCH"],
  ["invalid date", (b) => { b.visits[0].startTime = new Date(NaN); }, "VISIT_TIME_INVALID"],
  ["missing end", (b) => { b.visits[0].endTime = null; }, "VISIT_TIME_INVALID"],
  ["zero interval", (b) => { b.visits[0].endTime = start; }, "VISIT_TIME_INVALID"],
  ["reversed interval", (b) => { b.visits[0].endTime = now; }, "VISIT_TIME_INVALID"],
  ["canceled Visit", (b) => { b.visits[0].status = "CANCELED"; }, "INVALID_VISIT_STATE"],
  ["completed Visit", (b) => { b.visits[0].status = "COMPLETED"; }, "INVALID_VISIT_STATE"],
  ["performed Visit", (b) => { b.visits[0].performedBySitterId = "sitter"; }, "INVALID_VISIT_STATE"],
  ["Visit completion timestamp", (b) => { b.visits[0].completedAt = now; }, "INVALID_VISIT_STATE"],
  ["confirmed with pending Visit", (b) => { b.status = "CONFIRMED"; }, "INVALID_VISIT_STATE"],
  ["self overlapping visits", (b) => { b.visits.push({ ...b.visits[0], id: "second" }); }, "SITTER_UNAVAILABLE"],
]) test(`${name} fails closed without history or mutations`, async () => {
  const b = fixture(); mutate(b); const h = harness({ booking: b }); const before = structuredClone(b);
  assert.equal((await confirm(h)).code, code); assert.equal(JSON.stringify(h.state.booking), JSON.stringify(before)); assert.equal(h.state.history.length, 0);
});
test("missing Booking", async () => assert.equal((await confirm(harness({ booking: null }))).code, "BOOKING_NOT_FOUND"));
test("non-operator cannot invoke DB boundary", async () => assert.equal((await confirm(harness({ actorRole: "SITTER" }))).code, "NOT_AUTHORIZED"));
test("missing input fails with a stable error", async () => assert.equal((await confirmBookingWithDb()).code, "INVALID_INPUT"));

for (const [name, clock, code] of [
  ["before start", new Date(+start - 1), "CONFIRMED"],
  ["exactly at start", start, "VISIT_ALREADY_STARTED"],
  ["after start", new Date(+start + 1), "VISIT_ALREADY_STARTED"],
  ["invalid DB clock", null, "INVALID_DATABASE_TIME"],
]) test(name, async () => {
  const h = harness({ times: [clock] }); assert.equal((await confirm(h)).code, code);
  assert.equal(h.state.history.length, code === "CONFIRMED" ? 1 : 0);
});
test("crossing start during final writes rolls back the complete transition", async () => {
  const h = harness({ times: [new Date(+start - 1), start] });
  assert.equal((await confirm(h)).code, "VISIT_ALREADY_STARTED");
  assert.equal(h.state.booking.status, "REQUESTED"); assert.equal(h.state.history.length, 0);
});
test("multiple consistent, back-to-back Visit assignments succeed", async () => {
  const b = fixture(); b.visits.push({ ...b.visits[0], id: "second", startTime: end, endTime: new Date(+end + 3600000) });
  assert.equal((await confirm(harness({ booking: b }))).code, "CONFIRMED");
});
for (const [name, override, code] of [
  ["overlap", {}, "SITTER_UNAVAILABLE"],
  ["enclosing interval", { startTime: now, endTime: new Date(+end + 1) }, "SITTER_UNAVAILABLE"],
  ["back-to-back after", { startTime: end, endTime: new Date(+end + 3600000) }, "CONFIRMED"],
  ["back-to-back before", { startTime: now, endTime: start }, "CONFIRMED"],
  ["canceled Booking", { bookingStatus: "CANCELED" }, "CONFIRMED"],
  ["canceled Visit", { status: "CANCELED" }, "CONFIRMED"],
  ["completed Visit", { status: "COMPLETED" }, "CONFIRMED"],
  ["different sitter", { sitterId: "other" }, "CONFIRMED"],
  ["same Booking excluded", { bookingId: "booking" }, "CONFIRMED"],
  ["requested pending Visit", { status: "PENDING", bookingStatus: "REQUESTED" }, "CONFIRMED"],
  ["confirmed Booking pending Visit", { status: "PENDING" }, "SITTER_UNAVAILABLE"],
  ["legacy requested confirmed Visit", { bookingStatus: "REQUESTED" }, "SITTER_UNAVAILABLE"],
]) test(`availability: ${name}`, async () => {
  const h = harness({ conflicts: [{ id: "conflict", bookingId: "other", sitterId: "sitter", status: "CONFIRMED", bookingStatus: "CONFIRMED", startTime: start, endTime: end, ...override }] });
  assert.equal((await confirm(h)).code, code); assert.equal(h.state.history.length, code === "CONFIRMED" ? 1 : 0);
});
test("availability covers every persisted Visit", async () => {
  const b = fixture(); const second = { ...b.visits[0], id: "second", startTime: end, endTime: new Date(+end + 3600000) }; b.visits.push(second);
  const h = harness({ booking: b, conflicts: [{ ...second, bookingId: "other", status: "CONFIRMED", bookingStatus: "CONFIRMED" }] });
  assert.equal((await confirm(h)).code, "SITTER_UNAVAILABLE");
});
test("confirmed replay refuses contradictory assignment", async () => {
  const b = fixture(); b.status = "CONFIRMED"; b.visits[0].status = "CONFIRMED"; b.visits[0].sitterId = "other";
  assert.equal((await confirm(harness({ booking: b }))).code, "VISIT_ASSIGNMENT_MISMATCH");
});
test("guarded transition failure rolls back without history", async () => {
  const h = harness({ updateCount: 0 }); assert.equal((await confirm(h)).code, "CONCURRENT_CONFIRMATION_CONFLICT");
  assert.equal(h.state.booking.status, "REQUESTED"); assert.equal(h.state.history.length, 0);
});
test("raw persistence errors are hidden and history failure rolls back", async () => {
  const h = harness({ fail: new Error("SECRET DATABASE DETAIL") }); const result = await confirm(h);
  assert.equal(result.code, "BOOKING_PERSISTENCE_ERROR"); assert(!JSON.stringify(result).includes("SECRET"));
  assert.equal(h.state.booking.status, "REQUESTED"); assert.equal(h.state.history.length, 0);
});
for (const error of [{ code: "P2034" }, { code: "40001" }, { code: "40P01" }, { code: "P2010", meta: { code: "40001" } }]) {
  test(`${JSON.stringify(error)} retries a fresh transaction at most three times`, async () => {
    const h = harness(); const run = h.db.$transaction; let calls = 0;
    h.db.$transaction = (...args) => { if (++calls < 3) throw error; return run(...args); };
    assert.equal((await confirm(h)).code, "CONFIRMED"); assert.equal(calls, 3); assert.equal(h.state.history.length, 1);
    calls = 0; h.db.$transaction = () => { calls++; throw error; };
    assert.equal((await confirm(h)).code, "CONCURRENT_CONFIRMATION_CONFLICT"); assert.equal(calls, 3);
  });
}
test("legacy and canonical-shaped inputs produce the same operational result", async () => {
  for (const money of [2500, null]) {
    const b = fixture(); b.clientTotalCents = money; b.canonicalSchedule = money === null ? { kind: "OVERNIGHT_STAY" } : null;
    const h = harness({ booking: b }); assert.equal((await confirm(h)).code, "CONFIRMED");
    assert.equal(h.state.booking.clientTotalCents, money);
  }
});
test("whole-booking reassignment with completed care is blocked without changing performer or history", async () => {
  const b = fixture(); b.visits.push({ ...b.visits[0], id: "complete", status: "COMPLETED", performedBySitterId: "sitter" });
  const h = harness({ booking: b });
  assert.equal((await assignBookingSitterWithDb({ db: h.db, bookingId: b.id, actorId: "operator", sitterId: "other" })).code, "CARE_ALREADY_STARTED");
  assert.equal(h.state.booking.visits[0].sitterId, "sitter"); assert.equal(h.state.booking.visits[1].sitterId, "sitter");
  assert.equal(h.state.history.length, 0); assert.equal(h.state.booking.visits[1].performedBySitterId, "sitter");
});
test("operator wrappers retain authorization, ID resolution and postcommit revalidation", async () => {
  const source = await readFile(new URL("../../../app/dashboard/operator/bookings/actions.js", import.meta.url), "utf8");
  const action = source.slice(source.indexOf("export async function confirmBooking"), source.indexOf("// ---- CANCEL ----"));
  assert.match(action, /requireRole\(\["OPERATOR"\]\)/); assert.match(action, /resolveBookingId\(arg1, arg2\)/);
  assert.match(action, /await confirmBookingWithDb/); assert.match(action, /if \(result.ok\) revalidateOperator/);
  assert(!/send.*Email|compensation|pricing/i.test(action));
});
