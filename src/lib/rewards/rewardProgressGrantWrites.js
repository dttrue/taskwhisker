import {
  REWARD_MAX_USES,
  REWARD_SITTER_FEE_BPS,
  getRewardExpiry,
  getRewardProgressTarget,
  inspectCurrentRewardGrant,
} from "./rewardPolicy.js";
import { REWARD_QUALIFICATION_SELECT, evaluateRewardQualification } from "./rewardQualification.js";

export const REWARD_TRANSACTION_ATTEMPTS = 3;
const MAX_INT = 2_147_483_647;

export class RewardProgressError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RewardProgressError";
    this.code = code;
  }
}

function invalidState() {
  throw new RewardProgressError("INVALID_REWARD_STATE", "Reward state requires review before progress can be recorded.");
}

export function isRetryableRewardTransactionError(error) {
  return error?.code === "P2034" ||
    ["40001", "40P01"].includes(error?.code) ||
    (error?.code === "P2010" && ["40001", "40P01"].includes(error?.meta?.code));
}

function result(status, bookingId, {
  sitterId = null, qualificationTime = null, before = null, after = before,
  eventId = null, grantId = null, reasonCode = null,
} = {}) {
  return {
    status, bookingId, sitterId, qualificationTime,
    progressBefore: before?.progressCount ?? null,
    progressAfter: after?.progressCount ?? null,
    rewardLevelBefore: before?.rewardLevel ?? null,
    rewardLevelAfter: after?.rewardLevel ?? null,
    eventId, grantId, triggeringBookingUsesReward: false, reasonCode,
  };
}

async function existingAdjudication(tx, bookingId) {
  const event = await tx.sitterRewardEvent.findUnique({
    where: { progressBookingId: bookingId },
    include: { triggeredGrant: { select: { id: true } } },
  });
  if (!event) return null;
  if (event.bookingId !== bookingId || event.progressBookingId !== bookingId) invalidState();
  const suppressed = event.type === "PROGRESS_SUPPRESSED";
  if (suppressed) {
    if (event.progressDelta !== 0 || event.qualificationBookingId !== null || !event.grantId ||
        event.triggeredGrant || !["CURRENT_GRANT_ACCEPTING", "HISTORICAL_GRANT_WINDOW"].includes(event.reason)) invalidState();
  } else if (event.type !== "QUALIFYING_COMPLETION" || event.progressDelta !== 1 ||
      event.qualificationBookingId !== bookingId) invalidState();
  const account = await tx.sitterRewardAccount.findUnique({ where: { sitterId: event.sitterId } });
  if (!account) invalidState();
  // Replay the stored disposition before re-reading qualification/grant state.
  // Account counters reflect current state; reason, event, grant and occurrence
  // remain those of the original adjudication, even after expiry/revocation.
  return result(suppressed ? "REWARD_ACTIVE_NO_PROGRESS" : "ALREADY_RECORDED", bookingId, {
    sitterId: event.sitterId, qualificationTime: event.occurredAt,
    before: account, eventId: event.id,
    grantId: suppressed ? event.grantId : event.triggeredGrant?.id ?? null,
    reasonCode: suppressed ? event.reason : null,
  });
}

async function recordSuppression(tx, { bookingId, sitterId, qualificationTime, before, account, grantId, reasonCode, now }) {
  const event = await tx.sitterRewardEvent.create({ data: {
    sitterId, bookingId, progressBookingId: bookingId, qualificationBookingId: null,
    type: "PROGRESS_SUPPRESSED", progressDelta: 0, rewardCycle: account.rewardLevel,
    occurredAt: qualificationTime, createdAt: now, grantId, reason: reasonCode,
  } });
  return result("REWARD_ACTIVE_NO_PROGRESS", bookingId, {
    sitterId, qualificationTime, before, after: account, eventId: event.id, grantId, reasonCode,
  });
}

function validateAccount(account) {
  for (const key of ["rewardLevel", "progressCount", "version"]) {
    if (!Number.isInteger(account?.[key]) || account[key] < (key === "version" ? 1 : 0) || account[key] >= MAX_INT) invalidState();
  }
}

function validateGrant(grant, sitterId) {
  if (!grant || grant.sitterId !== sitterId ||
      !["ACTIVE", "EXPIRED", "EXHAUSTED", "REVOKED"].includes(grant.status) ||
      !(grant.startsAt instanceof Date) || !(grant.expiresAt instanceof Date) ||
      !Number.isFinite(grant.startsAt.getTime()) || !Number.isFinite(grant.expiresAt.getTime()) ||
      grant.expiresAt <= grant.startsAt || !Number.isInteger(grant.maximumUses) || grant.maximumUses < 1) invalidState();
}

async function recordInTransaction(tx, bookingId, clock) {
  const recorded = await existingAdjudication(tx, bookingId);
  if (recorded) return recorded;
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: REWARD_QUALIFICATION_SELECT });
  const referringSitterId = booking?.attributionSnapshot?.referringSitterId;
  const sitter = referringSitterId
    ? await tx.user.findUnique({ where: { id: referringSitterId }, select: { id: true, role: true } })
    : null;
  const qualification = evaluateRewardQualification(booking, sitter);
  if (!qualification.qualified) return result("NOT_QUALIFIED", bookingId, { reasonCode: qualification.reasonCode });
  const { sitterId, qualificationTime } = qualification;

  // Unique sitterId handles creation races; SERIALIZABLE retries restart any
  // transaction whose snapshot predates a competing creator/locked update.
  await tx.sitterRewardAccount.createMany({ data: [{ sitterId }], skipDuplicates: true });
  await tx.$queryRaw`SELECT "id" FROM "SitterRewardAccount" WHERE "sitterId" = ${sitterId} FOR UPDATE`;
  const replay = await existingAdjudication(tx, bookingId);
  if (replay) return replay;
  let account = await tx.sitterRewardAccount.findUnique({ where: { sitterId } });
  validateAccount(account);
  const before = account;
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalidState();
  if (qualificationTime > now) {
    // Throw to roll back even the just-created empty account.
    throw new RewardProgressError("COMPLETION_TIME_IN_FUTURE", "Completion time cannot be in the future.");
  }
  if (account.currentGrantId) {
    const grant = await tx.sitterRewardGrant.findUnique({ where: { id: account.currentGrantId } });
    validateGrant(grant, sitterId);
    const capacityUsed = await tx.sitterRewardReservation.count({
      where: { grantId: grant.id, status: { in: ["RESERVED", "CONSUMED"] } },
    });
    const state = inspectCurrentRewardGrant(grant, now, capacityUsed);
    // Deliberate serialized threshold veto, including pre-unlock completions.
    if (state.accepting) return recordSuppression(tx, {
      bookingId, sitterId, qualificationTime, before, account, now,
      grantId: grant.id, reasonCode: "CURRENT_GRANT_ACCEPTING",
    });
    if (state.normalizedStatus !== grant.status) {
      await tx.sitterRewardGrant.update({ where: { id: grant.id }, data: { status: state.normalizedStatus } });
    }
    account = await tx.sitterRewardAccount.update({
      where: { id: account.id }, data: { currentGrantId: null, version: { increment: 1 } },
    });
  }

  // Check all time-bounded historical grants, not just the current pointer.
  // EXHAUSTED/REVOKED termination instants are not reconstructable in V1. Their
  // historical windows are intentionally not inferred from updatedAt or counts.
  const historicalGrant = await tx.sitterRewardGrant.findFirst({
    where: {
      sitterId, status: { in: ["ACTIVE", "EXPIRED"] },
      startsAt: { lte: qualificationTime }, expiresAt: { gt: qualificationTime },
    },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
  });
  if (historicalGrant) return recordSuppression(tx, {
    bookingId, sitterId, qualificationTime, before, account, now,
    grantId: historicalGrant.id, reasonCode: "HISTORICAL_GRANT_WINDOW",
  });

  const target = getRewardProgressTarget(account.rewardLevel);
  const ledger = await tx.sitterRewardEvent.aggregate({
    where: { sitterId, rewardCycle: account.rewardLevel }, _sum: { progressDelta: true },
  });
  if ((ledger._sum.progressDelta ?? 0) !== account.progressCount || account.progressCount >= target) invalidState();
  const event = await tx.sitterRewardEvent.create({ data: {
    sitterId, bookingId, qualificationBookingId: bookingId, progressBookingId: bookingId,
    type: "QUALIFYING_COMPLETION", progressDelta: 1, rewardCycle: account.rewardLevel,
    occurredAt: qualificationTime, createdAt: now,
  } });
  const nextProgress = account.progressCount + 1;
  let grant = null;
  if (nextProgress === target) {
    grant = await tx.sitterRewardGrant.create({ data: {
      sitterId, rewardLevel: account.rewardLevel + 1,
      feeBasisPoints: REWARD_SITTER_FEE_BPS, maximumUses: REWARD_MAX_USES,
      startsAt: now, expiresAt: getRewardExpiry(now), status: "ACTIVE",
      triggerEventId: event.id, createdAt: now,
    } });
  }
  const after = await tx.sitterRewardAccount.update({ where: { id: account.id }, data: {
    progressCount: grant ? 0 : nextProgress,
    rewardLevel: grant ? account.rewardLevel + 1 : account.rewardLevel,
    currentGrantId: grant?.id ?? null, version: { increment: 1 },
  } });
  return result(grant ? "GRANT_UNLOCKED" : "RECORDED", bookingId, {
    sitterId, qualificationTime, before, after, eventId: event.id, grantId: grant?.id ?? null,
  });
}

export async function recordQualifyingSitterOriginatedCompletionWithDb({ db, bookingId, clock = () => new Date() }) {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!id || typeof db?.$transaction !== "function" || typeof clock !== "function") {
    throw new RewardProgressError("INVALID_INPUT", "A booking ID and transaction-capable database are required.");
  }
  for (let attempt = 0; attempt < REWARD_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction((tx) => recordInTransaction(tx, id, clock), {
        isolationLevel: "Serializable", maxWait: 10000, timeout: 20000,
      });
    } catch (error) {
      if (error instanceof RewardProgressError) {
        if (error.code === "COMPLETION_TIME_IN_FUTURE") {
          return result("NOT_QUALIFIED", id, { reasonCode: error.code });
        }
        throw error;
      }
      if (isRetryableRewardTransactionError(error)) {
        if (attempt + 1 < REWARD_TRANSACTION_ATTEMPTS) continue;
        throw new RewardProgressError("TRANSACTION_CONFLICT", "Reward progress could not be serialized; retry later.");
      }
      if (error?.code === "P2002") {
        // The failed transaction was rolled back. Only an actual persisted
        // progress adjudication may turn a uniqueness conflict into a replay.
        try {
          const replay = await existingAdjudication(db, id);
          if (replay) return replay;
        } catch (replayError) {
          if (replayError instanceof RewardProgressError) throw replayError;
        }
      }
      throw new RewardProgressError("PERSISTENCE_ERROR", "Reward progress could not be recorded.");
    }
  }
}
