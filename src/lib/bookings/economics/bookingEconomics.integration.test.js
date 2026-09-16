import { cleanupVisitFinance } from "../../../../scripts/visit-compensation-qa.mjs";
import { economicsInclude, economicsSelect, readBookingEconomics, aggregateBookingAmounts, clientTotalDisplay, sitterPayoutDisplay, visitPayoutEstimate } from "./bookingEconomics.js";
import { completeVisitWithDb, completeWholeBookingWithDb } from "./completionService.js";
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
import { reserveRewardForBookingWithDb } from "../../rewards/rewardReservationWrites.js";
import { commitBookingSitterCompensationWithDb } from "../compensation/commitBookingSitterCompensation.js";

test("guarded PostgreSQL economics readers and completion policy", {
  skip: process.env.TASKWHISKER_READERS_QA_TESTS !== "1", timeout: 300000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] }), marker = `readers-qa-${randomUUID()}`;
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
  async function reward(bookingId) {
    const [clock] = await db.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
    const event = await db.sitterRewardEvent.create({ data: { sitterId, type: "OPERATOR_PROGRESS_ADJUSTMENT", rewardCycle: 0, progressDelta: 0, occurredAt: clock.now, reason: marker } });
    const grant = await db.sitterRewardGrant.create({ data: { sitterId, rewardLevel: 1, feeBasisPoints: 500, maximumUses: 10, triggerEventId: event.id,
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

    let queryCount = 0;
    db.$on("query", () => { queryCount++; });
    const load = (id) => db.booking.findUnique({ where: { id }, include: { ...economicsInclude, visits: true } });
    const finish = (b, role = "SITTER") => completeVisitWithDb({ db, visitId: b.visits[0].id, actorId: role === "SITTER" ? sitterId : operatorId,
      actorRole: role, now: new Date(+b.visits[0].startTime + 60000) });
    const pending = await create(), standard = await create(), rewarded = await create(), business = await create({ business: true });
    await commit(standard.id); await reward(rewarded.id); await commit(rewarded.id); await commit(business.id);
    const old = await db.booking.create({ data: { operatorId, sitterId, clientId: pending.clientId, status: "CONFIRMED", startTime: pending.startTime, endTime: pending.endTime,
      clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
      visits: { create: { operatorId, sitterId, date: pending.visits[0].date, startTime: pending.visits[0].startTime, endTime: pending.visits[0].endTime, status: "CONFIRMED" } } }, include: { visits: true } });
    await t.test("actual Prisma select loads mixed frozen pricing, committed/reward/business payouts and pending state", async () => {
      queryCount = 0;
      const rows = await db.booking.findMany({ where: { id: { in: [old.id, pending.id, standard.id, rewarded.id, business.id] } }, select: economicsSelect });
      assert.equal(rows.length, 5); const batchCount = queryCount;
      assert.equal(aggregateBookingAmounts(rows).totalCents, 13750);
      assert.deepEqual(aggregateBookingAmounts(rows, "sitter"), { totalCents: null, knownTotalCents: 8675, pendingCount: 1, unavailableCount: 0 });
      assert.equal(sitterPayoutDisplay(rows.find((b) => b.id === pending.id)), "Pending");
      assert.equal(sitterPayoutDisplay(rows.find((b) => b.id === rewarded.id)), "$23.75");
      queryCount = 0;
      await db.booking.findMany({ where: { id: { in: [rewarded.id] } }, select: economicsSelect });
      assert.equal(batchCount, queryCount, "Relation query count must be constant, independent of Booking count.");
    });
    await t.test("historical display remains frozen after isolated fixture catalog change", async () => {
      await db.clientCareRate.update({ where: { id: option.clientRate.id }, data: { baseRateCents: 9999 } });
      try { assert.equal(clientTotalDisplay(await load(rewarded.id)), "$27.50"); assert.equal(sitterPayoutDisplay(await load(rewarded.id)), "$23.75"); }
      finally { await db.clientCareRate.update({ where: { id: option.clientRate.id }, data: { baseRateCents: 2500 } }); }
    });
    await t.test("canonical per-visit allocation guarded even with committed compensation", async () => { assert.equal(visitPayoutEstimate(await load(standard.id), 1), null); assert.equal(visitPayoutEstimate(await load(old.id), 1), 2250); });
    for (const role of ["OPERATOR", "SITTER"]) {
      await t.test(`${role}: operational completion persists, stable block, concurrent/repeated retry has no duplicate history`, async () => {
        const b = await create(); const results = await Promise.all([finish(b, role), finish(b, role)]);
        if (role === "SITTER") {
          assert(results.every((r) => !r.ok && r.code === "FINANCIAL_READINESS_MISSING"));
          assert.equal((await load(b.id)).visits[0].status, "CONFIRMED");
          assert.equal(await db.visitFinancialReview.count({ where: { visitId: b.visits[0].id } }), 1);
          return;
        }
        assert(results.every((r) => r.ok && r.code === "COMPENSATION_REQUIRED_FOR_COMPLETION"));
        const after = await load(b.id); assert.equal(after.visits[0].status, "COMPLETED"); assert.equal(after.status, "CONFIRMED"); assert.equal(after.sitterCompensation, null);
        const history = await db.bookingHistory.findMany({ where: { bookingId: b.id } });
        const retry = await finish(b, role); assert.equal(retry.alreadyCompleted, true); assert.equal(retry.code, "COMPENSATION_REQUIRED_FOR_COMPLETION");
        assert.deepEqual(await db.bookingHistory.findMany({ where: { bookingId: b.id } }), history);
        assert.deepEqual((await load(b.id)).visits, after.visits);
        assert.equal(history.filter((h) => h.toStatus === "COMPLETED").length, 0);
      });
      await t.test(`${role}: valid compensation permits auto-completion with null legacy columns`, async () => {
        const b = await create(); await commit(b.id); const before = (await load(b.id)).sitterCompensation;
        assert.equal((await finish(b, role)).ok, true); const after = await load(b.id);
        assert.equal(after.status, "COMPLETED"); assert.deepEqual(after.sitterCompensation, before);
        assert.deepEqual([after.clientTotalCents, after.platformFeeCents, after.sitterPayoutCents], [null, null, null]);
      });
    }
    await t.test("contradictory current assignment blocks booking while retaining operator visit completion", async () => {
      const b = await create(); await commit(b.id);
      await db.booking.update({ where: { id: b.id }, data: { sitterId: otherId } });
      const result = await finish(b, "OPERATOR"); assert.equal(result.code, "COMPENSATION_REQUIRED_FOR_COMPLETION");
      const after = await load(b.id); assert.equal(after.status, "CONFIRMED"); assert.equal(after.visits[0].status, "COMPLETED");
    });
    await t.test("whole-booking action blocks missing compensation and never creates it retroactively", async () => {
      await finish(pending, "OPERATOR"); const result = await completeWholeBookingWithDb({ db, bookingId: pending.id, actorId: operatorId });
      assert.equal(result.code, "COMPENSATION_REQUIRED_FOR_COMPLETION"); assert.equal((await load(pending.id)).sitterCompensation, null);
    });
    await t.test("legacy completion invariant and successful path preserved", async () => {
      await db.visit.updateMany({ where: { bookingId: old.id }, data: { status: "COMPLETED" } });
      await db.booking.update({ where: { id: old.id }, data: { platformFeeCents: 501 } });
      assert.equal((await completeWholeBookingWithDb({ db, bookingId: old.id, actorId: operatorId })).code, "LEGACY_PAYMENT_INCONSISTENT");
      await db.booking.update({ where: { id: old.id }, data: { platformFeeCents: 500 } });
      assert.equal((await completeWholeBookingWithDb({ db, bookingId: old.id, actorId: operatorId })).ok, true);
    });
    await t.test("canonical cancellation guard rejects both computed and waived fees before writes", async () => {
      const before = await load(standard.id);
      for (const waived of [true, false]) {
        const result = await db.$transaction((tx) => cancelBookingTransaction({ tx, bookingId: standard.id, actorId: operatorId, cancellationFeeCents: waived ? 0 : 413, cancellationFeeWaived: waived }));
        assert.equal(result.reason, "CANONICAL_CANCELLATION_REQUIRES_REVIEW");
      }
      assert.deepEqual(await load(standard.id), before);
    });
    await t.test("legacy cancellation uses unchanged fee and transaction writes", async () => {
      const b = await db.booking.create({ data: { operatorId, sitterId, clientId: pending.clientId, status: "CONFIRMED", startTime: pending.startTime, endTime: pending.endTime, clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250 } });
      const result = await db.$transaction((tx) => cancelBookingTransaction({ tx, bookingId: b.id, actorId: operatorId, cancellationFeeCents: 413, cancellationFeeWaived: false, cancellationFeeRateBps: 1500, historyNote: "Reader QA legacy cancellation", systemMessage: "Reader QA cancellation" }));
      assert.equal(result.ok, true); const after = await load(b.id); assert.equal(after.status, "CANCELED"); assert.equal(after.cancellationFeeCents, 413);
    });
    console.log("Reader QA: both database paths authenticated; mixed fixtures and actual workflows verified.");
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
        await tx.user.deleteMany({ where: { id: { in: [operatorId, sitterId, otherId] } } });
      }, { timeout: 30000 });
      assert.deepEqual(await compensationProtectedState(db), baseline, "All protected counts and legacy money must return exactly to baseline.");
      console.log("Reader PostgreSQL QA: all fixture counts and legacy money restored; zero residue.");
      console.log(JSON.stringify({ protectedCounts: baseline.counts, cleanupVerified: true }));
    } finally { await db.$disconnect(); }
  }
});
