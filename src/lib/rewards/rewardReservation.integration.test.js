import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  reserveRewardForBookingWithDb as reserve,
  consumeRewardReservationWithDb as consume,
  releaseRewardReservationWithDb as release,
} from "./rewardReservationWrites.js";

// Opt-in, disposable QA only. Authenticate BOTH connection paths before any
// fixture mutation. Never infer branch identity from an endpoint hostname.
test("guarded PostgreSQL reward reservation lifecycle and concurrency", {
  skip: process.env.TASKWHISKER_REWARD_QA_TESTS !== "1", timeout: 240000,
}, async (t) => {
  const expected = process.env.TASKWHISKER_QA_BRANCH_ID?.trim();
  assert(expected && !expected.endsWith("j4y"), "A non-shared configured QA branch is required.");
  assert(process.env.DATABASE_URL && process.env.DIRECT_URL, "Both database paths are required.");
  async function identity(url) {
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      const [row] = await client.$queryRaw`
        SELECT current_setting('neon.branch_id', true) AS "branchId",
          current_setting('neon.project_id', true) AS "projectId",
          current_database() AS "databaseName"
      `;
      return row;
    } catch {
      throw new Error("QA identity authentication failed; no test mutation allowed.");
    } finally { await client.$disconnect(); }
  }
  const identities = await Promise.all([identity(process.env.DATABASE_URL), identity(process.env.DIRECT_URL)]);
  assert.deepEqual(identities[0], identities[1], "Both runtime identities must match.");
  assert.equal(identities[0].branchId, expected, "Runtime branch must equal configured QA branch.");
  assert(!identities[0].branchId.endsWith("j4y"));

  const db = new PrismaClient();
  const protectedModels = [
    "user", "client", "booking", "visit", "bookingHistory", "bookingLineItem", "bookingPet", "pet",
    "clientOrigin", "bookingAttributionSnapshot", "bookingPricingSnapshot", "sitterReferralCode",
    "defaultSitterCareRate", "defaultSitterCareRatePetCharge", "sitterCareRate", "sitterCareRatePetCharge",
    "sitterRewardAccount", "sitterRewardEvent", "sitterRewardGrant", "sitterRewardReservation",
  ];
  const counts = async () => Object.fromEntries(await Promise.all(protectedModels.map(async (model) => [model, await db[model].count()])));
  const marker = `reward-reservation-qa-${randomUUID()}`;
  const userIds = [], sitterIds = [], bookingIds = [];
  const operatorId = `${marker}-operator`, clientId = `${marker}-client`;
  let beforeCounts;
  const summaries = {};
  const now = async () => (await db.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`)[0].now;
  const run = (bookingId, database = db) => reserve({ db: database, bookingId });
  const consumeBooking = (bookingId, database = db) => consume({ db: database, bookingId });
  const free = (bookingId, reason = "Fixture cancellation", database = db) => release({ db: database, bookingId, reason });
  const accountFor = (sitterId) => db.sitterRewardAccount.findUnique({ where: { sitterId } });
  const grantFor = (id) => db.sitterRewardGrant.findUnique({ where: { id } });
  const used = (grantId) => db.sitterRewardReservation.count({ where: { grantId, status: { in: ["RESERVED", "CONSUMED"] } } });

  async function sitter() {
    const id = `${marker}-sitter-${sitterIds.length}`;
    sitterIds.push(id); userIds.push(id);
    await db.user.create({ data: { id, role: "SITTER", name: "Temporary reservation QA", email: `${id}@example.invalid` } });
    return id;
  }
  async function booking(sitterId, { status = "CONFIRMED", lane = "SITTER_ORIGINATED", attribution = true } = {}) {
    const id = `${marker}-booking-${bookingIds.length}`;
    bookingIds.push(id); // Capture before writes, including nested-write failure.
    const startTime = new Date("2030-01-01T12:00:00Z"), endTime = new Date("2030-01-01T12:30:00Z");
    await db.booking.create({ data: {
      id, sitterId, operatorId, clientId, status, startTime, endTime, notes: marker,
      completedAt: status === "COMPLETED" ? new Date("2020-01-01T00:00:00Z") : null,
      clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
      ...(attribution ? { attributionSnapshot: { create: {
        clientOriginKind: "SITTER_REFERRAL", compensationLane: lane,
        referringSitterId: sitterId, requestedSitterId: sitterId, attributionSource: "OPERATOR_VERIFIED",
      } } } : {}),
    } });
    return id;
  }
  async function setup({ status = "ACTIVE", expired = false, pointer = true } = {}) {
    const sitterId = await sitter();
    const triggerBookingId = await booking(sitterId, { status: "COMPLETED" });
    const timestamp = await now();
    const event = await db.sitterRewardEvent.create({ data: {
      sitterId, bookingId: triggerBookingId, qualificationBookingId: triggerBookingId, progressBookingId: triggerBookingId,
      type: "QUALIFYING_COMPLETION", rewardCycle: 0, progressDelta: 1, occurredAt: timestamp,
    } });
    const grant = await db.sitterRewardGrant.create({ data: {
      sitterId, rewardLevel: 1, feeBasisPoints: 500, maximumUses: 10, status, triggerEventId: event.id,
      startsAt: new Date(timestamp.getTime() - 60000), expiresAt: new Date(timestamp.getTime() + (expired ? -1 : 3600000)),
    } });
    await db.sitterRewardAccount.create({ data: { sitterId, rewardLevel: 1, currentGrantId: pointer ? grant.id : null } });
    return { sitterId, grant, triggerBookingId };
  }
  async function fill(sitterId, count) {
    const ids = [];
    for (let i = 0; i < count; i += 1) {
      const id = await booking(sitterId); ids.push(id);
      assert.equal((await run(id)).status, "RESERVED");
    }
    return ids;
  }

  // Make the two real transactions overlap at the lock boundary. Only their
  // first attempts rendezvous; retry transactions must be free to proceed.
  function competingDb(table = "SitterRewardAccount") {
    let arrivals = 0, unblock;
    const gate = new Promise((resolve) => { unblock = resolve; });
    const timer = setTimeout(unblock, 5000);
    return { async $transaction(work, options) {
      return db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
        if (key !== "$queryRaw") return target[key];
        return async (strings, ...values) => {
          if (strings.join("?").includes(`FROM "${table}"`) && arrivals < 2) {
            arrivals += 1;
            if (arrivals === 2) { clearTimeout(timer); unblock(); }
            await gate;
            assert.equal(arrivals, 2, "Both transactions must reach the race barrier.");
          }
          return target.$queryRaw(strings, ...values);
        };
      } })), options);
    } };
  }

  try {
    beforeCounts = await counts();
    userIds.push(operatorId);
    await db.user.create({ data: { id: operatorId, role: "OPERATOR", name: "Temporary reservation QA", email: `${operatorId}@example.invalid` } });
    await db.client.create({ data: { id: clientId, name: "Temporary reservation QA" } });

    await t.test("successful reservation preserves Booking money and does not create progress events", async () => {
      const { sitterId, grant } = await setup(); const id = await booking(sitterId);
      const before = await db.booking.findUnique({ where: { id } });
      const events = await db.sitterRewardEvent.count(); const timestamp = await now();
      const value = await run(id);
      assert.equal(value.status, "RESERVED"); assert.equal(value.reservation.feeBasisPoints, 500);
      assert(value.reservation.reservedAt >= timestamp); assert(value.reservation.reservedAt <= await now());
      assert.equal(await used(grant.id), 1);
      assert.deepEqual(await db.booking.findUnique({ where: { id } }), before);
      assert.equal(await db.sitterRewardEvent.count(), events);
      const retry = await run(id); assert.equal(retry.status, "ALREADY_RESERVED");
      assert.deepEqual(retry.reservation, value.reservation);
    });

    await t.test("same Booking concurrent reserve creates one row and both return its identity", async () => {
      const { sitterId, grant } = await setup(); const id = await booking(sitterId);
      const database = competingDb("Booking");
      const values = await Promise.all([run(id, database), run(id, database)]);
      assert.deepEqual(values.map((v) => v.status).sort(), ["ALREADY_RESERVED", "RESERVED"]);
      assert.deepEqual(values[0].reservation, values[1].reservation);
      assert.equal(await db.sitterRewardReservation.count({ where: { bookingId: id } }), 1);
      assert.equal(await used(grant.id), 1);
      summaries.sameBooking = values.map((v) => v.status);
    });

    await t.test("9/10 final-slot race has exactly one winner and never reaches eleven", async () => {
      const { sitterId, grant } = await setup(); await fill(sitterId, 9);
      const a = await booking(sitterId), b = await booking(sitterId);
      const database = competingDb();
      const values = await Promise.all([run(a, database), run(b, database)]);
      assert.deepEqual(values.map((v) => v.status).sort(), ["NO_REWARD_AVAILABLE", "RESERVED"]);
      assert.equal(await used(grant.id), 10); assert.equal((await grantFor(grant.id)).status, "EXHAUSTED");
      assert.equal((await accountFor(sitterId)).currentGrantId, null);
      assert.equal(await db.sitterRewardReservation.count({ where: { bookingId: { in: [a, b] } } }), 1);
      assert.equal((await run(await booking(sitterId))).status, "NO_REWARD_AVAILABLE");
      assert.equal(await used(grant.id), 10);
      summaries.finalSlot = values.map((v) => v.status);
      const winner = values.find((v) => v.status === "RESERVED");
      assert.equal((await free(winner.bookingId)).status, "RELEASED");
      assert.equal(await used(grant.id), 9); assert.equal((await grantFor(grant.id)).status, "EXHAUSTED");
      assert.equal((await accountFor(sitterId)).currentGrantId, null);
      assert.equal((await run(await booking(sitterId))).status, "NO_REWARD_AVAILABLE");
      assert.equal((await run(winner.bookingId)).status, "RESERVATION_RELEASED");
    });

    await t.test("ACTIVE expired grant refuses, normalizes, and clears pointer", async () => {
      const { sitterId, grant } = await setup({ expired: true });
      assert.equal((await run(await booking(sitterId))).reasonCode, "GRANT_EXPIRED");
      assert.equal((await grantFor(grant.id)).status, "EXPIRED");
      assert.equal((await accountFor(sitterId)).currentGrantId, null); assert.equal(await used(grant.id), 0);
    });

    await t.test("a transaction started before expiry but waiting on the account cannot reserve after expiry", async () => {
      const { sitterId, grant } = await setup(); const id = await booking(sitterId);
      const expiresAt = new Date((await now()).getTime() + 3000);
      await db.sitterRewardGrant.update({ where: { id: grant.id }, data: { expiresAt } });
      let announceLock;
      const locked = new Promise((resolve) => { announceLock = resolve; });
      const holder = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "SitterRewardAccount" WHERE "sitterId" = ${sitterId} FOR UPDATE`;
        announceLock();
        await tx.$queryRaw`SELECT 1 AS "waited" FROM pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM (${expiresAt}::timestamptz - clock_timestamp())))::double precision)`;
      }, { timeout: 10000 });
      // Propagate holder failure to the waiting test instead of hanging.
      holder.catch(announceLock);
      await locked;
      let transactionStartedAt;
      const database = { $transaction(work, options) {
        return db.$transaction(async (tx) => {
          [transactionStartedAt] = await tx.$queryRaw`SELECT CURRENT_TIMESTAMP AS "time"`;
          return work(tx);
        }, options);
      } };
      const [value] = await Promise.all([run(id, database), holder]);
      assert(transactionStartedAt.time < expiresAt, "Reservation transaction must start before expiry.");
      assert.equal(value.reasonCode, "GRANT_EXPIRED"); assert.equal(await used(grant.id), 0);
      assert.equal((await grantFor(grant.id)).status, "EXPIRED"); assert.equal((await accountFor(sitterId)).currentGrantId, null);
    });

    await t.test("failure after final-slot insert rolls back reservation, exhaustion and pointer clearing", async () => {
      const { sitterId, grant } = await setup(); await fill(sitterId, 9); const id = await booking(sitterId);
      const database = { $transaction(work, options) {
        return db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
          if (key !== "sitterRewardAccount") return target[key];
          return new Proxy(target[key], { get(model, method) {
            if (method === "update") return () => { throw new Error("Injected fixture rollback"); };
            return model[method];
          } });
        } })), options);
      } };
      await assert.rejects(run(id, database), { code: "PERSISTENCE_ERROR" });
      assert.equal(await used(grant.id), 9); assert.equal((await grantFor(grant.id)).status, "ACTIVE");
      assert.equal((await accountFor(sitterId)).currentGrantId, grant.id);
      assert.equal(await db.sitterRewardReservation.count({ where: { bookingId: id } }), 0);
    });

    await t.test("reserve before real database expiry, normalize after expiry, then consume successfully", async () => {
      const { sitterId, grant } = await setup(); const a = await booking(sitterId), b = await booking(sitterId);
      // Only our temporary grant; no injected runtime clock. Wait for actual
      // PostgreSQL wall time to cross this fixture's acceptance boundary.
      const expiresAt = new Date((await now()).getTime() + 3000);
      await db.sitterRewardGrant.update({ where: { id: grant.id }, data: { expiresAt } });
      const first = await run(a); assert.equal(first.status, "RESERVED"); assert(first.reservation.reservedAt < expiresAt);
      await db.$queryRaw`SELECT 1 AS "waited" FROM pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM (${expiresAt}::timestamptz - clock_timestamp())))::double precision)`;
      assert.equal((await run(b)).reasonCode, "GRANT_EXPIRED");
      const value = await consumeBooking(a); assert.equal(value.status, "CONSUMED"); assert(value.reservation.consumedAt >= expiresAt);
      for (const field of ["id", "grantId", "sitterId", "reservedAt", "feeBasisPoints"]) assert.deepEqual(value.reservation[field], first.reservation[field]);
      assert.equal((await accountFor(sitterId)).currentGrantId, null);
      assert.equal((await grantFor(grant.id)).status, "EXPIRED");
    });

    await t.test("release before exhaustion frees capacity; CONSUMED continues to count", async () => {
      const { sitterId, grant } = await setup(); const ids = await fill(sitterId, 9);
      assert.equal((await consumeBooking(ids[0])).status, "CONSUMED"); assert.equal(await used(grant.id), 9);
      assert.equal((await free(ids[1])).status, "RELEASED"); assert.equal(await used(grant.id), 8);
      assert.equal((await grantFor(grant.id)).status, "ACTIVE"); assert.equal((await accountFor(sitterId)).currentGrantId, grant.id);
      await fill(sitterId, 1); assert.equal(await used(grant.id), 9);
      assert.equal((await free(ids[0])).reasonCode, "CONSUMED_CANNOT_RELEASE");
      assert.equal((await consumeBooking(ids[1])).reasonCode, "RELEASED_CANNOT_CONSUME");
      assert.equal((await run(ids[1])).status, "RESERVATION_RELEASED");
      assert.equal((await run(ids[0])).status, "ALREADY_CONSUMED");
    });

    for (const status of ["EXPIRED", "EXHAUSTED", "REVOKED"]) {
      await t.test(`existing reservations can consume/release after ${status}, with stable retry timestamps`, async () => {
        const { sitterId, grant } = await setup(); const [a, b] = await fill(sitterId, 2);
        await db.sitterRewardGrant.update({ where: { id: grant.id }, data: { status } });
        await db.sitterRewardAccount.update({ where: { sitterId }, data: { currentGrantId: null } });
        const consumed = await consumeBooking(a), released = await free(b, "  Temporary   cancellation  ");
        assert.equal(consumed.status, "CONSUMED"); assert.equal(released.status, "RELEASED");
        assert.equal(released.reservation.releaseReason, "Temporary cancellation");
        assert.deepEqual((await consumeBooking(a)).reservation, consumed.reservation);
        assert.deepEqual((await free(b, "Different reason")).reservation, released.reservation);
        assert.equal((await grantFor(grant.id)).status, status); assert.equal((await accountFor(sitterId)).currentGrantId, null);
      });
    }

    for (const target of ["CONSUMED", "RELEASED"]) {
      await t.test(`concurrent ${target} retries write one timestamp and one reason`, async () => {
        const { sitterId } = await setup(); const [id] = await fill(sitterId, 1); const database = competingDb();
        const op = target === "CONSUMED" ? () => consumeBooking(id, database) : () => free(id, "First durable reason", database);
        const values = await Promise.all([op(), op()]);
        assert.deepEqual(values.map((v) => v.status).sort(), [`ALREADY_${target}`, target].sort());
        assert.deepEqual(values[0].reservation, values[1].reservation);
        assert.equal(await db.sitterRewardReservation.count({ where: { bookingId: id } }), 1);
        summaries[target.toLowerCase()] = values.map((v) => v.status);
      });
    }

    await t.test("concurrent consume versus release yields exactly one irreversible terminal transition", async () => {
      const { sitterId } = await setup(); const [id] = await fill(sitterId, 1); const database = competingDb();
      const values = await Promise.all([consumeBooking(id, database), free(id, "Fixture cancellation", database)]);
      assert.equal(values.filter((v) => v.status === "INVALID_RESERVATION_TRANSITION").length, 1);
      const row = await db.sitterRewardReservation.findUnique({ where: { bookingId: id } });
      assert(["CONSUMED", "RELEASED"].includes(row.status));
      assert.equal(Boolean(row.consumedAt) !== Boolean(row.releasedAt), true);
    });

    await t.test("trigger protection still holds if its temporary Booking is reopened", async () => {
      const { sitterId, grant, triggerBookingId } = await setup();
      await db.booking.update({ where: { id: triggerBookingId }, data: { status: "CONFIRMED", completedAt: null } });
      assert.equal((await run(triggerBookingId)).reasonCode, "TRIGGER_BOOKING_NOT_ELIGIBLE");
      assert.equal(await used(grant.id), 0); assert.equal((await accountFor(sitterId)).currentGrantId, grant.id);
    });

    await t.test("authoritative eligibility denies terminal, business, missing attribution and reassignment", async () => {
      const { sitterId, grant } = await setup();
      for (const options of [{ status: "COMPLETED" }, { status: "CANCELED" }, { lane: "BUSINESS_ASSIGNED" }, { attribution: false }]) {
        assert.equal((await run(await booking(sitterId, options))).status, "NOT_ELIGIBLE");
      }
      const id = await booking(sitterId);
      await db.booking.update({ where: { id }, data: { sitterId: null } });
      assert.equal((await run(id)).reasonCode, "BOOKING_REASSIGNED");
      assert.equal(await used(grant.id), 0);
    });

    await t.test("no account/pointer is a normal no-reward result and creates no account", async () => {
      const sitterId = await sitter(); const id = await booking(sitterId);
      assert.equal((await run(id)).reasonCode, "NO_REWARD_ACCOUNT"); assert.equal(await accountFor(sitterId), null);
      const f = await setup({ pointer: false });
      assert.equal((await run(await booking(f.sitterId))).reasonCode, "NO_CURRENT_GRANT");
    });

    for (const status of ["EXPIRED", "EXHAUSTED", "REVOKED"]) {
      await t.test(`${status} stale pointer clears in PostgreSQL`, async () => {
        const { sitterId, grant } = await setup({ status });
        assert.equal((await run(await booking(sitterId))).reasonCode, `GRANT_${status}`);
        assert.equal((await accountFor(sitterId)).currentGrantId, null); assert.equal((await grantFor(grant.id)).status, status);
      });
    }
  } finally {
    try {
      if (beforeCounts) {
        await db.$transaction(async (tx) => {
          const owned = { sitterId: { in: sitterIds } };
          await tx.sitterRewardReservation.deleteMany({ where: { bookingId: { in: bookingIds } } });
          await tx.sitterRewardAccount.updateMany({ where: owned, data: { currentGrantId: null } });
          await tx.sitterRewardGrant.deleteMany({ where: owned });
          await tx.sitterRewardEvent.deleteMany({ where: owned });
          await tx.sitterRewardAccount.deleteMany({ where: owned });
          await tx.bookingAttributionSnapshot.deleteMany({ where: { bookingId: { in: bookingIds } } });
          await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
          await tx.client.deleteMany({ where: { id: clientId } });
          await tx.user.deleteMany({ where: { id: { in: userIds } } });
        }, { timeout: 20000 });
        const afterCounts = await counts();
        assert.deepEqual(afterCounts, beforeCounts, "Every protected/reward count must return to baseline.");
        assert.equal(await db.user.count({ where: { id: { in: userIds } } }), 0);
        assert.equal(await db.client.count({ where: { id: clientId } }), 0);
        assert.equal(await db.booking.count({ where: { id: { in: bookingIds } } }), 0);
        for (const model of ["sitterRewardAccount", "sitterRewardEvent", "sitterRewardGrant", "sitterRewardReservation"]) {
          assert.equal(await db[model].count({ where: { sitterId: { in: sitterIds } } }), 0);
        }
        console.log(JSON.stringify({ qaIdentityVerified: true, fixtureBookings: bookingIds.length, fixtureSitters: sitterIds.length,
          beforeCounts, afterCounts, cleanup: "complete", races: summaries }));
      }
    } finally { await db.$disconnect(); }
  }
});
