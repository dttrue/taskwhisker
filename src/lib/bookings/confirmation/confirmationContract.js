export class BookingConfirmationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BookingConfirmationError";
    this.code = code;
  }
}

export function reject(code, message) {
  throw new BookingConfirmationError(code, message);
}

// Operational data only: persisted Visits, never schedule labels or money.
export const CONFIRMATION_SELECT = {
  id: true, status: true, sitterId: true, operatorId: true,
  canonicalCreationKey: true, canonicalInputHash: true, careOptionId: true, careOfferingId: true, careOptionCode: true, careOfferingCode: true, quantity: true, billingUnit: true, scheduleKind: true, pricingSnapshot: true, sitterCompensation: true,
  confirmedAt: true, canceledAt: true, completedAt: true,
  sitter: { select: { id: true, role: true } },
  visits: {
    select: {
      id: true, bookingId: true, operatorId: true, sitterId: true,
      status: true, startTime: true, endTime: true,
      completedAt: true, performedBySitterId: true,
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  },
};

const validDate = (value) => value instanceof Date && Number.isFinite(value.getTime());

export function validateBookingState(booking) {
  if (!booking) reject("BOOKING_NOT_FOUND", "Booking not found.");
  if (!["REQUESTED", "CONFIRMED"].includes(booking.status) || booking.canceledAt || booking.completedAt) {
    reject("INVALID_BOOKING_STATUS", "Only an active REQUESTED booking can be confirmed.");
  }
}

export function validateVisitIntervals(visits) {
  for (const visit of visits) {
    if (!validDate(visit.startTime) || !validDate(visit.endTime) || visit.startTime >= visit.endTime) {
      reject("VISIT_TIME_INVALID", "Every visit must have a valid increasing start and end time.");
    }
  }
}

export function validateConfirmation(booking) {
  validateBookingState(booking);
  if (!booking.sitterId) reject("SITTER_NOT_ASSIGNED", "Assign a sitter before confirming this booking.");
  if (booking.sitter?.id !== booking.sitterId || booking.sitter?.role !== "SITTER") {
    reject("INVALID_SITTER", "The assigned user must be a sitter.");
  }
  if (!booking.visits?.length) reject("NO_VISITS", "At least one visit is required for confirmation.");
  validateVisitIntervals(booking.visits);
  for (const visit of booking.visits) {
    if (visit.sitterId !== booking.sitterId || visit.bookingId !== booking.id || visit.operatorId !== booking.operatorId) {
      reject("VISIT_ASSIGNMENT_MISMATCH", "Every visit must match the booking's sitter and operator assignment.");
    }
    const allowed = booking.status === "CONFIRMED" ? ["CONFIRMED"] : ["PENDING", "CONFIRMED"];
    if (!allowed.includes(visit.status) || visit.completedAt || visit.performedBySitterId) {
      reject("INVALID_VISIT_STATE", "Confirmation requires active, unperformed visits with consistent status.");
    }
  }
  // Reject self-conflicting persisted schedules too; don't silently repair them.
  const ordered = [...booking.visits].sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].startTime < ordered[i - 1].endTime) {
      reject("SITTER_UNAVAILABLE", "This booking contains overlapping visits for the same sitter.");
    }
  }
}

export function validatePreService(visits, now) {
  if (!validDate(now)) reject("INVALID_DATABASE_TIME", "Database time is unavailable.");
  if (visits.some((visit) => visit.startTime <= now)) {
    reject("VISIT_ALREADY_STARTED", "Confirm the booking strictly before its first visit starts.");
  }
}

export async function assertSitterAvailable(tx, bookingId, sitterId, visits) {
  for (const visit of visits) {
    const conflict = await tx.visit.findFirst({
      where: {
        bookingId: { not: bookingId }, sitterId,
        booking: { status: { not: "CANCELED" } },
        // Preserve operator CONFIRMED-Visit blockers, including legacy rows.
        // A PENDING Visit on a CONFIRMED Booking also reserves that interval.
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", booking: { status: "CONFIRMED" } },
        ],
        startTime: { lt: visit.endTime }, endTime: { gt: visit.startTime },
      },
      select: { id: true },
    });
    if (conflict) reject("SITTER_UNAVAILABLE", "This sitter already has an assignment overlapping a visit in this booking.");
  }
}
