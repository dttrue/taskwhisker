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
import { reserveRewardForBookingWithDb, releaseRewardReservationWithDb, consumeRewardReservationWithDb } from "../../rewards/rewardReservationWrites.js";
import { commitBookingSitterCompensationWithDb } from "./commitBookingSitterCompensation.js";

test("guarded PostgreSQL compensation persistence, lifecycle, concurrency and rollback", {
  skip: process.env.TASKWHISKER_COMPENSATION_QA_TESTS !== "1", timeout: 300000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db = new PrismaClient(), marker = `compensation-qa-${randomUUID()}`;
  const operatorId = `${marker}-operator`, sitterId = `${marker}-sitter`, otherId = `${marker}-other`;
  const baseline = await compensationProtectedState(db), originalDefault = process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID;
  let option, publicCode;
  const commit = (bookingId, database = db) => commitBookingSitterCompensationWithDb({ db: database, bookingId });
  const reservationFor = (bookingId) => db.sitterRewardReservation.findUnique({ where: { bookingId } });
  const compensationFor = (bookingId) => db.bookingSitterCompensation.findUnique({ where: { bookingId }, include: { petCharges: { orderBy: { petPosition: "asc" } } } });
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
  async function reward(bookingId) {
    const [clock] = await db.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
    const event = await db.sitterRewardEvent.create({ data: { sitterId, type: "OPERATOR_PROGRESS_ADJUSTMENT", rewardCycle: 0, progressDelta: 0, occurredAt: clock.now, reason: marker } });
    const grant = await db.sitterRewardGrant.create({ data: { sitterId, rewardLevel: 1, feeBasisPoints: 500, maximumUses: 10, triggerEventId: event.id,
      startsAt: new Date(+clock.now - 60000), expiresAt: new Date(+clock.now + 3600000) } });
    await db.sitterRewardAccount.upsert({ where: { sitterId }, create: { sitterId, rewardLevel: 1, currentGrantId: grant.id }, update: { currentGrantId: grant.id } });
    assert.equal((await reserveRewardForBookingWithDb({ db, bookingId, ownerConfiguration: { operatorId, sitterId: otherId } })).status, "RESERVED");
    return grant;
  }
  function wrapped({ failModel, failOperation, barrier = false }) {
    let arrivals = 0, unblock;
    const gate = new Promise((resolve) => { unblock = resolve; });
    const timer = barrier ? setTimeout(unblock, 5000) : null;
    return { $transaction(work, config) { return db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
      if (barrier && key === "$queryRaw") return async (strings, ...values) => {
        if (strings.join("?").includes('FROM "Booking"') && arrivals < 2) {
          arrivals++; if (arrivals === 2) { clearTimeout(timer); unblock(); } await gate;
          assert.equal(arrivals, 2, "Two real PostgreSQL transactions must overlap before Booking locking.");
        }
        return target.$queryRaw(strings, ...values);
      };
      if (key === failModel) return new Proxy(target[key], { get(delegate, operation) {
        if (operation !== failOperation) return delegate[operation];
        return async (...args) => { await delegate[operation](...args); throw new Error("FORCED_QA_ROLLBACK"); };
      } });
      return target[key];
    } })), config); } };
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

    await t.test("standard frozen 2500 -> 250 fee and 2250 payout", async () => {
      const b = await create(); const row = await commit(b.id);
      assert.deepEqual([row.sitterCompensationSubtotalCents, row.sitterFeeBasisPoints, row.sitterFeeCents, row.sitterPayoutCents], [2500, 1000, 250, 2250]);
      assert.equal(row.currency, "USD"); assert.deepEqual(await compensationFor(b.id), row);
      assert.equal((await reserveRewardForBookingWithDb({ db, bookingId: b.id })).reasonCode, "COMPENSATION_ALREADY_COMMITTED");
    });
    await t.test("reward snapshot and consumption commit atomically; repeated consumedAt is unchanged", async () => {
      const b = await create(); const grant = await reward(b.id); const before = await reservationFor(b.id);
      const row = await commit(b.id);
      assert.deepEqual([row.sitterFeeBasisPoints, row.sitterFeeCents, row.sitterPayoutCents], [500, 125, 2375]);
      assert.equal(row.rewardReservationId, before.id); assert.equal(row.rewardGrantId, grant.id);
      const after = await reservationFor(b.id); assert.equal(after.status, "CONSUMED"); assert.deepEqual(after.consumedAt, row.committedAt);
      assert.deepEqual(await commit(b.id), row); assert.deepEqual(await reservationFor(b.id), after);
    });
    await t.test("business default and pet rules use frozen base and real rate version", async () => {
      const b = await create({ business: true, quantity: 2, pets: [{ name: "A", species: "Dog" }, { name: "B", species: "Dog" }] });
      // Mutate only this isolated fixture's current client catalog before FIRST commit.
      await db.clientCareRate.update({ where: { id: option.clientRate.id }, data: { baseRateCents: 1, isActive: false } });
      try {
        const row = await commit(b.id);
        assert.equal(row.clientBaseAggregateCents, 5000); assert.equal(row.sitterCompensationSubtotalCents, 4800);
        assert.equal(row.sourceRateId, option.defaultSitterRate.id); assert.equal(row.rateVersion, 4);
        assert.equal(row.petCharges[0].sourcePetChargeId, option.defaultSitterRate.petCharges[0].id);
        await db.defaultSitterCareRate.update({ where: { id: option.defaultSitterRate.id }, data: { baseCompensationCents: 9999, version: 5 } });
        assert.deepEqual(await commit(b.id), row);
      } finally {
        await db.clientCareRate.update({ where: { id: option.clientRate.id }, data: { baseRateCents: 2500, isActive: true } });
        await db.defaultSitterCareRate.update({ where: { id: option.defaultSitterRate.id }, data: { baseCompensationCents: 2000, version: 4 } });
      }
    });
    await t.test("business sitter override freezes override ID/version", async () => {
      const b = await create({ business: true });
      const override = await db.sitterCareRate.create({ data: { sitterId, careOptionId: option.id, setByUserId: operatorId, baseCompensationCents: 2200, version: 7 } });
      try { const row = await commit(b.id); assert.equal(row.sourceRateId, override.id); assert.equal(row.rateVersion, 7); assert.equal(row.rateSource, "SITTER_OVERRIDE"); assert.equal(row.sitterPayoutCents, 1980); }
      finally { await db.sitterCareRate.delete({ where: { id: override.id } }); }
      assert.equal((await commit(b.id)).sourceRateId, override.id);
    });
    for (const withReward of [false, true]) await t.test(`synchronized concurrent ${withReward ? "reward" : "standard"} commit produces one durable snapshot`, async () => {
      const b = await create(); if (withReward) await reward(b.id);
      const before = withReward ? await db.sitterRewardAccount.findUnique({ where: { sitterId } }) : null;
      const database = wrapped({ barrier: true }); const rows = await Promise.all([commit(b.id, database), commit(b.id, database)]);
      assert.deepEqual(rows[0], rows[1]); assert.equal(await db.bookingSitterCompensation.count({ where: { bookingId: b.id } }), 1);
      if (withReward) {
        const r = await reservationFor(b.id); assert.equal(r.status, "CONSUMED"); assert.deepEqual(r.consumedAt, rows[0].committedAt);
        assert.equal((await db.sitterRewardAccount.findUnique({ where: { sitterId } })).version, before.version + 1);
      }
    });
    await t.test("RELEASED entitlement uses standard 10% unchanged", async () => {
      const b = await create(); await reward(b.id);
      await releaseRewardReservationWithDb({ db, bookingId: b.id, reason: "QA release" }); const before = await reservationFor(b.id);
      const row = await commit(b.id); assert.equal(row.sitterFeeBasisPoints, 1000); assert.equal(row.rewardApplied, false); assert.deepEqual(await reservationFor(b.id), before);
    });
    for (const status of ["EXPIRED", "EXHAUSTED", "REVOKED"]) await t.test(`reserved grant now ${status} retains 5%`, async () => {
      const b = await create(); const grant = await reward(b.id);
      await db.sitterRewardGrant.update({ where: { id: grant.id }, data: { status, expiresAt: new Date(0) } });
      const row = await commit(b.id); assert.equal(row.sitterFeeBasisPoints, 500); assert.equal((await reservationFor(b.id)).status, "CONSUMED");
    });
    await t.test("CONSUMED without snapshot fails closed", async () => {
      const b = await create(); await reward(b.id); await consumeRewardReservationWithDb({ db, bookingId: b.id });
      await assert.rejects(commit(b.id), { code: "CONSUMED_WITHOUT_COMPENSATION" }); assert.equal(await compensationFor(b.id), null);
    });
    for (const [model, operation] of [["bookingSitterCompensation", "create"], ["sitterRewardReservation", "updateMany"], ["sitterRewardAccount", "update"]]) await t.test(`forced failure after ${model}.${operation} rolls back everything; retry succeeds`, async () => {
      const b = await create(); await reward(b.id); const before = await compensationProtectedState(db), reservation = await reservationFor(b.id);
      const account = await db.sitterRewardAccount.findUnique({ where: { sitterId } });
      await assert.rejects(commit(b.id, wrapped({ failModel: model, failOperation: operation })), { code: "COMPENSATION_PERSISTENCE_ERROR" });
      assert.deepEqual(await compensationProtectedState(db), before); assert.equal(await compensationFor(b.id), null);
      assert.deepEqual(await reservationFor(b.id), reservation); assert.equal(reservation.status, "RESERVED");
      assert.deepEqual(await db.sitterRewardAccount.findUnique({ where: { sitterId } }), account);
      const row = await commit(b.id); assert.deepEqual(await commit(b.id), row);
    });
    for (const status of ["REQUESTED", "CANCELED", "COMPLETED"]) await t.test(`${status} initial commitment is rejected`, async () => {
      const b = await create(); await db.booking.update({ where: { id: b.id }, data: { status } });
      await assert.rejects(commit(b.id), { code: "BOOKING_NOT_COMMITTABLE" }); assert.equal(await compensationFor(b.id), null);
    });
    await t.test("database-time boundary rejects a persisted Visit already started", async () => {
      const b = await create(); const [clock] = await db.$queryRaw`SELECT clock_timestamp() AS "now"`;
      await db.visit.updateMany({ where: { bookingId: b.id }, data: { startTime: clock.now } });
      await assert.rejects(commit(b.id), { code: "CARE_ALREADY_STARTED" });
    });
    await t.test("completed visit and contradictory assignment are rejected", async () => {
      const b = await create(); await db.visit.updateMany({ where: { bookingId: b.id }, data: { completedAt: new Date() } });
      await assert.rejects(commit(b.id), { code: "INVALID_VISIT_STATE" });
      const mixed = await create({ quantity: 2 }); await db.visit.update({ where: { id: mixed.visits[0].id }, data: { sitterId: otherId } });
      await assert.rejects(commit(mixed.id), { code: "VISIT_ASSIGNMENT_MISMATCH" });
    });
    await t.test("replay after completed care preserves original snapshot and permits separate performer attribution", async () => {
      const b = await create(); const row = await commit(b.id);
      await db.$transaction([
        db.booking.update({ where: { id: b.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
        db.visit.updateMany({ where: { bookingId: b.id }, data: { status: "COMPLETED", completedAt: new Date(), performedBySitterId: otherId } }),
      ]);
      assert.deepEqual(await commit(b.id), row);
    });
    await t.test("restrictive FKs protect Booking, reward reservation and grant history", async () => {
      const b = await create(); const grant = await reward(b.id); const row = await commit(b.id);
      await assert.rejects(db.sitterRewardReservation.delete({ where: { id: row.rewardReservationId } }), { code: "P2003" });
      await assert.rejects(db.sitterRewardGrant.delete({ where: { id: grant.id } }), { code: "P2003" });
      // Delete other Booking children only inside a deliberately aborted transaction,
      // proving compensation itself restricts deletion rather than unrelated Visits.
      await assert.rejects(db.$transaction(async (tx) => {
        await tx.visit.deleteMany({ where: { bookingId: b.id } }); await tx.bookingHistory.deleteMany({ where: { bookingId: b.id } });
        await tx.booking.delete({ where: { id: b.id } });
      }), { code: "P2003" });
    });
    await t.test("reward consume/release race with compensation leaves a coherent durable pair", async () => {
      const b = await create(); await reward(b.id);
      const [row] = await Promise.all([commit(b.id), releaseRewardReservationWithDb({ db, bookingId: b.id, reason: "QA race" })]);
      const r = await reservationFor(b.id);
      assert.equal(r.status, row.rewardApplied ? "CONSUMED" : "RELEASED"); assert.equal(row.sitterFeeBasisPoints, row.rewardApplied ? 500 : 1000);
    });
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
      console.log("Compensation PostgreSQL QA: all fixture counts and legacy money restored; zero residue.");
    } finally { await db.$disconnect(); }
  }
});
