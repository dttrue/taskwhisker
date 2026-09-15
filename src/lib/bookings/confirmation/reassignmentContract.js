import { economicsSelect, isCanonicalBooking, readBookingEconomics } from "../economics/bookingEconomics.js";
import { resolveEffectiveBookingCompensationLane } from "../compensation/effectiveCompensationLane.js";
import { validateReservation } from "../compensation/compensationContract.js";
import { CONFIRMATION_SELECT, reject, validateVisitIntervals } from "./confirmationContract.js";

export const REASSIGNMENT_SELECT = { ...CONFIRMATION_SELECT, ...economicsSelect,
  rewardReservation: { include: { grant: true } } };
export const COMMITTED_REASSIGNMENT_REVIEW = "COMPENSATION_COMMITTED_REASSIGNMENT_REQUIRES_REVIEW";
export const COMMITTED_REASSIGNMENT_MESSAGE = "Compensation is already committed. This reassignment requires review.";

export function validateReassignmentCare(booking, now) {
  if (!(now instanceof Date) || !Number.isFinite(+now)) reject("INVALID_DATABASE_TIME", "Database time is unavailable.");
  if (!booking.visits?.length) reject("NO_VISITS", "Persisted visits are required for reassignment.");
  if (booking.visits.some((v) => v.status === "COMPLETED" || v.completedAt || v.performedBySitterId || v.startTime <= now)) {
    reject("CARE_ALREADY_STARTED", "Care has already started or been performed. Whole-booking reassignment requires review.");
  }
  validateVisitIntervals(booking.visits);
  if (booking.visits.some((v) => v.bookingId !== booking.id || v.operatorId !== booking.operatorId || v.sitterId !== booking.sitterId ||
      !(booking.status === "CONFIRMED" ? ["CONFIRMED"] : ["PENDING", "CONFIRMED"]).includes(v.status))) {
    reject("VISIT_ASSIGNMENT_MISMATCH", "Visit assignment or status requires review before reassignment.");
  }
  const ordered = [...booking.visits].sort((a, b) => a.startTime - b.startTime);
  if (ordered.some((v, index) => index > 0 && v.startTime < ordered[index - 1].endTime)) reject("SITTER_UNAVAILABLE", "This booking contains overlapping visits.");
}

// Called only with the Booking and Visits locked, and the reward account locked
// when present. Returns a release plan; no financial or attribution writes.
export function reassignmentPlan(booking, sitterId, now) {
  const canonical = isCanonicalBooking(booking), c = booking.sitterCompensation;
  if (c) {
    if (sitterId !== booking.sitterId || c.sitterId !== booking.sitterId || readBookingEconomics(booking).sitter.status !== "COMMITTED") {
      reject(COMMITTED_REASSIGNMENT_REVIEW, COMMITTED_REASSIGNMENT_MESSAGE);
    }
    return { alreadyAssigned: true };
  }
  if (booking.rewardReservation?.status === "CONSUMED") reject("REWARD_STATE_CONFLICT", "Consumed reward has no compensation snapshot. Reassignment requires review.");
  if (booking.sitterId === sitterId) return { alreadyAssigned: true };
  validateReassignmentCare(booking, now);
  if (!canonical) {
    // Legacy money has no approved effective-lane commitment transition. Do not
    // invalidate active reward ownership while retaining those historical amounts.
    if (booking.rewardReservation && booking.rewardReservation.status !== "RELEASED") reject("REWARD_STATE_CONFLICT", "Active legacy reward entitlement requires review before reassignment.");
    return { releaseReservation: false };
  }
  if (booking.sitterCompensation === undefined || booking.rewardReservation === undefined) reject("REWARD_STATE_CONFLICT", "Financial relations must be loaded before reassignment.");
  if (readBookingEconomics(booking).client.status !== "AVAILABLE") reject("INVALID_CANONICAL_CONTRACT", "Frozen client pricing requires review before reassignment.");
  const before = resolveEffectiveBookingCompensationLane(booking, { requireVisits: true, allowUnassigned: true });
  const after = resolveEffectiveBookingCompensationLane({ ...booking, sitterId, visits: booking.visits.map((v) => ({ ...v, sitterId })) }, { requireVisits: true, allowUnassigned: true });
  if (!before.ok || !after.ok) reject("SITTER_ORIGINATED_REASSIGNMENT_REQUIRES_LANE_CHANGE", "Frozen attribution or assignment requires review.");
  const r = booking.rewardReservation;
  if (r) {
    try { validateReservation(r, booking.id, before.sitterId, before.compensationLane, booking.attributionSnapshot); }
    catch { reject("REWARD_STATE_CONFLICT", "Reward reservation history requires review before reassignment."); }
    if (r.status === "CONSUMED" || r.reservedAt > now || r.releasedAt > now) reject("REWARD_STATE_CONFLICT", "Consumed or contradictory reward history cannot be reassigned.");
  }
  return { compensationLane: after.compensationLane,
    releaseReservation: r?.status === "RESERVED" && before.compensationLane === "SITTER_ORIGINATED" && after.compensationLane === "BUSINESS_ASSIGNED" };
}
