import { isRetryableRewardTransactionError, REWARD_TRANSACTION_ATTEMPTS } from "../../rewards/rewardProgressGrantWrites.js";
import { REASSIGNABLE_VISIT_STATUSES } from "../../visits/visitPerformerAttribution.js";
import {
  BookingConfirmationError, CONFIRMATION_SELECT, reject, validateBookingState,
  validateConfirmation, validateVisitIntervals, validatePreService, assertSitterAvailable,
} from "./confirmationContract.js";

async function loadLockedBooking(tx, bookingId) {
  // Same order as compensation/reservations. Ordinary assignment/cancellation
  // UPDATEs also respect these row locks; Serializable retries stale snapshots.
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Visit" WHERE "bookingId" = ${bookingId} ORDER BY "id" FOR UPDATE`;
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: CONFIRMATION_SELECT });
  validateBookingState(booking);
  return booking;
}

async function databaseNow(tx) {
  const [clock] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  return clock?.now;
}

async function operationalTransaction(db, bookingId, actorId, work) {
  if (typeof bookingId !== "string" || !bookingId.trim() || typeof actorId !== "string" || !actorId.trim() || !db?.$transaction) {
    return { ok: false, code: "INVALID_INPUT", error: "A booking and operator identity are required." };
  }
  for (let attempt = 0; attempt < REWARD_TRANSACTION_ATTEMPTS; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        // Internal WithDb boundary still rejects non-operator actors.
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
        if (actor?.role !== "OPERATOR") reject("NOT_AUTHORIZED", "Operator authorization is required.");
        return work(tx, await loadLockedBooking(tx, bookingId));
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof BookingConfirmationError) return { ok: false, code: error.code, error: error.message };
      if (isRetryableRewardTransactionError(error)) {
        if (attempt + 1 < REWARD_TRANSACTION_ATTEMPTS) continue;
        return { ok: false, code: "CONCURRENT_CONFIRMATION_CONFLICT", error: "The booking changed concurrently. Please retry." };
      }
      return { ok: false, code: "BOOKING_PERSISTENCE_ERROR", error: "The booking could not be updated." };
    }
  }
}

// Trusted server dependency injection only. No caller assignment, availability,
// schedule, clock, money, or transaction callback enters the confirmation API.
export async function confirmBookingWithDb({ db, bookingId, actorId } = {}) {
  return operationalTransaction(db, bookingId, actorId, async (tx, booking) => {
    validateConfirmation(booking);
    await assertSitterAvailable(tx, booking.id, booking.sitterId, booking.visits);
    // A replay doesn't transition or retroactively accept care. It still checks
    // assignment/status/availability, but elapsed time alone doesn't undo success.
    if (booking.status === "CONFIRMED") return { ok: true, code: "ALREADY_CONFIRMED" };
    const now = await databaseNow(tx);
    validatePreService(booking.visits, now);
    const changed = await tx.booking.updateMany({
      where: { id: booking.id, status: "REQUESTED", sitterId: booking.sitterId, canceledAt: null, completedAt: null },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    if (changed.count !== 1) reject("CONCURRENT_CONFIRMATION_CONFLICT", "The booking changed concurrently. Please retry.");
    await tx.visit.updateMany({
      where: { bookingId: booking.id, status: "PENDING" }, data: { status: "CONFIRMED" },
    });
    await tx.bookingHistory.create({ data: {
      bookingId: booking.id, fromStatus: "REQUESTED", toStatus: "CONFIRMED",
      note: "Operator confirmed booking", changedByUserId: actorId,
    } });
    // If DB work crossed the start boundary, roll back status, Visits and history.
    validatePreService(booking.visits, await databaseNow(tx));
    return { ok: true, code: "CONFIRMED" };
  });
}

// Existing reassignment semantics, moved under the same safety boundary so an
// assignment cannot apply an availability decision made before confirmation.
export async function assignBookingSitterWithDb({ db, bookingId, actorId, sitterId, assignToMe = false } = {}) {
  if (sitterId !== null && (typeof sitterId !== "string" || !sitterId.trim())) {
    return { ok: false, code: "INVALID_SITTER", error: "Selected sitter was not found." };
  }
  return operationalTransaction(db, bookingId, actorId, async (tx, booking) => {
    const fromSitterId = booking.sitterId ?? null;
    if (fromSitterId === sitterId) return { ok: true, code: "ALREADY_ASSIGNED" };
    if (sitterId) {
      const sitter = await tx.user.findUnique({ where: { id: sitterId }, select: { role: true } });
      if (sitter?.role !== "SITTER") reject("INVALID_SITTER", "Selected sitter was not found.");
      validateVisitIntervals(booking.visits);
      await assertSitterAvailable(tx, booking.id, sitterId, booking.visits);
    }
    await tx.booking.update({ where: { id: booking.id }, data: { sitterId } });
    await tx.visit.updateMany({
      where: { bookingId: booking.id, status: { in: REASSIGNABLE_VISIT_STATUSES } }, data: { sitterId },
    });
    await tx.bookingHistory.create({ data: {
      bookingId: booking.id, fromSitterId, toSitterId: sitterId,
      note: assignToMe ? "Operator assigned booking to self"
        : !fromSitterId && sitterId ? "Operator assigned sitter"
        : fromSitterId && !sitterId ? "Operator unassigned sitter" : "Operator reassigned sitter",
      changedByUserId: actorId,
    } });
    return { ok: true, code: "ASSIGNED" };
  });
}
