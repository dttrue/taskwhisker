import { normalizeBookingAttributionSnapshot, resolveBookingCompensationLane } from "../../attribution/clientAttributionContract.js";

const text = (value) => typeof value === "string" && Boolean(value.trim());
const fail = (code) => ({ ok: false, code });

// Trusted persisted inputs only. Before commitment, derive from historical
// attribution and consistent current assignment. After commitment, validate the
// frozen lane; never resolve a replacement lane for an existing snapshot.
export function resolveEffectiveBookingCompensationLane(booking, { requireVisits = false, allowUnassigned = false } = {}) {
  const a = booking?.attributionSnapshot, c = booking?.sitterCompensation;
  if (!a || a.bookingId !== booking.id) return fail("INVALID_ATTRIBUTION");
  try { normalizeBookingAttributionSnapshot(a); } catch { return fail("INVALID_ATTRIBUTION"); }
  const sitterId = booking.sitterId;
  if (!text(sitterId) && !(allowUnassigned && sitterId === null && !c)) return fail("SITTER_MISMATCH");
  if (requireVisits && (!Array.isArray(booking.visits) || !booking.visits.length || booking.visits.length !== booking.quantity)) return fail("VISIT_ASSIGNMENT_MISMATCH");
  if (booking.visits && booking.visits.some((v) => v.bookingId !== booking.id || v.sitterId !== sitterId)) return fail("VISIT_ASSIGNMENT_MISMATCH");
  if (c) {
    if (c.bookingId !== booking.id || c.sitterId !== sitterId) return fail("COMPENSATION_IDENTITY_CONFLICT");
    const originated = a.compensationLane === "SITTER_ORIGINATED";
    if (c.compensationLane === "SITTER_ORIGINATED") {
      if (!originated || sitterId !== a.referringSitterId || sitterId !== a.requestedSitterId) return fail("COMPENSATION_IDENTITY_CONFLICT");
    } else if (c.compensationLane !== "BUSINESS_ASSIGNED" || (originated && sitterId === a.referringSitterId)) {
      return fail("COMPENSATION_IDENTITY_CONFLICT");
    }
    return { ok: true, sitterId, compensationLane: c.compensationLane, frozen: true };
  }
  const compensationLane = a.compensationLane === "BUSINESS_ASSIGNED" ? "BUSINESS_ASSIGNED" : resolveBookingCompensationLane({
    clientOrigin: { kind: a.clientOriginKind, referringSitterId: a.referringSitterId },
    requestedSitterId: a.requestedSitterId, assignedSitterId: sitterId,
  });
  return { ok: true, sitterId, compensationLane, frozen: false };
}

// Released entitlement may belong to the original sitter after reassignment.
// Ownership is still proved against historical attribution, never discarded.
export function rewardReservationMatchesHistoricalAttribution(booking, reservation) {
  const a = booking.attributionSnapshot, r = reservation;
  return Boolean(a && r && a.bookingId === booking.id && a.compensationLane === "SITTER_ORIGINATED" &&
    a.clientOriginKind === "SITTER_REFERRAL" && a.referringSitterId && a.requestedSitterId === a.referringSitterId &&
    r.bookingId === booking.id && r.sitterId === a.referringSitterId && r.grant && r.grantId === r.grant.id && r.grant.sitterId === r.sitterId);
}
