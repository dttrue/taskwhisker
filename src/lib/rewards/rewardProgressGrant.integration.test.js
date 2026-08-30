import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { recordQualifyingSitterOriginatedCompletionWithDb as record } from "./rewardProgressGrantWrites.js";
import { REWARD_DURATION_MS } from "./rewardPolicy.js";

// Opt-in only. No seed/reset, existing-row mutation, live completion action,
// email, or reservation creation. Every fixture ID is captured before writes.
test("guarded PostgreSQL reward progress and concurrency", {
  skip: process.env.TASKWHISKER_REWARD_QA_TESTS !== "1",
  timeout: 240000,
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
  assert.deepEqual(identities[0], identities[1], "Runtime identities must match.");
  assert.equal(identities[0].branchId, expected, "Runtime branch must equal configured QA branch.");
  assert(!identities[0].branchId.endsWith("j4y"));

  const db = new PrismaClient();
  const protectedModels = [
    "user", "client", "booking", "visit", "bookingHistory", "bookingLineItem", "bookingPet", "pet",
    "clientOrigin", "bookingAttributionSnapshot", "bookingPricingSnapshot", "sitterReferralCode",
    "defaultSitterCareRate", "defaultSitterCareRatePetCharge", "sitterCareRate", "sitterCareRatePetCharge",
    "sitterRewardAccount", "sitterRewardEvent", "sitterRewardGrant", "sitterRewardReservation",
  ];
  async function counts() {
    return Object.fromEntries(await Promise.all(protectedModels.map(async (model) => [model, await db[model].count()])));
  }
  const marker = `reward-runtime-qa-${randomUUID()}`;
  const userIds = [];
  const sitterIds = [];
  const bookingIds = [];
  const clientId = `${marker}-client`;
  const operatorId = `${marker}-operator`;
  const now = new Date("2026-08-29T16:00:00.000Z");
  const clock = () => new Date(now);
  const earlier = new Date(now.getTime() - 3600000);
  const beforeCounts = await counts();
  const summaries = {};

  async function sitter() {
    const id = `${marker}-sitter-${sitterIds.length}`;
    userIds.push(id); sitterIds.push(id);
    await db.user.create({ data: { id, role: "SITTER", name: "Temporary reward QA", email: `${id}@example.invalid` } });
    return id;
  }
  async function booking(sitterId, { occurredAt = earlier, visitCount = 1, status = "COMPLETED", performerId = sitterId } = {}) {
    const id = `${marker}-booking-${bookingIds.length}`;
    bookingIds.push(id);
    const startTime = new Date(occurredAt.getTime() - 3600000);
    await db.booking.create({ data: {
      id, clientId, operatorId, sitterId, status, completedAt: status === "COMPLETED" ? occurredAt : null,
      startTime, endTime: occurredAt, notes: marker,
      clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
      attributionSnapshot: { create: {
        clientOriginKind: "SITTER_REFERRAL", compensationLane: "SITTER_ORIGINATED",
        referringSitterId: sitterId, requestedSitterId: sitterId, attributionSource: "OPERATOR_VERIFIED",
      } },
      visits: { create: Array.from({ length: visitCount }, (_, index) => ({
        id: `${id}-visit-${index}`, operatorId, sitterId, performedBySitterId: performerId,
        status: status === "COMPLETED" ? "COMPLETED" : "CONFIRMED",
        date: startTime, startTime, endTime: occurredAt,
        completedAt: status === "COMPLETED" ? new Date(occurredAt.getTime() - index * 1000) : null,
      })) },
    } });
    return id;
  }
  async function eventFor(sitterId, bookingId, cycle) {
    return db.sitterRewardEvent.create({ data: {
      sitterId, bookingId, qualificationBookingId: bookingId, progressBookingId: bookingId, type: "QUALIFYING_COMPLETION",
      rewardCycle: cycle, progressDelta: 1, occurredAt: earlier,
    } });
  }
  async function progress(sitterId, level, count) {
    await db.sitterRewardAccount.create({ data: { sitterId, rewardLevel: level, progressCount: count } });
    for (let index = 0; index < count; index += 1) {
      await eventFor(sitterId, await booking(sitterId), level);
    }
  }
  async function grantFor(sitterId, { status = "ACTIVE", startsAt = new Date(now.getTime() - 10000), expiresAt = new Date(now.getTime() + REWARD_DURATION_MS), pointer = true } = {}) {
    await progress(sitterId, 1, 0);
    const trigger = await eventFor(sitterId, await booking(sitterId), 0);
    const grant = await db.sitterRewardGrant.create({ data: {
      sitterId, rewardLevel: 1, feeBasisPoints: 500, maximumUses: 10,
      startsAt, expiresAt, status, triggerEventId: trigger.id,
    } });
    if (pointer) await db.sitterRewardAccount.update({ where: { sitterId }, data: { currentGrantId: grant.id } });
    return grant;
  }
  const run = (bookingId) => record({ db, bookingId, clock });
  try {
    userIds.push(operatorId);
    await db.user.create({ data: { id: operatorId, role: "OPERATOR", name: "Temporary reward QA", email: `${operatorId}@example.invalid` } });
    await db.client.create({ data: { id: clientId, name: "Temporary reward runtime QA" } });

    await t.test("first multi-visit booking creates one account and exactly one credit", async () => {
      const id = await sitter(); const b = await booking(id, { visitCount: 3 });
      const value = await run(b);
      assert.equal(value.status, "RECORDED");
      assert.equal(value.sitterId, id);
      assert.equal(value.progressBefore, 0); assert.equal(value.progressAfter, 1);
      assert.equal(await db.sitterRewardAccount.count({ where: { sitterId: id } }), 1);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: b } }), 1);
      const event = await db.sitterRewardEvent.findUnique({ where: { qualificationBookingId: b } });
      assert.equal(event.progressDelta, 1);
      assert.equal(event.progressBookingId, b);
      assert.equal(event.qualificationBookingId, b);
      assert.equal(event.occurredAt.getTime(), earlier.getTime());
      assert.equal(event.createdAt.getTime(), now.getTime());
      assert.notEqual(event.createdAt.getTime(), event.occurredAt.getTime());
      const retry = await run(b);
      assert.equal(retry.status, "ALREADY_RECORDED"); assert.equal(retry.eventId, event.id);
      assert.equal(retry.progressAfter, 1);
      const next = await run(await booking(id));
      assert.equal(next.progressAfter, 2);
      summaries.normal = value;
    });

    for (const [level, target] of [[0, 10], [1, 8], [2, 6]]) {
      await t.test(`level ${level} threshold ${target} unlocks once, preserves old cycle and standard economics`, async () => {
        const id = await sitter(); await progress(id, level, target - 1);
        const b = await booking(id);
        const moneyBefore = await db.booking.findUnique({ where: { id: b }, select: { clientTotalCents: true, platformFeeCents: true, sitterPayoutCents: true } });
        const value = await run(b);
        assert.equal(value.status, "GRANT_UNLOCKED");
        assert.equal(value.rewardLevelAfter, level + 1); assert.equal(value.progressAfter, 0);
        assert.equal(value.triggeringBookingUsesReward, false);
        const grant = await db.sitterRewardGrant.findUnique({ where: { id: value.grantId } });
        assert.equal(grant.feeBasisPoints, 500); assert.equal(grant.maximumUses, 10);
        assert.equal(grant.startsAt.getTime(), now.getTime());
        assert.equal(grant.expiresAt.getTime() - grant.startsAt.getTime(), REWARD_DURATION_MS);
        assert.equal(grant.triggerEventId, value.eventId);
        const event = await db.sitterRewardEvent.findUnique({ where: { id: value.eventId } });
        assert.equal(event.rewardCycle, level);
        const account = await db.sitterRewardAccount.findUnique({ where: { sitterId: id } });
        assert.equal(account.currentGrantId, grant.id);
        const retry = await run(b);
        assert.equal(retry.status, "ALREADY_RECORDED"); assert.equal(retry.grantId, grant.id);
        assert.equal(await db.sitterRewardGrant.count({ where: { sitterId: id } }), 1);
        assert.deepEqual(await db.booking.findUnique({ where: { id: b }, select: { clientTotalCents: true, platformFeeCents: true, sitterPayoutCents: true } }), moneyBefore);
        await assert.rejects(eventFor(id, b, level), { code: "P2002" });
        await assert.rejects(db.sitterRewardGrant.create({ data: {
          sitterId: id, rewardLevel: level + 1, feeBasisPoints: 500, maximumUses: 10,
          startsAt: now, expiresAt: grant.expiresAt, triggerEventId: event.id,
        } }), { code: "P2002" });
        summaries.unlock = value;
      });
    }

    await t.test("current grant writes durable suppression, replayed while active and after expiry", async () => {
      const id = await sitter(); const grant = await grantFor(id);
      const b = await booking(id); // earlier than grant.startsAt
      const accountBefore = await db.sitterRewardAccount.findUnique({ where: { sitterId: id } });
      const value = await run(b);
      assert.equal(value.status, "REWARD_ACTIVE_NO_PROGRESS");
      assert.equal(value.reasonCode, "CURRENT_GRANT_ACCEPTING");
      assert(value.qualificationTime < grant.startsAt);
      assert.equal(value.progressAfter, 0);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: b } }), 0);
      const event = await db.sitterRewardEvent.findUnique({ where: { progressBookingId: b } });
      assert.equal(event.id, value.eventId);
      assert.equal(event.type, "PROGRESS_SUPPRESSED");
      assert.equal(event.progressDelta, 0);
      assert.equal(event.qualificationBookingId, null);
      assert.equal(event.rewardCycle, accountBefore.rewardLevel);
      assert.equal(event.occurredAt.getTime(), earlier.getTime());
      assert.equal(event.createdAt.getTime(), now.getTime());
      assert.equal(event.grantId, grant.id);
      assert.equal(event.reason, "CURRENT_GRANT_ACCEPTING");
      assert.deepEqual(await run(b), value);
      assert.deepEqual(await db.sitterRewardAccount.findUnique({ where: { sitterId: id } }), accountBefore);
      const afterExpiry = new Date(grant.expiresAt.getTime() + 1000);
      assert.deepEqual(await record({ db, bookingId: b, clock: () => afterExpiry }), value);
      assert.deepEqual(await db.sitterRewardEvent.findUnique({ where: { progressBookingId: b } }), event);
      assert.equal(await db.sitterRewardEvent.count({ where: { progressBookingId: b } }), 1);
      // Credited and suppressed outcomes share the same structural slot.
      await assert.rejects(eventFor(id, b, accountBefore.rewardLevel), { code: "P2002" });
      summaries.active = value;
    });

    await t.test("delayed occurrence inside expired window stays blocked after pointer normalization", async () => {
      const id = await sitter();
      const startsAt = new Date(now.getTime() - 2 * REWARD_DURATION_MS);
      const expiresAt = new Date(now.getTime() - REWARD_DURATION_MS);
      const grant = await grantFor(id, { startsAt, expiresAt });
      const b = await booking(id, { occurredAt: new Date(startsAt.getTime() + 1000) });
      const value = await run(b);
      assert.equal(value.reasonCode, "HISTORICAL_GRANT_WINDOW");
      assert.equal((await db.sitterRewardGrant.findUnique({ where: { id: grant.id } })).status, "EXPIRED");
      assert.equal((await db.sitterRewardAccount.findUnique({ where: { sitterId: id } })).currentGrantId, null);
      assert.equal((await run(b)).reasonCode, "HISTORICAL_GRANT_WINDOW");
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: b } }), 0);
      const event = await db.sitterRewardEvent.findUnique({ where: { progressBookingId: b } });
      assert.equal(event.id, value.eventId);
      assert.equal(event.progressDelta, 0);
      assert.equal(event.qualificationBookingId, null);
      assert.equal(event.grantId, grant.id);
      assert.equal(event.reason, "HISTORICAL_GRANT_WINDOW");
      // Simulate later fixture-only revocation: replay must not recompute history.
      await db.sitterRewardGrant.update({ where: { id: grant.id }, data: { status: "REVOKED" } });
      assert.equal((await run(b)).eventId, event.id);
      assert.equal((await run(b)).reasonCode, "HISTORICAL_GRANT_WINDOW");
      const after = await run(await booking(id, { occurredAt: new Date(expiresAt.getTime() + 1000) }));
      assert.equal(after.status, "RECORDED"); assert.equal(after.progressAfter, 1);
      const sum = await db.sitterRewardEvent.aggregate({ where: { sitterId: id, rewardCycle: 1 }, _sum: { progressDelta: true } });
      assert.equal(sum._sum.progressDelta, 1); // zero-delta history does not inflate cached progress
      // Seven actual credits plus the suppressed record must still be below
      // the level-1 target of eight. Only the eighth +1 unlocks the next grant.
      for (let credit = 2; credit <= 7; credit += 1) {
        const earned = await run(await booking(id));
        assert.equal(earned.status, "RECORDED");
        assert.equal(earned.progressAfter, credit);
      }
      assert.equal(await db.sitterRewardGrant.count({ where: { sitterId: id } }), 1);
      const unlocked = await run(await booking(id));
      assert.equal(unlocked.status, "GRANT_UNLOCKED");
      assert.equal(unlocked.rewardLevelAfter, 2);
      assert.equal(unlocked.progressAfter, 0);
      // A different current grant cannot replace the original suppression reason.
      const finalReplay = await run(b);
      assert.equal(finalReplay.eventId, event.id);
      assert.equal(finalReplay.reasonCode, "HISTORICAL_GRANT_WINDOW");
      assert.equal(finalReplay.grantId, grant.id);
    });

    await t.test("historical interval includes startsAt and excludes expiresAt", async () => {
      const id = await sitter();
      const startsAt = new Date(now.getTime() - 20000); const expiresAt = new Date(now.getTime() - 10000);
      await grantFor(id, { status: "EXPIRED", startsAt, expiresAt, pointer: false });
      assert.equal((await run(await booking(id, { occurredAt: startsAt }))).status, "REWARD_ACTIVE_NO_PROGRESS");
      assert.equal((await run(await booking(id, { occurredAt: expiresAt }))).status, "RECORDED");
    });

    for (const status of ["EXHAUSTED", "REVOKED"]) {
      await t.test(`${status} stale pointer clears and earning resumes without inventing historical termination time`, async () => {
        const id = await sitter(); await grantFor(id, { status });
        const value = await run(await booking(id));
        assert.equal(value.status, "RECORDED");
        assert.equal((await db.sitterRewardAccount.findUnique({ where: { sitterId: id } })).currentGrantId, null);
      });
    }

    await t.test("nonqualifying booking creates no account or event", async () => {
      const id = await sitter(); const b = await booking(id, { status: "CONFIRMED" });
      const value = await run(b);
      assert.equal(value.status, "NOT_QUALIFIED"); assert.equal(value.reasonCode, "BOOKING_NOT_COMPLETED");
      assert.equal(await db.sitterRewardAccount.count({ where: { sitterId: id } }), 0);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: b } }), 0);
      summaries.notQualified = value;
    });

    await t.test("future completion time rolls back first-account creation", async () => {
      const id = await sitter(); const b = await booking(id, { occurredAt: new Date(now.getTime() + 1000) });
      assert.equal((await run(b)).reasonCode, "COMPLETION_TIME_IN_FUTURE");
      assert.equal(await db.sitterRewardAccount.count({ where: { sitterId: id } }), 0);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: b } }), 0);
    });

    await t.test("a cached-progress/ledger mismatch fails without issuing a credit", async () => {
      const id = await sitter(); const b = await booking(id);
      await db.sitterRewardAccount.create({ data: { sitterId: id, progressCount: 9 } });
      await assert.rejects(run(b), { code: "INVALID_REWARD_STATE" });
      assert.equal(await db.sitterRewardEvent.count({ where: { sitterId: id } }), 0);
      assert.equal(await db.sitterRewardGrant.count({ where: { sitterId: id } }), 0);
      assert.equal((await db.sitterRewardAccount.findUnique({ where: { sitterId: id } })).progressCount, 9);
    });

    await t.test("real concurrent first-account creation and two normal completions", async () => {
      const id = await sitter(); const a = await booking(id); const b = await booking(id);
      const values = await Promise.all([run(a), run(b)]);
      assert.deepEqual(values.map((value) => value.status), ["RECORDED", "RECORDED"]);
      assert.equal(await db.sitterRewardAccount.count({ where: { sitterId: id } }), 1);
      assert.equal((await db.sitterRewardAccount.findUnique({ where: { sitterId: id } })).progressCount, 2);
      assert.equal(await db.sitterRewardEvent.count({ where: { sitterId: id } }), 2);
    });

    await t.test("real threshold race vetoes later serialized pre-unlock completion", async () => {
      const id = await sitter(); await progress(id, 0, 9);
      const a = await booking(id, { occurredAt: new Date(now.getTime() - 60000) });
      const b = await booking(id, { occurredAt: new Date(now.getTime() - 59000) });
      const values = await Promise.all([run(a), run(b)]);
      assert.deepEqual(values.map((value) => value.status).sort(), ["GRANT_UNLOCKED", "REWARD_ACTIVE_NO_PROGRESS"]);
      assert(values.every((value) => value.qualificationTime < now));
      const account = await db.sitterRewardAccount.findUnique({ where: { sitterId: id } });
      assert.equal(account.rewardLevel, 1); assert.equal(account.progressCount, 0);
      assert.equal(await db.sitterRewardGrant.count({ where: { sitterId: id } }), 1);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: { in: [a, b] } } }), 1);
      assert.equal(await db.sitterRewardEvent.count({ where: { progressBookingId: { in: [a, b] } } }), 2);
      const loser = values.find((value) => value.status === "REWARD_ACTIVE_NO_PROGRESS");
      const suppression = await db.sitterRewardEvent.findUnique({ where: { progressBookingId: loser.bookingId } });
      assert.equal(suppression.progressDelta, 0);
      assert.equal(suppression.qualificationBookingId, null);
      const grant = await db.sitterRewardGrant.findUnique({ where: { id: account.currentGrantId } });
      const afterExpiry = new Date(grant.expiresAt.getTime() + 1000);
      // No new credit even when the vetoing grant has expired and is no longer current.
      await db.sitterRewardGrant.update({ where: { id: grant.id }, data: { status: "EXPIRED" } });
      await db.sitterRewardAccount.update({ where: { sitterId: id }, data: { currentGrantId: null } });
      const replay = await record({ db, bookingId: loser.bookingId, clock: () => afterExpiry });
      assert.equal(replay.status, "REWARD_ACTIVE_NO_PROGRESS");
      assert.equal(replay.reasonCode, loser.reasonCode);
      assert.equal(replay.eventId, loser.eventId);
      assert.equal(replay.grantId, loser.grantId);
      assert.equal(replay.progressAfter, 0);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: loser.bookingId } }), 0);
      assert.deepEqual(await db.sitterRewardEvent.findUnique({ where: { progressBookingId: loser.bookingId } }), suppression);
      assert.equal(await db.sitterRewardGrant.count({ where: { sitterId: id } }), 1);
      summaries.raceStatuses = values.map((value) => value.status);
      summaries.raceLoserAfterExpiry = replay.status;
    });

    await t.test("real concurrent suppressed retry writes exactly one zero-delta adjudication", async () => {
      const id = await sitter(); await grantFor(id); const b = await booking(id);
      const values = await Promise.all([run(b), run(b)]);
      assert(values.every((value) => value.status === "REWARD_ACTIVE_NO_PROGRESS"));
      assert.equal(values[0].eventId, values[1].eventId);
      assert.equal(await db.sitterRewardEvent.count({ where: { progressBookingId: b } }), 1);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: b } }), 0);
      const account = await db.sitterRewardAccount.findUnique({ where: { sitterId: id } });
      assert.equal(account.progressCount, 0);
      assert.equal(account.rewardLevel, 1);
      assert.equal(await db.sitterRewardGrant.count({ where: { sitterId: id } }), 1);
    });

    await t.test("real concurrent retry of the same booking increments exactly once", async () => {
      const id = await sitter(); const b = await booking(id);
      const values = await Promise.all([run(b), run(b)]);
      assert.deepEqual(values.map((value) => value.status).sort(), ["ALREADY_RECORDED", "RECORDED"]);
      assert.equal((await db.sitterRewardAccount.findUnique({ where: { sitterId: id } })).progressCount, 1);
      assert.equal(await db.sitterRewardEvent.count({ where: { qualificationBookingId: b } }), 1);
      assert.equal(await db.sitterRewardEvent.count({ where: { progressBookingId: b } }), 1);
      summaries.duplicate = values.find((value) => value.status === "ALREADY_RECORDED");
    });
    await t.test("database keeps adjudication/credit/reversal uniqueness separate from general booking audit", async () => {
      const indexes = await db.$queryRaw`
        SELECT tablename, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename IN ('SitterRewardEvent', 'SitterRewardGrant')
      `;
      const eventUnique = indexes.filter((row) => row.tablename === "SitterRewardEvent" && row.indexdef.includes(" UNIQUE "));
      for (const field of ["progressBookingId", "bookingId", "reversesEventId"]) {
        assert(eventUnique.some((row) => row.indexdef.includes(`("${field}")`)), `${field} remains independently unique`);
      }
      // Prisma bookingId maps to the physical auditBookingId; it remains non-unique.
      assert(!eventUnique.some((row) => row.indexdef.includes('"auditBookingId"')));
      assert(indexes.some((row) => row.tablename === "SitterRewardGrant" && row.indexdef.includes(" UNIQUE ") && row.indexdef.includes('("triggerEventId")')));
    });
    assert.equal(await db.sitterRewardReservation.count(), beforeCounts.sitterRewardReservation);
  } finally {
    try {
      await db.$transaction(async (tx) => {
        // Explicit IDs generated by this run only. Nothing selected by a broad
        // booking/date/status filter, and no pre-existing reward/user row touched.
        const owned = { sitterId: { in: sitterIds } };
        await tx.sitterRewardAccount.updateMany({ where: owned, data: { currentGrantId: null } });
        // Suppressions reference the vetoing grant; remove only our fixture
        // suppressions before grants, whose trigger events are removed afterward.
        await tx.sitterRewardEvent.deleteMany({ where: { ...owned, type: "PROGRESS_SUPPRESSED" } });
        await tx.sitterRewardGrant.deleteMany({ where: owned });
        await tx.sitterRewardEvent.deleteMany({ where: owned });
        await tx.sitterRewardAccount.deleteMany({ where: owned });
        await tx.bookingAttributionSnapshot.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.visit.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
        await tx.client.deleteMany({ where: { id: clientId } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }, { timeout: 20000 });
      const afterCounts = await counts();
      assert.deepEqual(afterCounts, beforeCounts, "Protected counts must return exactly to baseline.");
      console.log(JSON.stringify({ qaIdentityVerified: true, fixtureBookings: bookingIds.length, fixtureSitters: sitterIds.length, beforeCounts, afterCounts, cleanup: "complete", raceStatuses: summaries.raceStatuses, raceLoserAfterExpiry: summaries.raceLoserAfterExpiry }));
    } finally { await db.$disconnect(); }
  }
});
