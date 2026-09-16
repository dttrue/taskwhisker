import { cleanupVisitFinance } from "../../../../scripts/visit-compensation-qa.mjs";
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authenticateCanonicalQa, protectedState } from "../../../../scripts/canonical-booking-qa.mjs";
import { confirmBookingWithDb, assignBookingSitterWithDb } from "./confirmationService.js";
import { createCanonicalBookingWithDb } from "../canonical/createCanonicalBooking.js";
import { optionFixture, bookingInput, overnightSchedule } from "../canonical/fixtures.js";

// Test-only transaction instrumentation; never exposed through the server action.
function instrument(db, hook) {
  return { $transaction(work, options) {
    return db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
      if (key === "$queryRaw") return async (strings, ...values) => {
        await hook("query:before", strings.join("?"));
        return target.$queryRaw(strings, ...values);
      };
      if (["booking", "visit", "bookingHistory"].includes(key)) return new Proxy(target[key], { get(delegate, operation) {
        if (typeof delegate[operation] !== "function") return delegate[operation];
        return async (...args) => {
          const result = await delegate[operation](...args);
          await hook(`${key}.${operation}:after`, result);
          return result;
        };
      } });
      return target[key];
    } })), options);
  } };
}
function rendezvous() {
  let arrivals = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const timer = setTimeout(release, 10000);
  return { async arrive() {
    if (arrivals >= 2) return;
    arrivals++;
    if (arrivals === 2) { clearTimeout(timer); release(); }
    await gate;
    assert.equal(arrivals, 2, "Two real PostgreSQL transactions must reach the barrier.");
  }, close() { clearTimeout(timer); release(); }, count: () => arrivals };
}
function pauseOnce(db) {
  let release, reached, used = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { reached = resolve; });
  const timer = setTimeout(() => { release(); reached(); }, 10000);
  return { ready, release() { clearTimeout(timer); release(); }, db: instrument(db, async (event, sql) => {
    // Actor lookup has established a Serializable snapshot before this pause.
    if (!used && event === "query:before" && sql.includes('FROM "Booking"')) {
      used = true; reached(); await gate;
    }
  }) };
}

test("guarded PostgreSQL confirmation, assignment races and cleanup", {
  skip: process.env.TASKWHISKER_CONFIRMATION_QA_TESTS !== "1", timeout: 300000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db = new PrismaClient(), marker = `confirmation-qa-${randomUUID()}`;
  const operatorId = `${marker}-operator`, sitterId = `${marker}-sitter`, otherId = `${marker}-other`, clientId = `${marker}-client`;
  const baseline = await protectedState(db);
  const originalDefault = process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID;
  let sequence = 0;
  const confirm = (bookingId, database = db) => confirmBookingWithDb({ db: database, bookingId, actorId: operatorId });
  const assign = (bookingId, nextSitterId, database = db) => assignBookingSitterWithDb({ db: database, bookingId, actorId: operatorId, sitterId: nextSitterId });
  const state = (id) => db.booking.findUnique({ where: { id }, include: { visits: { orderBy: { id: "asc" } }, history: { orderBy: { id: "asc" } } } });
  async function create({ start, end, sitter = sitterId, status = "REQUESTED", visitStatus = "PENDING", money = 2500 } = {}) {
    const id = `${marker}-booking-${++sequence}`;
    start ??= new Date(Date.UTC(2035, 0, sequence * 2, 10)); end ??= new Date(+start + 3600000);
    return db.booking.create({ data: {
      id, clientId, operatorId, sitterId: sitter, status, startTime: start, endTime: end,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
      clientTotalCents: money, platformFeeCents: money === null ? null : 250, sitterPayoutCents: money === null ? null : 2250,
      visits: { create: { operatorId, sitterId: sitter, status: visitStatus, date: start, startTime: start, endTime: end } },
    } });
  }
  try {
    await db.user.createMany({ data: [
      { id: operatorId, email: `${operatorId}@example.invalid`, role: "OPERATOR" },
      { id: sitterId, email: `${sitterId}@example.invalid`, role: "SITTER" },
      { id: otherId, email: `${otherId}@example.invalid`, role: "SITTER" },
    ] });
    await db.client.create({ data: { id: clientId, name: "Confirmation QA", email: `${clientId}@example.invalid` } });

    await t.test("successful legacy confirmation and repeated replay preserve history, timestamps and money", async () => {
      const b = await create(); assert.equal((await confirm(b.id)).code, "CONFIRMED");
      const before = await state(b.id);
      assert.equal(before.visits[0].status, "CONFIRMED"); assert.equal(before.history.length, 1);
      assert.equal(before.history[0].changedByUserId, operatorId);
      assert.equal(before.clientTotalCents, 2500); assert.equal(before.sitterPayoutCents, 2250);
      assert.equal((await confirm(b.id)).code, "ALREADY_CONFIRMED"); assert.deepEqual(await state(b.id), before);
    });
    await t.test("overlap rejection creates no history or mutation", async () => {
      const a = await create(); await confirm(a.id);
      const b = await create({ start: a.startTime, end: a.endTime }); const before = await state(b.id);
      assert.equal((await confirm(b.id)).code, "SITTER_UNAVAILABLE"); assert.deepEqual(await state(b.id), before);
    });
    await t.test("back-to-back intervals both confirm", async () => {
      const a = await create(); await confirm(a.id);
      const b = await create({ start: a.endTime, end: new Date(+a.endTime + 3600000) });
      assert.equal((await confirm(b.id)).code, "CONFIRMED");
    });
    for (const canceled of ["booking", "visit"]) await t.test(`canceled ${canceled} does not block`, async () => {
      const a = await create({ status: canceled === "booking" ? "CANCELED" : "CONFIRMED", visitStatus: canceled === "visit" ? "CANCELED" : "CONFIRMED" });
      const b = await create({ start: a.startTime, end: a.endTime }); assert.equal((await confirm(b.id)).code, "CONFIRMED");
    });
    await t.test("different sitter permits the same interval", async () => {
      const a = await create(); await confirm(a.id);
      const b = await create({ start: a.startTime, end: a.endTime, sitter: otherId }); assert.equal((await confirm(b.id)).code, "CONFIRMED");
    });
    await t.test("persisted cross-midnight Visit confirms without reconstruction", async () => {
      const b = await create({ start: new Date("2036-10-01T23:00:00Z"), end: new Date("2036-10-02T08:00:00Z"), money: null });
      assert.equal((await confirm(b.id)).code, "CONFIRMED"); const after = await state(b.id);
      assert.deepEqual([after.visits[0].startTime, after.visits[0].endTime], [b.startTime, b.endTime]);
      assert.equal(after.clientTotalCents, null);
    });
    await t.test("database time rejects an already-started Visit", async () => {
      const [clock] = await db.$queryRaw`SELECT clock_timestamp() AS "now"`;
      const b = await create({ start: clock.now, end: new Date(+clock.now + 3600000) });
      assert.equal((await confirm(b.id)).code, "VISIT_ALREADY_STARTED"); assert.equal((await state(b.id)).history.length, 0);
    });
    for (const status of ["CANCELED", "COMPLETED"]) await t.test(`${status} cannot be reopened`, async () => {
      const b = await create({ status }); assert.equal((await confirm(b.id)).code, "INVALID_BOOKING_STATUS");
      assert.equal((await state(b.id)).history.length, 0);
    });
    await t.test("confirmed Booking with pending Visit fails closed", async () => {
      const b = await create({ status: "CONFIRMED" }); assert.equal((await confirm(b.id)).code, "INVALID_VISIT_STATE");
    });
    await t.test("same Booking simultaneous confirmation writes exactly one transition", async () => {
      const b = await create(), barrier = rendezvous();
      const wrapped = instrument(db, async (event, sql) => {
        if (event === "query:before" && sql.includes('FROM "Booking"')) await barrier.arrive();
      });
      try {
        const results = await Promise.all([confirm(b.id, wrapped), confirm(b.id, wrapped)]);
        assert.deepEqual(results.map((r) => r.code).sort(), ["ALREADY_CONFIRMED", "CONFIRMED"]);
        assert.equal(barrier.count(), 2); assert.equal((await state(b.id)).history.length, 1);
      } finally { barrier.close(); }
    });
    await t.test("two overlapping confirmations both read free but only one can commit", async () => {
      const a = await create(), b = await create({ start: a.startTime, end: a.endTime }), barrier = rendezvous();
      const wrapped = instrument(db, async (event, result) => {
        if (event === "visit.findFirst:after" && barrier.count() < 2) { assert.equal(result, null); await barrier.arrive(); }
      });
      try {
        const results = await Promise.all([confirm(a.id, wrapped), confirm(b.id, wrapped)]);
        assert.deepEqual(results.map((r) => r.code).sort(), ["CONFIRMED", "SITTER_UNAVAILABLE"]);
        const rows = await Promise.all([state(a.id), state(b.id)]);
        assert.equal(rows.filter((r) => r.status === "CONFIRMED").length, 1);
        assert.equal(rows.reduce((n, r) => n + r.history.length, 0), 1); assert.equal(barrier.count(), 2);
      } finally { barrier.close(); }
    });
    await t.test("reassignment wins while confirmation holds a stale snapshot; confirmation rechecks new sitter", async () => {
      const a = await create(), blocker = await create({ start: a.startTime, end: a.endTime, sitter: otherId });
      const paused = pauseOnce(db); const pending = confirm(a.id, paused.db);
      try {
        await paused.ready; assert.equal((await assign(a.id, otherId)).code, "ASSIGNED");
        assert.equal((await confirm(blocker.id)).code, "CONFIRMED");
      } finally { paused.release(); }
      assert.equal((await pending).code, "SITTER_UNAVAILABLE");
      const row = await state(a.id); assert.equal(row.status, "REQUESTED"); assert.equal(row.sitterId, otherId);
      assert(row.visits.every((v) => v.sitterId === otherId)); assert.equal(row.history.filter((h) => h.toStatus === "CONFIRMED").length, 0);
    });
    await t.test("confirmation wins while reassignment holds a stale snapshot; reassignment checks current conflicts", async () => {
      const a = await create(), blocker = await create({ start: a.startTime, end: a.endTime, sitter: otherId });
      const paused = pauseOnce(db); const pending = assign(a.id, otherId, paused.db);
      try {
        await paused.ready; assert.equal((await confirm(a.id)).code, "CONFIRMED");
        assert.equal((await confirm(blocker.id)).code, "CONFIRMED");
      } finally { paused.release(); }
      assert.equal((await pending).code, "SITTER_UNAVAILABLE");
      const row = await state(a.id); assert.equal(row.sitterId, sitterId); assert.equal(row.history.length, 1);
    });
    await t.test("confirmed reassignment and another Booking confirmation cannot both claim the same sitter interval", async () => {
      const a = await create({ sitter: otherId }); await confirm(a.id);
      const b = await create({ start: a.startTime, end: a.endTime }), barrier = rendezvous();
      const wrapped = instrument(db, async (event, result) => {
        if (event === "visit.findFirst:after" && barrier.count() < 2) { assert.equal(result, null); await barrier.arrive(); }
      });
      try {
        const results = await Promise.all([assign(a.id, sitterId, wrapped), confirm(b.id, wrapped)]);
        assert.equal(results.filter((r) => r.ok).length, 1); assert.equal(results.filter((r) => r.code === "SITTER_UNAVAILABLE").length, 1);
        const rows = await Promise.all([state(a.id), state(b.id)]);
        assert.equal(rows.filter((r) => r.status === "CONFIRMED" && r.sitterId === sitterId).length, 1);
        assert.equal(barrier.count(), 2);
      } finally { barrier.close(); }
    });
    for (const event of ["visit.updateMany:after", "bookingHistory.create:after"]) await t.test(`failure at ${event} rolls back status, Visits and history`, async () => {
      const b = await create(), before = await state(b.id);
      const wrapped = instrument(db, async (observed) => { if (observed === event) throw new Error("FORCED_QA_ROLLBACK"); });
      assert.equal((await confirm(b.id, wrapped)).code, "BOOKING_PERSISTENCE_ERROR");
      assert.deepEqual(await state(b.id), before); assert.equal((await confirm(b.id)).code, "CONFIRMED");
    });
    for (const code of ["DROP_IN_DOG_30", "OVERNIGHT_DOG_HOME"]) await t.test(`real canonical ${code} confirms with atomic financial preparation and unchanged client/attribution snapshots`, async () => {
      process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = sitterId;
      const f = optionFixture(code);
      const { id: _offeringId, speciesPolicies, ...offering } = f.offering;
      const { id: _rateId, petCharges, ...rate } = f.clientRate;
      const option = await db.careOption.create({ data: {
        code: `${marker}-${code}`, label: f.label, primarySpecies: f.primarySpecies, durationMinutes: f.durationMinutes,
        offering: { create: { ...offering, code: `${marker}-${code}-offering`, speciesPolicies: { create: speciesPolicies } } },
        clientRate: { create: { ...rate, setByUserId: operatorId, petCharges: { create: petCharges } } },
        defaultSitterRate: { create: { baseCompensationCents: 1000, setByUserId: operatorId, defaultAdditionalCents: 100 } },
      } });
      const b = await createCanonicalBookingWithDb({ db, operatorId, creationKey: randomUUID(), input: bookingInput({
        careOptionCode: option.code, client: { name: "Confirmation QA", email: `${marker}-${code}@example.invalid` },
        ...(code.startsWith("OVERNIGHT") ? { schedule: overnightSchedule() } : {}),
      }) });
      const immutable = async () => db.booking.findUnique({ where: { id: b.id }, select: {
        canonicalSchedule: true, canonicalInputHash: true, clientTotalCents: true, platformFeeCents: true, sitterPayoutCents: true,
        pricingSnapshot: true, attributionSnapshot: true,
      } });
      const before = await immutable(); assert.equal((await confirm(b.id)).code, "CONFIRMED");
      assert.deepEqual(await immutable(), before);
      assert.equal(await db.bookingSitterCompensation.count({ where: { bookingId: b.id } }), 1);
      assert.equal(await db.visitSitterCompensationAuthorization.count({ where: { bookingId: b.id } }), b.quantity);
      assert.equal((await state(b.id)).history.filter((h) => h.toStatus === "CONFIRMED").length, 1);
    });
  } finally {
    // Every delete is scoped to this run's random fixture identities.
    try {
      await db.$transaction(async (tx) => {
      const bookingIds = (await tx.booking.findMany({ where: { operatorId }, select: { id: true } })).map((b) => b.id);
      await cleanupVisitFinance(tx, bookingIds);
      await tx.bookingSitterCompensationPetCharge.deleteMany({ where: { compensation: { bookingId: { in: bookingIds } } } });
      await tx.bookingSitterCompensation.deleteMany({ where: { bookingId: { in: bookingIds } } });
      const where = { booking: { operatorId } };
      await tx.bookingHistory.deleteMany({ where });
      await tx.visit.deleteMany({ where });
      await tx.bookingPricingSnapshot.deleteMany({ where });
      await tx.bookingAttributionSnapshot.deleteMany({ where });
      await tx.bookingPet.deleteMany({ where });
      await tx.booking.deleteMany({ where: { operatorId } });
      await tx.clientOrigin.deleteMany({ where: { client: { email: { startsWith: marker } } } });
      await tx.client.deleteMany({ where: { email: { startsWith: marker } } });
      await tx.clientCareRatePetCharge.deleteMany({ where: { clientRate: { careOption: { code: { startsWith: marker } } } } });
      await tx.clientCareRate.deleteMany({ where: { careOption: { code: { startsWith: marker } } } });
      await tx.careOption.deleteMany({ where: { code: { startsWith: marker } } });
      await tx.careSpeciesPolicy.deleteMany({ where: { offering: { code: { startsWith: marker } } } });
      await tx.careOffering.deleteMany({ where: { code: { startsWith: marker } } });
      await tx.user.deleteMany({ where: { id: { in: [operatorId, sitterId, otherId] } } });
      }, { timeout: 30000 });
      assert.deepEqual(await protectedState(db), baseline, "All model counts and protected legacy money must return exactly to baseline.");
      console.log(JSON.stringify({ qa: "both paths authenticated to configured disposable branch", fixtureCleanup: "complete", protectedCounts: baseline.counts, protectedStateRestored: true }));
    } finally {
      if (originalDefault === undefined) delete process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID;
      else process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = originalDefault;
      await db.$disconnect();
    }
  }
});
