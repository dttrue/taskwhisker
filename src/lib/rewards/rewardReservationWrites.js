import { inspectCurrentRewardGrant } from "./rewardPolicy.js";
import {
  isRetryableRewardTransactionError,
  REWARD_TRANSACTION_ATTEMPTS,
} from "./rewardProgressGrantWrites.js";

const reservationInclude = {
  grant: { select: { feeBasisPoints: true, maximumUses: true, rewardLevel: true } },
};
const bookingSelect = {
  id: true, sitterId: true, status: true, canceledAt: true, completedAt: true,
  sitterCompensation: { select: { id: true } },
  attributionSnapshot: { select: {
    clientOriginKind: true, compensationLane: true,
    referringSitterId: true, requestedSitterId: true,
  } },
};

export class RewardReservationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RewardReservationError";
    this.code = code;
  }
}

function invalidState() {
  throw new RewardReservationError("INVALID_REWARD_STATE", "Reward state requires review before reservations can change.");
}

function result(status, bookingId, reasonCode = null, row = null) {
  return {
    status, bookingId, reasonCode,
    reservation: row ? {
      id: row.id, bookingId: row.bookingId, sitterId: row.sitterId,
      grantId: row.grantId, status: row.status, reservedAt: row.reservedAt,
      consumedAt: row.consumedAt, releasedAt: row.releasedAt, releaseReason: row.releaseReason,
      // Grant economic terms are immutable in the runtime. The future
      // compensation snapshot will copy them from this captured entitlement.
      feeBasisPoints: row.grant.feeBasisPoints,
      maximumUses: row.grant.maximumUses, rewardLevel: row.grant.rewardLevel,
    } : null,
  };
}

function replay(row) {
  const statuses = {
    RESERVED: "ALREADY_RESERVED", CONSUMED: "ALREADY_CONSUMED", RELEASED: "RESERVATION_RELEASED",
  };
  if (!statuses[row.status]) invalidState();
  return result(statuses[row.status], row.bookingId,
    row.status === "RELEASED" ? "RESERVATION_RELEASED" : null, row);
}

function findReservation(tx, bookingId) {
  return tx.sitterRewardReservation.findUnique({ where: { bookingId }, include: reservationInclude });
}

async function lockAccount(tx, sitterId) {
  await tx.$queryRaw`SELECT "id" FROM "SitterRewardAccount" WHERE "sitterId" = ${sitterId} FOR UPDATE`;
  return tx.sitterRewardAccount.findUnique({ where: { sitterId } });
}

async function databaseTime(tx) {
  // CURRENT_TIMESTAMP is the transaction start, possibly BEFORE a lock wait.
  // Sample the database wall clock after locks/reads, immediately before the
  // eligibility decision, and persist that same millisecond instant.
  const [row] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  if (!(row?.now instanceof Date) || !Number.isFinite(row.now.getTime())) invalidState();
  return row.now;
}

function touchAccount(tx, account, extra = {}) {
  // Every capacity/lifecycle mutation writes this shared row. Waiting
  // Serializable snapshots therefore conflict and restart with fresh state.
  return tx.sitterRewardAccount.update({
    where: { id: account.id }, data: { ...extra, version: { increment: 1 } },
  });
}

function eligibilityReason(booking, sitter) {
  if (!booking) return "BOOKING_NOT_FOUND";
  if (booking.sitterCompensation) return "COMPENSATION_ALREADY_COMMITTED";
  if (booking.status === "CANCELED" || booking.canceledAt) return "BOOKING_CANCELED";
  if (!["REQUESTED", "CONFIRMED"].includes(booking.status) || booking.completedAt) return "BOOKING_NOT_RESERVABLE";
  const snapshot = booking.attributionSnapshot;
  if (!snapshot) return "ATTRIBUTION_SNAPSHOT_MISSING";
  if (snapshot.compensationLane !== "SITTER_ORIGINATED" || snapshot.clientOriginKind !== "SITTER_REFERRAL") return "NOT_SITTER_ORIGINATED";
  if (!snapshot.referringSitterId || !snapshot.requestedSitterId || snapshot.referringSitterId !== snapshot.requestedSitterId) return "SITTER_MISMATCH";
  if (!sitter || sitter.id !== snapshot.referringSitterId || sitter.role !== "SITTER") return "INVALID_SITTER";
  if (booking.sitterId !== sitter.id) return "BOOKING_REASSIGNED";
  return null;
}

async function reserveInTransaction(tx, bookingId) {
  // Also keep the current assignment/lifecycle stable through the decision.
  // No Booking writes or booking-creation integration are performed here.
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
  const existing = await findReservation(tx, bookingId);
  if (existing) {
    // Durable entitlement takes precedence over subsequent eligibility changes.
    if (!await lockAccount(tx, existing.sitterId)) invalidState();
    return replay(await findReservation(tx, bookingId));
  }
  const sitterId = booking?.attributionSnapshot?.referringSitterId;
  const sitter = sitterId ? await tx.user.findUnique({ where: { id: sitterId }, select: { id: true, role: true } }) : null;
  const reason = eligibilityReason(booking, sitter);
  if (reason) return result("NOT_ELIGIBLE", bookingId, reason);
  const account = await lockAccount(tx, sitterId);
  if (!account) return result("NO_REWARD_AVAILABLE", bookingId, "NO_REWARD_ACCOUNT");
  const existingAfterLock = await findReservation(tx, bookingId);
  if (existingAfterLock) return replay(existingAfterLock);
  if (!account.currentGrantId) return result("NO_REWARD_AVAILABLE", bookingId, "NO_CURRENT_GRANT");
  const grant = await tx.sitterRewardGrant.findUnique({
    where: { id: account.currentGrantId },
    include: { triggerEvent: { select: { bookingId: true, qualificationBookingId: true, progressBookingId: true } } },
  });
  if (!grant || grant.sitterId !== sitterId || !grant.triggerEvent ||
      !["ACTIVE", "EXPIRED", "EXHAUSTED", "REVOKED"].includes(grant.status) ||
      !(grant.startsAt instanceof Date) || !(grant.expiresAt instanceof Date) ||
      !Number.isFinite(grant.startsAt.getTime()) || !Number.isFinite(grant.expiresAt.getTime()) ||
      grant.expiresAt <= grant.startsAt || !Number.isInteger(grant.maximumUses) || grant.maximumUses < 1 ||
      !Number.isInteger(grant.feeBasisPoints) || grant.feeBasisPoints < 0 || grant.feeBasisPoints > 10000) invalidState();
  const capacityUsed = await tx.sitterRewardReservation.count({
    where: { grantId: grant.id, status: { in: ["RESERVED", "CONSUMED"] } },
  });
  const now = await databaseTime(tx);
  const state = inspectCurrentRewardGrant(grant, now, capacityUsed);
  if (!state.accepting) {
    if (state.normalizedStatus !== grant.status) {
      await tx.sitterRewardGrant.update({ where: { id: grant.id }, data: { status: state.normalizedStatus } });
    }
    await touchAccount(tx, account, { currentGrantId: null });
    return result("NO_REWARD_AVAILABLE", bookingId, `GRANT_${state.normalizedStatus}`);
  }
  if (now < grant.startsAt) return result("NO_REWARD_AVAILABLE", bookingId, "GRANT_NOT_STARTED");
  if (Object.values(grant.triggerEvent).includes(bookingId)) {
    return result("NOT_ELIGIBLE", bookingId, "TRIGGER_BOOKING_NOT_ELIGIBLE");
  }
  const reservation = await tx.sitterRewardReservation.create({ data: {
    bookingId, sitterId, grantId: grant.id, status: "RESERVED", reservedAt: now,
  }, include: reservationInclude });
  const exhausted = capacityUsed + 1 === grant.maximumUses;
  if (exhausted) {
    await tx.sitterRewardGrant.update({ where: { id: grant.id }, data: { status: "EXHAUSTED" } });
  }
  await touchAccount(tx, account, exhausted ? { currentGrantId: null } : {});
  return result("RESERVED", bookingId, null, reservation);
}

async function transitionInTransaction(tx, bookingId, target, reason) {
  const existing = await findReservation(tx, bookingId);
  if (!existing) return result("RESERVATION_NOT_FOUND", bookingId, "RESERVATION_NOT_FOUND");
  const account = await lockAccount(tx, existing.sitterId);
  if (!account) invalidState();
  const row = await findReservation(tx, bookingId);
  if (!row) invalidState();
  if (row.status === target) return result(`ALREADY_${target}`, bookingId, null, row);
  if (!["RESERVED", "CONSUMED", "RELEASED"].includes(row.status)) invalidState();
  if (row.status !== "RESERVED") return result("INVALID_RESERVATION_TRANSITION", bookingId,
    row.status === "CONSUMED" ? "CONSUMED_CANNOT_RELEASE" : "RELEASED_CANNOT_CONSUME", row);
  const now = await databaseTime(tx);
  const updated = await tx.sitterRewardReservation.update({ where: { id: row.id }, data: target === "CONSUMED"
    ? { status: target, consumedAt: now }
    : { status: target, releasedAt: now, releaseReason: reason }, include: reservationInclude });
  await touchAccount(tx, account);
  // Never check current acceptance here. RESERVED froze the entitlement.
  // Release never changes any grant status or restores the account pointer.
  return result(target, bookingId, null, updated);
}

async function run({ db, bookingId }, work, allowReserveReplay = false) {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!id || typeof db?.$transaction !== "function") {
    throw new RewardReservationError("INVALID_INPUT", "A booking ID and transaction-capable database are required.");
  }
  for (let attempt = 0; attempt < REWARD_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction((tx) => work(tx, id), {
        isolationLevel: "Serializable", maxWait: 10000, timeout: 20000,
      });
    } catch (error) {
      if (error instanceof RewardReservationError) throw error;
      if (isRetryableRewardTransactionError(error)) {
        if (attempt + 1 < REWARD_TRANSACTION_ATTEMPTS) continue;
        throw new RewardReservationError("TRANSACTION_CONFLICT", "Reward reservation could not be serialized; retry later.");
      }
      if (allowReserveReplay && error?.code === "P2002") {
        // Only an actual durable reservation for THIS booking can satisfy a
        // uniqueness conflict. Never leak database constraint details.
        try {
          const existing = await findReservation(db, id);
          if (existing) return replay(existing);
        } catch (replayError) {
          if (replayError instanceof RewardReservationError) throw replayError;
        }
      }
      throw new RewardReservationError("PERSISTENCE_ERROR", "Reward reservation could not be persisted.");
    }
  }
}

// Injectable database boundary for tests/internal composition only. Production
// callers use rewardReservationService.js, which binds the server database.
export function reserveRewardForBookingWithDb({ db, bookingId } = {}) {
  return run({ db, bookingId }, reserveInTransaction, true);
}

export function consumeRewardReservationWithDb({ db, bookingId } = {}) {
  return run({ db, bookingId }, (tx, id) => transitionInTransaction(tx, id, "CONSUMED"));
}

// No compensation-earned check exists in Phase 1. Future compensation code
// must establish that precondition before calling this internal operation.
export async function releaseRewardReservationWithDb({ db, bookingId, reason } = {}) {
  const normalizedReason = typeof reason === "string" ? reason.trim().replace(/\s+/g, " ") : "";
  if (!normalizedReason) throw new RewardReservationError("INVALID_RELEASE_REASON", "A non-empty release reason is required.");
  return run({ db, bookingId }, (tx, id) => transitionInTransaction(tx, id, "RELEASED", normalizedReason));
}
