import { economicsInclude } from "../economics/bookingEconomics.js";
import { cancelCanonicalBookingWithDb, CANCELLATION_REVIEW } from "./canonicalCancellation.js";
import { confirmBookingWithDb, assignBookingSitterWithDb } from "../confirmation/confirmationService.js";
import { completeVisitWithDb, completeWholeBookingWithDb } from "../economics/completionService.js";
import { cancelBookingTransaction } from "../cancelBookingTransaction.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authenticateCanonicalQa } from "../../../../scripts/canonical-booking-qa.mjs";
import { compensationProtectedState } from "../../../../scripts/booking-sitter-compensation-qa.mjs";
import { createCanonicalBookingWithDb } from "../canonical/createCanonicalBooking.js";
import { optionFixture, bookingInput, timedSchedule } from "../canonical/fixtures.js";
import { createSitterReferralCode } from "../../referrals/sitterReferralCodeWrites.js";
import { reserveRewardForBookingWithDb, consumeRewardReservationWithDb, releaseRewardReservationWithDb } from "../../rewards/rewardReservationWrites.js";
import { commitBookingSitterCompensationWithDb } from "../compensation/commitBookingSitterCompensation.js";

test("canonical cancellation PostgreSQL guardrails and forced lock races", {
  skip: process.env.TASKWHISKER_CANCELLATION_QA_TESTS !== "1", timeout: 600000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] }), marker = `cancellation-qa-${randomUUID()}`;
  const operatorId = `${marker}-operator`, sitterId = `${marker}-sitter`, otherId = `${marker}-other`;
  const baseline = await compensationProtectedState(db), originalDefault = process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID;
  let option, publicCode;
  const commit = (bookingId, database = db) => commitBookingSitterCompensationWithDb({ db: database, bookingId });
  async function create({ business = false, quantity = 1, pets = bookingInput().pets, confirmed = true } = {}) {
    const b = await createCanonicalBookingWithDb({ db, operatorId, creationKey: randomUUID(), input: bookingInput({
      client: { name: "Compensation QA", email: `${marker}-${randomUUID()}@example.invalid` }, careOptionCode: option.code,
      pets, schedule: timedSchedule(quantity), ...(business ? {} : { referralCode: publicCode, requestReferringSitter: true }),
    }) });
    if (confirmed) await db.$transaction([
      db.booking.update({ where: { id: b.id }, data: { status: "CONFIRMED" } }),
      db.visit.updateMany({ where: { bookingId: b.id }, data: { status: "CONFIRMED" } }),
    ]);
    return b;
  }
  async function reward(bookingId, maximumUses = 10) {
    const [clock] = await db.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
    const event = await db.sitterRewardEvent.create({ data: { sitterId, type: "OPERATOR_PROGRESS_ADJUSTMENT", rewardCycle: 0, progressDelta: 0, occurredAt: clock.now, reason: marker } });
    const grant = await db.sitterRewardGrant.create({ data: { sitterId, rewardLevel: 1, feeBasisPoints: 500, maximumUses, triggerEventId: event.id,
      startsAt: new Date(+clock.now - 60000), expiresAt: new Date(+clock.now + 3600000) } });
    await db.sitterRewardAccount.upsert({ where: { sitterId }, create: { sitterId, rewardLevel: 1, currentGrantId: grant.id }, update: { currentGrantId: grant.id } });
    assert.equal((await reserveRewardForBookingWithDb({ db, bookingId, ownerConfiguration: { operatorId, sitterId: otherId } })).status, "RESERVED");
    return grant;
  }
  try {
    process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = sitterId;
    await db.user.createMany({ data: [
      { id: operatorId, role: "OPERATOR", email: `${operatorId}@example.invalid` },
      { id: sitterId, role: "SITTER", email: `${sitterId}@example.invalid` },
      { id: otherId, role: "SITTER", email: `${otherId}@example.invalid` },
    ] });
    const f = optionFixture();
    const { id: _offeringId, speciesPolicies, ...offering } = f.offering;
    const { id: _rateId, petCharges, ...rate } = f.clientRate;
    option = await db.careOption.create({ data: {
      code: `${marker}-option`, label: f.label, primarySpecies: "Dog", durationMinutes: 30,
      offering: { create: { ...offering, code: `${marker}-offering`, speciesPolicies: { create: speciesPolicies } } },
      clientRate: { create: { ...rate, setByUserId: operatorId, petCharges: { create: petCharges } } },
      defaultSitterRate: { create: { baseCompensationCents: 2000, version: 4, setByUserId: operatorId, petCharges: { create: [{ species: "Dog", includedCount: 1, additionalCents: 400 }] } } },
    }, include: { clientRate: true, defaultSitterRate: { include: { petCharges: true } } } });
    ({ publicCode } = await createSitterReferralCode({ db, sitterId, operatorUserId: operatorId }));

    const load = (id) => db.booking.findUnique({ where: { id }, include: { ...economicsInclude,
      visits: { orderBy: { id: "asc" } }, pricingSnapshot: true,
      sitterCompensation: { include: { petCharges: true } }, rewardReservation: { include: { grant: true } } } });
    const cancel = (b, database = db, args = {}) => cancelCanonicalBookingWithDb({ db: database, bookingId: b.id, actorId: operatorId, reason: "QA cancellation", ...args });
    const finish = (b, database = db) => completeVisitWithDb({ db: database, visitId: b.visits[0].id, actorId: operatorId, actorRole: "OPERATOR" });
    const financial = (b) => ({ pricing: b.pricingSnapshot, compensation: b.sitterCompensation,
      legacy: [b.clientTotalCents, b.platformFeeCents, b.sitterPayoutCents],
      cancellation: [b.cancellationFeeCents, b.cancellationFeeWaived, b.cancellationFeeRateBps, b.cancellationFeeReviewedAt, b.cancellationFeeReviewedById] });
    const history = (id) => db.bookingHistory.findMany({ where: { bookingId: id }, orderBy: { id: "asc" } });
    // The leader holds its first lifecycle lock while a second real PostgreSQL
    // backend waits on it. pg_blocking_pids proves overlap, not just Promise order.
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
    for (const confirmed of [false, true]) for (const committed of (confirmed ? [false, true] : [false])) await t.test(`operational ${confirmed ? "CONFIRMED" : "REQUESTED"}, committed=${committed}, snapshots and nulls retained`, async () => {
      const b = await create({ confirmed }); if (committed) await commit(b.id);
      const before = await load(b.id), result = await cancel(b);
      assert.equal(result.status, "CANCELED"); assert.equal(result.reasonCode, CANCELLATION_REVIEW);
      const after = await load(b.id); assert.deepEqual(financial(after), financial(before));
      assert(after.visits.every((v) => v.status === "CANCELED"));
      const oldHistory = await history(b.id); assert.equal(oldHistory.filter((h) => h.toStatus === "CANCELED").length, 1);
      assert.equal((await cancel(b)).status, "ALREADY_CANCELED"); assert.deepEqual(await history(b.id), oldHistory); assert.deepEqual(await load(b.id), after);
    });
    for (const committed of [false, true]) await t.test(`business-assigned cancellation retains frozen economics, committed=${committed}`, async () => {
      const b = await create({ business: true }); if (committed) await commit(b.id);
      const before = await load(b.id); assert.equal((await cancel(b)).status, "CANCELED"); assert.deepEqual(financial(await load(b.id)), financial(before));
    });
    await t.test("REQUESTED cannot commit compensation; a contradictory snapshot is review-only", async () => {
      const b = await create({ confirmed: false });
      await assert.rejects(commit(b.id), { code: "BOOKING_NOT_COMMITTABLE" });
      await db.booking.update({ where: { id: b.id }, data: { status: "CONFIRMED" } });
      await db.visit.updateMany({ where: { bookingId: b.id }, data: { status: "CONFIRMED" } });
      await commit(b.id);
      await db.booking.update({ where: { id: b.id }, data: { status: "REQUESTED" } });
      await db.visit.updateMany({ where: { bookingId: b.id }, data: { status: "PENDING" } });
      const before = await load(b.id); assert.equal((await cancel(b)).reviewReason, "COMPENSATION_STATUS_CONTRADICTION"); assert.deepEqual(await load(b.id), before);
    });
    await t.test("RESERVED no compensation releases atomically without reopening exhausted grant", async () => {
      const b = await create(), grant = await reward(b.id, 1), before = await load(b.id);
      assert.equal(before.rewardReservation.grant.status, "EXHAUSTED");
      assert.equal((await cancel(b)).rewardReservationStatus, "RELEASED");
      const after = await load(b.id); assert.deepEqual(financial(after), financial(before)); assert.equal(after.rewardReservation.status, "RELEASED");
      assert.deepEqual(after.rewardReservation.grant, before.rewardReservation.grant);
      assert.equal((await db.sitterRewardAccount.findUnique({ where: { sitterId } })).currentGrantId, null);
      assert.equal((await db.sitterRewardGrant.findUnique({ where: { id: grant.id } })).status, "EXHAUSTED");
    });
    await t.test("CONSUMED boosted commitment survives pre-service cancellation unchanged", async () => {
      const b = await create(); await reward(b.id); await commit(b.id); const before = await load(b.id);
      assert.equal((await cancel(b)).status, "CANCELED"); const after = await load(b.id);
      assert.deepEqual(financial(after), financial(before)); assert.deepEqual(after.rewardReservation, before.rewardReservation);
      assert.equal((await releaseRewardReservationWithDb({ db, bookingId: b.id, reason: "QA invalid release" })).reasonCode, "CONSUMED_CANNOT_RELEASE");
    });
    await t.test("RELEASED remains unchanged", async () => {
      const b = await create(); await reward(b.id); await releaseRewardReservationWithDb({ db, bookingId: b.id, reason: "QA prior release" });
      const before = await load(b.id); assert.equal((await cancel(b)).status, "CANCELED"); assert.deepEqual((await load(b.id)).rewardReservation, before.rewardReservation);
    });
    await t.test("started care and blocked completed Visit retain all truth across repeated reviews", async () => {
      for (const completed of [false, true]) {
        const b = await create(); const time = new Date(Date.now() - 60000);
        await db.visit.update({ where: { id: b.visits[0].id }, data: { startTime: time, ...(completed ? { status: "COMPLETED", completedAt: time, performedBySitterId: sitterId } : {}) } });
        const before = await load(b.id), notes = await history(b.id);
        for (let i = 0; i < 2; i++) assert.equal((await cancel(b)).reviewReason, "CARE_STARTED_OR_PERFORMED");
        assert.deepEqual(await load(b.id), before); assert.deepEqual(await history(b.id), notes);
      }
    });
    await t.test("canonical waiver and contradictory data perform no writes", async () => {
      const b = await create(), before = await load(b.id); assert.equal((await cancel(b, db, { waiveFee: true })).reviewReason, "CANONICAL_WAIVER_UNDEFINED"); assert.deepEqual(await load(b.id), before);
      await db.booking.update({ where: { id: b.id }, data: { sitterId: otherId } });
      const inconsistent = await load(b.id); assert.equal((await cancel(b)).status, CANCELLATION_REVIEW); assert.deepEqual(await load(b.id), inconsistent);
    });
    await t.test("assigned sitter needs client request and actor is retained", async () => {
      const b = await create(); assert.equal((await cancel(b, db, { actorId: sitterId })).status, "REQUEST_REQUIRED");
      await db.conversation.create({ data: { bookingId: b.id, messages: { create: { senderType: "CLIENT", body: "Cancellation request:\nPlans changed" } } } });
      assert.equal((await cancel(b, db, { actorId: otherId })).status, "NOT_AUTHORIZED");
      assert.equal((await cancel(b, db, { actorId: sitterId })).status, "CANCELED");
      assert.equal((await history(b.id)).find((h) => h.toStatus === "CANCELED").changedByUserId, sitterId);
    });
    await t.test("failure after release rolls all DB writes back", async () => {
      const b = await create(); await reward(b.id); const before = await load(b.id), notes = await history(b.id);
      const failing = { $transaction: (work, config) => db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
        if (key === "bookingHistory") return { create() { throw new Error("QA forced history failure"); } };
        return Reflect.get(target, key);
      } })), config) };
      assert.equal((await cancel(b, failing)).status, "CANCELLATION_PERSISTENCE_ERROR");
      assert.deepEqual(await load(b.id), before); assert.deepEqual(await history(b.id), notes);
    });
    for (const cancelFirst of [true, false]) await t.test(`PostgreSQL Visit-completion race, cancellation first=${cancelFirst}`, async () => {
      const b = await create(); const c = (database) => cancel(b, database), v = (database) => finish(b, database);
      const results = await orderedRace(cancelFirst ? c : v, cancelFirst ? v : c);
      assert(results.every((r) => r.status === "fulfilled")); const after = await load(b.id);
      if (cancelFirst) { assert.equal(after.status, "CANCELED"); assert.equal(after.visits[0].status, "CANCELED"); assert.equal(results[1].value.ok, false); }
      else { assert.equal(after.status, "CONFIRMED"); assert.equal(after.visits[0].status, "COMPLETED"); assert.equal(results[1].value.status, CANCELLATION_REVIEW); }
      assert.equal(after.sitterCompensation, null);
    });
    for (const cancelFirst of [true, false]) for (const rewarded of [true, false]) await t.test(`PostgreSQL compensation race, cancellation first=${cancelFirst}, reward=${rewarded}`, async () => {
      const b = await create(); if (rewarded) await reward(b.id);
      const c = (database) => cancel(b, database), m = (database) => commit(b.id, database);
      const results = await orderedRace(cancelFirst ? c : m, cancelFirst ? m : c), after = await load(b.id);
      assert.equal(after.status, "CANCELED");
      if (cancelFirst) { assert.equal(results[0].value.status, "CANCELED"); assert.equal(results[1].status, "rejected"); assert.equal(after.sitterCompensation, null); if (rewarded) assert.equal(after.rewardReservation.status, "RELEASED"); }
      else { assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].value.status, "CANCELED"); assert(after.sitterCompensation); if (rewarded) assert.equal(after.rewardReservation.status, "CONSUMED"); }
    });
    for (const cancelFirst of [true, false]) await t.test(`PostgreSQL standalone consume race, cancellation first=${cancelFirst}`, async () => {
      const b = await create(); await reward(b.id);
      const c = (database) => cancel(b, database), consume = (database) => consumeRewardReservationWithDb({ db: database, bookingId: b.id });
      const results = await orderedRace(cancelFirst ? c : consume, cancelFirst ? consume : c, "SitterRewardAccount"); assert(results.every((r) => r.status === "fulfilled"));
      const after = await load(b.id); assert.equal(after.rewardReservation.status, cancelFirst ? "RELEASED" : "CONSUMED");
      assert.equal(after.status, cancelFirst ? "CANCELED" : "CONFIRMED");
      assert.equal(results[1].value[ cancelFirst ? "reasonCode" : "reviewReason" ], cancelFirst ? "RELEASED_CANNOT_CONSUME" : "CONSUMED_WITHOUT_COMPENSATION");
    });
    await t.test("PostgreSQL duplicate cancellation writes one transition/history/message", async () => {
      const b = await create(); await reward(b.id);
      const results = await orderedRace((database) => cancel(b, database), (database) => cancel(b, database));
      assert.deepEqual(results.map((r) => r.value.status), ["CANCELED", "ALREADY_CANCELED"]);
      assert.equal((await history(b.id)).filter((h) => h.toStatus === "CANCELED").length, 1);
      assert.equal(await db.message.count({ where: { conversation: { bookingId: b.id }, senderType: "SYSTEM" } }), 1);
    });
    await t.test("PostgreSQL whole-booking completion cannot bypass cancellation or erase completed care", async () => {
      const b = await create(); await commit(b.id);
      await db.visit.update({ where: { id: b.visits[0].id }, data: { status: "COMPLETED", completedAt: new Date(), performedBySitterId: sitterId } });
      const results = await orderedRace((database) => cancel(b, database), (database) => completeWholeBookingWithDb({ db: database, bookingId: b.id, actorId: operatorId }));
      assert.equal(results[0].value.status, CANCELLATION_REVIEW); assert.equal(results[1].value.ok, true); assert.equal((await load(b.id)).status, "COMPLETED");
    });
    await t.test("PostgreSQL cancellation beats confirmation and reassignment without resurrection", async () => {
      for (const operation of ["confirm", "assign"]) {
        const b = await create({ confirmed: false });
        const results = await orderedRace((database) => cancel(b, database), (database) => operation === "confirm"
          ? confirmBookingWithDb({ db: database, bookingId: b.id, actorId: operatorId })
          : assignBookingSitterWithDb({ db: database, bookingId: b.id, actorId: operatorId, sitterId: otherId }));
        assert.equal(results[0].value.status, "CANCELED"); assert.equal(results[1].value.ok, false); assert.equal((await load(b.id)).status, "CANCELED");
      }
    });
    await t.test("legacy fee, waiver, completed Visit preservation and terminals unchanged in PostgreSQL", async () => {
      const parent = await create();
      for (const waived of [false, true]) {
        const b = await db.booking.create({ data: { operatorId, sitterId, clientId: parent.clientId, status: "CONFIRMED", startTime: parent.startTime, endTime: parent.endTime,
          clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
          visits: { create: { operatorId, sitterId, date: parent.visits[0].date, startTime: parent.startTime, endTime: parent.endTime, status: "COMPLETED", completedAt: new Date(), performedBySitterId: sitterId } } } });
        const before = await load(b.id);
        const call = () => db.$transaction((tx) => cancelBookingTransaction({ tx, bookingId: b.id, actorId: operatorId, cancellationFeeCents: waived ? 0 : 413, cancellationFeeWaived: waived, cancellationFeeRateBps: waived ? 0 : 1500, historyNote: "Legacy QA", systemMessage: "Legacy QA cancellation" }));
        assert.equal((await call()).ok, true); const after = await load(b.id); assert.deepEqual(after.visits, before.visits); assert.equal(after.cancellationFeeCents, waived ? 0 : 413); assert.equal(after.cancellationFeeWaived, waived); assert.equal((await call()).reason, "ALREADY_CANCELED");
      }
    });
    console.log("Cancellation QA: both database paths authenticated; forced PostgreSQL lock races verified.");
  } finally {
    if (originalDefault === undefined) delete process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID; else process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = originalDefault;
    try {
      // Scoped fixture-only deletion, children first to respect financial Restrict.
      const bookings = await db.booking.findMany({ where: { operatorId }, select: { id: true, clientId: true } });
      const bookingIds = bookings.map((b) => b.id), clientIds = bookings.map((b) => b.clientId);
      await db.$transaction(async (tx) => {
        await tx.bookingSitterCompensationPetCharge.deleteMany({ where: { compensation: { bookingId: { in: bookingIds } } } });
        await tx.bookingSitterCompensation.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.sitterRewardReservation.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.sitterRewardAccount.deleteMany({ where: { sitterId } });
        await tx.sitterRewardGrant.deleteMany({ where: { sitterId } });
        await tx.sitterRewardEvent.deleteMany({ where: { sitterId } });
        await tx.message.deleteMany({ where: { conversation: { bookingId: { in: bookingIds } } } });
        await tx.conversation.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.visit.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.bookingHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
        await tx.clientOrigin.deleteMany({ where: { clientId: { in: clientIds } } });
        await tx.client.deleteMany({ where: { id: { in: clientIds } } });
        await tx.sitterReferralCode.deleteMany({ where: { sitterId } });
        if (option) { await tx.careOption.delete({ where: { id: option.id } }); await tx.careOffering.delete({ where: { id: option.offeringId } }); }
        await tx.user.deleteMany({ where: { id: { in: [operatorId, sitterId, otherId] } } });
      }, { timeout: 30000 });
      assert.deepEqual(await compensationProtectedState(db), baseline, "All protected counts and legacy money must return exactly to baseline.");
      console.log("Cancellation PostgreSQL QA: all fixture counts and legacy money restored; zero residue.");
      console.log(JSON.stringify({ protectedCounts: baseline.counts, cleanupVerified: true }));
    } finally { await db.$disconnect(); }
  }
});
