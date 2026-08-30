import assert from "node:assert/strict";
import test from "node:test";
import {
  isRetryableRewardTransactionError, recordQualifyingSitterOriginatedCompletionWithDb,
  RewardProgressError, REWARD_TRANSACTION_ATTEMPTS,
} from "./rewardProgressGrantWrites.js";

test("only recognized serialization/deadlock errors are retryable", () => {
  for (const error of [{ code: "P2034" }, { code: "40001" }, { code: "40P01" }, { code: "P2010", meta: { code: "40001" } }]) {
    assert.equal(isRetryableRewardTransactionError(error), true);
  }
  for (const error of [new Error("deadlock text is not a recognized code"), { code: "P2002" }, { code: "P2025" }, null]) {
    assert.equal(isRetryableRewardTransactionError(error), false);
  }
});
test("serialization failures use bounded retry with Serializable options", async () => {
  let calls = 0;
  const db = { async $transaction(work, options) {
    assert.equal(typeof work, "function");
    assert.equal(options.isolationLevel, "Serializable");
    calls += 1; throw Object.assign(new Error("internal"), { code: "P2034" });
  } };
  await assert.rejects(recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" }), { code: "TRANSACTION_CONFLICT" });
  assert.equal(calls, REWARD_TRANSACTION_ATTEMPTS);
});
test("a recognized conflict can succeed on a later attempt", async () => {
  let calls = 0;
  const db = { async $transaction() {
    calls += 1;
    if (calls === 1) throw { code: "P2034" };
    return { status: "RECORDED" };
  } };
  assert.deepEqual(await recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" }), { status: "RECORDED" });
  assert.equal(calls, 2);
});
test("arbitrary errors are sanitized and never retried", async () => {
  let calls = 0;
  const db = { async $transaction() { calls += 1; throw new Error("sensitive database internals"); } };
  await assert.rejects(recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" }), (error) => {
    assert.equal(error.code, "PERSISTENCE_ERROR");
    assert(!error.message.includes("sensitive"));
    return true;
  });
  assert.equal(calls, 1);
});
test("application validation errors are not retried", async () => {
  let calls = 0;
  const db = { async $transaction() { calls += 1; throw new RewardProgressError("INVALID_REWARD_STATE", "Review required"); } };
  await assert.rejects(recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" }), { code: "INVALID_REWARD_STATE" });
  assert.equal(calls, 1);
});
test("unknown uniqueness conflicts cannot masquerade as a duplicate credit", async () => {
  const db = {
    async $transaction() { throw { code: "P2002" }; },
    sitterRewardEvent: { async findUnique() { return null; } },
  };
  await assert.rejects(recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" }), { code: "PERSISTENCE_ERROR" });
});
test("uniqueness conflict with persisted source returns idempotent result", async () => {
  const db = {
    async $transaction() { throw { code: "P2002" }; },
    sitterRewardEvent: { async findUnique({ where }) {
      assert.deepEqual(where, { progressBookingId: "fixture" });
      return { id: "event", sitterId: "sitter", bookingId: "fixture", progressBookingId: "fixture", qualificationBookingId: "fixture", type: "QUALIFYING_COMPLETION", progressDelta: 1, occurredAt: new Date(0), triggeredGrant: { id: "grant" } };
    } },
    sitterRewardAccount: { async findUnique() { return { rewardLevel: 1, progressCount: 0 }; } },
  };
  const result = await recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" });
  assert.equal(result.status, "ALREADY_RECORDED");
  assert.equal(result.eventId, "event");
  assert.equal(result.grantId, "grant");
  assert.equal(result.triggeringBookingUsesReward, false);
});
test("missing booking identity fails before any transaction", async () => {
  await assert.rejects(recordQualifyingSitterOriginatedCompletionWithDb({ db: {}, bookingId: " " }), { code: "INVALID_INPUT" });
});

function suppressionReplayDb(overrides = {}) {
  return {
    sitterRewardEvent: { async findUnique({ where }) {
      assert.deepEqual(where, { progressBookingId: "fixture" });
      return {
        id: "suppressed", sitterId: "sitter", bookingId: "fixture", progressBookingId: "fixture",
        qualificationBookingId: null, type: "PROGRESS_SUPPRESSED", progressDelta: 0,
        occurredAt: new Date(0), grantId: "original-grant", reason: "CURRENT_GRANT_ACCEPTING",
        triggeredGrant: null, ...overrides,
      };
    } },
    sitterRewardAccount: { async findUnique() { return { rewardLevel: 3, progressCount: 2 }; } },
    // Any attempt to re-read booking, grant, or eligibility would fail this test.
    $transaction(work) { return work(this); },
  };
}

for (const reason of ["CURRENT_GRANT_ACCEPTING", "HISTORICAL_GRANT_WINDOW"]) {
  test(`${reason} replay preserves disposition without re-reading qualification or grant`, async () => {
    const db = suppressionReplayDb({ reason });
    const value = await recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" });
    assert.equal(value.status, "REWARD_ACTIVE_NO_PROGRESS");
    assert.equal(value.eventId, "suppressed");
    assert.equal(value.reasonCode, reason);
    assert.equal(value.grantId, "original-grant");
    assert.equal(value.qualificationTime.getTime(), 0);
    assert.equal(value.progressAfter, 2);
    assert.equal(value.triggeringBookingUsesReward, false);
  });
}

test("suppressed adjudication uniqueness conflict replays zero-progress outcome", async () => {
  const db = suppressionReplayDb();
  db.$transaction = async () => { throw { code: "P2002" }; };
  const value = await recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId: "fixture" });
  assert.equal(value.status, "REWARD_ACTIVE_NO_PROGRESS");
  assert.equal(value.eventId, "suppressed");
});

for (const [label, overrides] of [
  ["nonzero suppression", { progressDelta: 1 }],
  ["suppression occupying credit slot", { qualificationBookingId: "fixture" }],
  ["suppression triggering a grant", { triggeredGrant: { id: "grant" } }],
  ["missing suppression reason", { reason: null }],
  ["general audit event", { type: "OPERATOR_PROGRESS_ADJUSTMENT" }],
]) {
  test(`invalid ${label} fails closed rather than changing disposition`, async () => {
    await assert.rejects(recordQualifyingSitterOriginatedCompletionWithDb({
      db: suppressionReplayDb(overrides), bookingId: "fixture",
    }), { code: "INVALID_REWARD_STATE" });
  });
}

test("transaction normalizes ACTIVE capacity exhaustion without creating a reservation", async () => {
  const now = new Date("2026-08-29T16:00:00Z");
  let account = { id: "account", sitterId: "sitter", rewardLevel: 1, progressCount: 0, version: 1, currentGrantId: "grant" };
  const grant = { id: "grant", sitterId: "sitter", status: "ACTIVE", maximumUses: 10, startsAt: new Date(now.getTime() - 10000), expiresAt: new Date(now.getTime() + 10000) };
  let eventCount = 0;
  const tx = {
    booking: { async findUnique() { return {
      id: "booking", status: "COMPLETED",
      attributionSnapshot: { clientOriginKind: "SITTER_REFERRAL", compensationLane: "SITTER_ORIGINATED", referringSitterId: "sitter", requestedSitterId: "sitter" },
      visits: [{ status: "COMPLETED", performedBySitterId: "sitter", completedAt: new Date(now.getTime() - 1000) }],
    }; } },
    user: { async findUnique() { return { id: "sitter", role: "SITTER" }; } },
    sitterRewardAccount: {
      async createMany(input) { assert.equal(input.skipDuplicates, true); },
      async findUnique() { return account; },
      async update({ data }) {
        account = { ...account, ...data, version: account.version + data.version.increment };
        return account;
      },
    },
    async $queryRaw(strings, sitterId) {
      assert(strings.join("?").includes('WHERE "sitterId" = ? FOR UPDATE'));
      assert.equal(sitterId, "sitter");
      return [{ id: "account" }];
    },
    sitterRewardReservation: { async count({ where }) {
      assert.deepEqual(where, { grantId: "grant", status: { in: ["RESERVED", "CONSUMED"] } });
      return 10;
    } },
    sitterRewardGrant: {
      async findUnique() { return grant; },
      async update({ data }) { grant.status = data.status; return grant; },
      async findFirst({ where }) {
        assert.deepEqual(where.status.in, ["ACTIVE", "EXPIRED"]);
        assert.equal(grant.status, "EXHAUSTED");
        return null;
      },
    },
    sitterRewardEvent: {
      async findUnique() { return null; },
      async aggregate() { return { _sum: { progressDelta: null } }; },
      async create({ data }) { eventCount += 1; return { id: "event", ...data }; },
    },
  };
  const value = await recordQualifyingSitterOriginatedCompletionWithDb({
    db: { $transaction: (work) => work(tx) }, bookingId: "booking", clock: () => now,
  });
  assert.equal(value.status, "RECORDED");
  assert.equal(value.progressAfter, 1);
  assert.equal(account.currentGrantId, null);
  assert.equal(grant.status, "EXHAUSTED");
  assert.equal(eventCount, 1);
});
