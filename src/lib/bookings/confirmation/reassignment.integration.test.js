import { cleanupVisitFinance } from "../../../../scripts/visit-compensation-qa.mjs";
import { economicsInclude, readBookingEconomics } from "../economics/bookingEconomics.js";
import { cancelCanonicalBookingWithDb } from "../cancellation/canonicalCancellation.js";
import { confirmBookingWithDb, assignBookingSitterWithDb } from "../confirmation/confirmationService.js";
import { completeVisitWithDb } from "../economics/completionService.js";
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

test("reassignment PostgreSQL effective lanes, immutable compensation and forced races", {
  skip: process.env.TASKWHISKER_REASSIGNMENT_QA_TESTS !== "1", timeout: 600000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] }), marker = `reassignment-qa-${randomUUID()}`;
  const operatorId = `${marker}-operator`, sitterId = `${marker}-sitter`, otherId = `${marker}-other`;
  const baseline = await compensationProtectedState(db), originalDefault = process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID;
  let option, publicCode, ordinal = 0;
  const thirdId = `${marker}-third`;
  const commit = (bookingId, database = db) => commitBookingSitterCompensationWithDb({ db: database, bookingId });
  async function create({ business = false, quantity = 1, pets = bookingInput().pets, confirmed = true } = {}) {
    const schedule = timedSchedule(quantity), offset = ++ordinal * 7 * 86400000;
    schedule.visits = schedule.visits.map((v) => ({ ...v, date: new Date(Date.parse(`${v.date}T00:00:00Z`) + offset).toISOString().slice(0, 10) }));
    const b = await createCanonicalBookingWithDb({ db, operatorId, creationKey: randomUUID(), input: bookingInput({
      client: { name: "Compensation QA", email: `${marker}-${randomUUID()}@example.invalid` }, careOptionCode: option.code,
      pets, schedule, ...(business ? {} : { referralCode: publicCode, requestReferringSitter: true }),
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
      { id: thirdId, role: "SITTER", email: `${thirdId}@example.invalid` },
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
    const assign = (b, database = db, next = otherId) => assignBookingSitterWithDb({ db: database, bookingId: b.id, actorId: operatorId, sitterId: next });
    for (const business of [false, true]) for (const confirmed of [false, true]) await t.test(`pre-service historical business=${business}, confirmed=${confirmed}: assignment, immutable history, idempotency`, async () => {
      const b = await create({ business, confirmed }), before = await load(b.id);
      const result = await assign(b); assert.equal(result.code, "ASSIGNED"); assert.equal(result.effectiveCompensationLane, "BUSINESS_ASSIGNED");
      const after = await load(b.id); assert.equal(after.sitterId, otherId); assert(after.visits.every((v) => v.sitterId === otherId));
      assert.deepEqual(financial(after), financial(before)); assert.deepEqual(after.attributionSnapshot, before.attributionSnapshot);
      const notes = await history(b.id); assert.equal(notes.filter((h) => h.toSitterId === otherId).length, 1);
      assert.equal(notes.find((h) => h.toSitterId === otherId).changedByUserId, operatorId);
      assert.equal((await assign(b)).code, "ALREADY_ASSIGNED"); assert.deepEqual(await history(b.id), notes); assert.deepEqual(await load(b.id), after);
    });
    for (const reservation of [null, "RESERVED", "RELEASED"]) await t.test(`historical referral -> frozen business compensation, reward=${reservation}`, async () => {
      const b = await create(); if (reservation) await reward(b.id, 1);
      if (reservation === "RELEASED") await releaseRewardReservationWithDb({ db, bookingId: b.id, reason: "QA prior release" });
      const before = await load(b.id), grant = before.rewardReservation?.grant;
      assert.equal((await assign(b)).code, "ASSIGNED"); const reassigned = await load(b.id);
      if (reservation) { assert.equal(reassigned.rewardReservation.status, "RELEASED"); assert.deepEqual(reassigned.rewardReservation.grant, grant); assert.equal(grant.status, "EXHAUSTED"); }
      const c = await commit(b.id); assert.equal(c.sitterId, otherId); assert.equal(c.compensationLane, "BUSINESS_ASSIGNED"); assert.equal(c.rewardApplied, false); assert.equal(c.sitterFeeBasisPoints, 1000); assert.equal(c.sourceRateId, option.defaultSitterRate.id);
      const after = await load(b.id); assert.deepEqual(after.attributionSnapshot, before.attributionSnapshot); assert.equal(after.attributionSnapshot.compensationLane, "SITTER_ORIGINATED"); assert.deepEqual(after.pricingSnapshot, before.pricingSnapshot);
      assert.equal(readBookingEconomics(after).sitter.status, "COMMITTED"); assert.deepEqual(await commit(b.id), c);
      assert.equal((await cancel(b)).status, "CANCELED"); assert.deepEqual(financial(await load(b.id)), financial(after));
      if (reservation) assert.equal((await load(b.id)).rewardReservation.status, "RELEASED");
    });
    await t.test("new sitter's business override is used after referral reassignment", async () => {
      const override = await db.sitterCareRate.create({ data: { careOptionId: option.id, sitterId: otherId, baseCompensationCents: 1700, setByUserId: operatorId } });
      try {
        const b = await create(); assert.equal((await assign(b)).code, "ASSIGNED"); const c = await commit(b.id);
        assert.equal(c.sitterId, otherId); assert.equal(c.sourceRateId, override.id); assert.equal(c.rateSource, "SITTER_OVERRIDE"); assert.equal(c.baseUnitCompensationCents, 1700);
      } finally { await db.sitterCareRate.delete({ where: { id: override.id } }); }
    });
    for (const boosted of [false, true]) await t.test(`committed compensation blocks different sitter/unassignment and preserves immutable reward/pet data; boosted=${boosted}`, async () => {
      const b = await create({ business: !boosted, pets: [{ name: "First", species: "Dog" }, { name: "Second", species: "Dog" }] });
      if (boosted) await reward(b.id); await commit(b.id); const before = await load(b.id), notes = await history(b.id);
      if (!boosted) assert(before.sitterCompensation.petCharges.length > 0);
      for (const next of [otherId, null]) assert.equal((await assign(b, db, next)).code, "COMPENSATION_COMMITTED_REASSIGNMENT_REQUIRES_REVIEW");
      assert.equal((await assign(b, db, sitterId)).code, "ALREADY_ASSIGNED"); assert.deepEqual(await load(b.id), before); assert.deepEqual(await history(b.id), notes);
    });
    for (const completed of [false, true]) await t.test(`started/performed care blocks whole reassignment, completed=${completed}`, async () => {
      const b = await create(), at = new Date(Date.now() - 60000);
      await db.visit.update({ where: { id: b.visits[0].id }, data: { startTime: at, ...(completed ? { status: "COMPLETED", completedAt: at, performedBySitterId: sitterId } : {}) } });
      const before = await load(b.id), notes = await history(b.id); assert.equal((await assign(b)).code, "CARE_ALREADY_STARTED"); assert.deepEqual(await load(b.id), before); assert.deepEqual(await history(b.id), notes);
    });
    await t.test("CONSUMED without compensation blocks all assignment attempts and never releases", async () => {
      const b = await create(); await reward(b.id); await consumeRewardReservationWithDb({ db, bookingId: b.id });
      const before = await load(b.id); for (const next of [otherId, sitterId]) assert.equal((await assign(b, db, next)).code, "REWARD_STATE_CONFLICT"); assert.deepEqual(await load(b.id), before);
    });
    await t.test("failure after release rolls back assignment, Visits, reward account and history", async () => {
      const b = await create(); await reward(b.id); const before = await load(b.id), notes = await history(b.id), account = await db.sitterRewardAccount.findUnique({ where: { sitterId } });
      const failing = { $transaction: (work, config) => db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
        if (key === "bookingHistory") return { create() { throw new Error("QA forced history failure"); } };
        return Reflect.get(target, key);
      } })), config) };
      assert.equal((await assign(b, failing)).code, "BOOKING_PERSISTENCE_ERROR"); assert.deepEqual(await load(b.id), before); assert.deepEqual(await history(b.id), notes); assert.deepEqual(await db.sitterRewardAccount.findUnique({ where: { sitterId } }), account);
    });
    for (const offset of [-1, 0, 1]) await t.test(`persisted cross-midnight conflict and back-to-back boundary ${offset}`, async () => {
      const blocker = await create(), candidate = await create(); const start = new Date(`2036-01-${String(10 + offset).padStart(2, "0")}T23:45:00Z`), end = new Date(+start + 1800000);
      await db.visit.update({ where: { id: blocker.visits[0].id }, data: { startTime: start, endTime: end } }); assert.equal((await assign(blocker)).code, "ASSIGNED");
      await db.visit.update({ where: { id: candidate.visits[0].id }, data: { startTime: new Date(+end + offset), endTime: new Date(+end + offset + 1800000) } });
      assert.equal((await assign(candidate)).code, offset < 0 ? "SITTER_UNAVAILABLE" : "ASSIGNED");
    });
    await t.test("invalid/non-SITTER and terminal Bookings reject without changes", async () => {
      const b = await create(); assert.equal((await assign(b, db, operatorId)).code, "INVALID_SITTER"); assert.equal((await assign(b, db, `${marker}-missing`)).code, "INVALID_SITTER");
      for (const status of ["CANCELED", "COMPLETED"]) { await db.booking.update({ where: { id: b.id }, data: { status } }); const before = await load(b.id); assert.equal((await assign(b)).code, "INVALID_BOOKING_STATUS"); assert.deepEqual(await load(b.id), before); }
    });
    await t.test("legacy requested reassignment and unassignment retain money and future Visit consistency", async () => {
      const parent = await create(); const b = await db.booking.create({ data: { operatorId, sitterId, clientId: parent.clientId, status: "REQUESTED", startTime: parent.startTime, endTime: parent.endTime,
        clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
        visits: { create: { operatorId, sitterId, date: parent.visits[0].date, startTime: parent.startTime, endTime: parent.endTime, status: "PENDING" } } } });
      const before = await load(b.id); assert.equal((await assign(b)).code, "ASSIGNED"); assert.deepEqual(financial(await load(b.id)), financial(before));
      assert.equal((await assign(b, db, null)).code, "ASSIGNED"); assert((await load(b.id)).visits.every((v) => v.sitterId === null));
    });
    await t.test("legacy active reward entitlement is guarded; released history permits safe assignment", async () => {
      for (const state of ["RESERVED", "CONSUMED", "RELEASED"]) {
        const parent = await create(); const b = await db.booking.create({ data: { operatorId, sitterId, clientId: parent.clientId, status: "REQUESTED", startTime: parent.startTime, endTime: parent.endTime,
          clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
          attributionSnapshot: { create: { clientOriginKind: "SITTER_REFERRAL", attributionSource: "REFERRAL_LINK", compensationLane: "SITTER_ORIGINATED", referringSitterId: sitterId, requestedSitterId: sitterId } },
          visits: { create: { operatorId, sitterId, date: parent.visits[0].date, startTime: parent.startTime, endTime: parent.endTime, status: "PENDING" } } } });
        await reward(b.id);
        if (state === "CONSUMED") await consumeRewardReservationWithDb({ db, bookingId: b.id });
        if (state === "RELEASED") await releaseRewardReservationWithDb({ db, bookingId: b.id, reason: "QA legacy historical release" });
        const before = await load(b.id), notes = await history(b.id); assert.equal((await assign(b)).code, state === "RELEASED" ? "ASSIGNED" : "REWARD_STATE_CONFLICT");
        const after = await load(b.id); assert.deepEqual(after.rewardReservation, before.rewardReservation); assert.deepEqual(financial(after), financial(before));
        if (state !== "RELEASED") { assert.deepEqual(after, before); assert.deepEqual(await history(b.id), notes); }
      }
    });
    for (const assignmentFirst of [true, false]) for (const rewarded of [false, true]) await t.test(`forced PostgreSQL assignment/compensation race: assignment first=${assignmentFirst}, reward=${rewarded}`, async () => {
      const b = await create(); if (rewarded) await reward(b.id);
      const a = (database) => assign(b, database), c = (database) => commit(b.id, database);
      const results = await orderedRace(assignmentFirst ? a : c, assignmentFirst ? c : a); assert(results.every((r) => r.status === "fulfilled"));
      const after = await load(b.id); assert.equal(after.sitterId, after.sitterCompensation.sitterId); assert(after.visits.every((v) => v.sitterId === after.sitterId));
      if (assignmentFirst) { assert.equal(results[0].value.code, "ASSIGNED"); assert.equal(after.sitterId, otherId); assert.equal(after.sitterCompensation.compensationLane, "BUSINESS_ASSIGNED"); if (rewarded) assert.equal(after.rewardReservation.status, "RELEASED"); }
      else { assert.equal(results[1].value.code, "COMPENSATION_COMMITTED_REASSIGNMENT_REQUIRES_REVIEW"); assert.equal(after.sitterId, sitterId); assert.equal(after.sitterCompensation.compensationLane, "SITTER_ORIGINATED"); if (rewarded) assert.equal(after.rewardReservation.status, "CONSUMED"); }
      assert.equal(readBookingEconomics(after).sitter.status, "COMMITTED");
    });
    for (const assignmentFirst of [true, false]) await t.test(`forced assignment/confirmation race: assignment first=${assignmentFirst}`, async () => {
      const b = await create({ confirmed: false }); const a = (database) => assign(b, database), c = (database) => confirmBookingWithDb({ db: database, bookingId: b.id, actorId: operatorId });
      const results = await orderedRace(assignmentFirst ? a : c, assignmentFirst ? c : a);
      assert(results.every((r) => r.status === "fulfilled")); assert.equal(results[0].value.ok, true);
      assert.equal(results[1].value.ok, assignmentFirst);
      if (!assignmentFirst) assert.equal(results[1].value.code, "COMPENSATION_COMMITTED_REASSIGNMENT_REQUIRES_REVIEW");
      const after = await load(b.id); assert.equal(after.status, "CONFIRMED");
      assert.equal(after.sitterId, assignmentFirst ? otherId : sitterId); assert(after.visits.every((v) => v.sitterId === after.sitterId));
      assert(after.sitterCompensation);
    });
    for (const assignmentFirst of [true, false]) await t.test(`forced assignment/Visit completion race: assignment first=${assignmentFirst}`, async () => {
      const b = await create(); const a = (database) => assign(b, database), c = (database) => finish(b, database);
      const results = await orderedRace(assignmentFirst ? a : c, assignmentFirst ? c : a); assert(results.every((r) => r.status === "fulfilled")); const after = await load(b.id);
      assert.equal(after.visits[0].status, "COMPLETED"); assert.equal(after.sitterId, assignmentFirst ? otherId : sitterId); assert.equal(after.visits[0].sitterId, after.sitterId); assert.equal(after.sitterCompensation, null);
      if (!assignmentFirst) assert.equal(results[1].value.code, "CARE_ALREADY_STARTED");
    });
    for (const assignmentFirst of [true, false]) await t.test(`forced assignment/cancellation race: assignment first=${assignmentFirst}`, async () => {
      const b = await create(); await reward(b.id); const a = (database) => assign(b, database), c = (database) => cancel(b, database);
      const results = await orderedRace(assignmentFirst ? a : c, assignmentFirst ? c : a); assert(results.every((r) => r.status === "fulfilled")); const after = await load(b.id); assert.equal(after.status, "CANCELED"); assert.equal(after.rewardReservation.status, "RELEASED");
      assert.equal(after.sitterId, assignmentFirst ? otherId : sitterId); if (!assignmentFirst) assert.equal(results[1].value.code, "INVALID_BOOKING_STATUS");
    });
    for (const action of ["consume", "release"]) for (const assignmentFirst of [true, false]) await t.test(`forced assignment/reward ${action} race: assignment first=${assignmentFirst}`, async () => {
      const b = await create(); await reward(b.id); const a = (database) => assign(b, database);
      const r = (database) => action === "consume" ? consumeRewardReservationWithDb({ db: database, bookingId: b.id }) : releaseRewardReservationWithDb({ db: database, bookingId: b.id, reason: "QA concurrent release" });
      const results = await orderedRace(assignmentFirst ? a : r, assignmentFirst ? r : a, "SitterRewardAccount"); assert(results.every((x) => x.status === "fulfilled"));
      const after = await load(b.id), consumed = action === "consume" && !assignmentFirst;
      assert.equal(after.rewardReservation.status, consumed ? "CONSUMED" : "RELEASED"); assert.equal(after.sitterId, consumed ? sitterId : otherId);
      if (consumed) assert.equal(results[1].value.code, "REWARD_STATE_CONFLICT");
    });
    for (const same of [false, true]) await t.test(`forced concurrent reassignments, same target=${same}`, async () => {
      const b = await create(); await reward(b.id);
      const results = await orderedRace((database) => assign(b, database), (database) => assign(b, database, same ? otherId : thirdId));
      assert(results.every((r) => r.status === "fulfilled" && r.value.ok)); const after = await load(b.id);
      assert.equal(after.sitterId, same ? otherId : thirdId); assert(after.visits.every((v) => v.sitterId === after.sitterId)); assert.equal(after.rewardReservation.status, "RELEASED");
      assert.equal((await history(b.id)).filter((h) => h.toSitterId).length, same ? 1 : 2); assert.equal(results[1].value.code, same ? "ALREADY_ASSIGNED" : "ASSIGNED");
    });
    console.log("Reassignment QA: both database paths authenticated; 16 real lock-overlap races verified.");
  } finally {
    if (originalDefault === undefined) delete process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID; else process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = originalDefault;
    try {
      // Scoped fixture-only deletion, children first to respect financial Restrict.
      const bookings = await db.booking.findMany({ where: { operatorId }, select: { id: true, clientId: true } });
      const bookingIds = bookings.map((b) => b.id), clientIds = bookings.map((b) => b.clientId);
      await db.$transaction(async (tx) => {
        await cleanupVisitFinance(tx, bookingIds);
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
        await tx.user.deleteMany({ where: { id: { in: [operatorId, sitterId, otherId, thirdId] } } });
      }, { timeout: 30000 });
      assert.deepEqual(await compensationProtectedState(db), baseline, "All protected counts and legacy money must return exactly to baseline.");
      console.log("Reassignment PostgreSQL QA: all fixture counts and legacy money restored; zero residue.");
      console.log(JSON.stringify({ protectedCounts: baseline.counts, cleanupVerified: true }));
    } finally { await db.$disconnect(); }
  }
});
