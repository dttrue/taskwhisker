export const REWARD_QUALIFICATION_SELECT = {
  id: true,
  status: true,
  attributionSnapshot: {
    select: {
      clientOriginKind: true,
      compensationLane: true,
      referringSitterId: true,
      requestedSitterId: true,
    },
  },
  visits: {
    select: { id: true, status: true, completedAt: true, performedBySitterId: true },
  },
  rewardReservation: { select: { status: true } },
};

const fail = (reasonCode) => ({ qualified: false, reasonCode });

// Only authoritative database rows belong here. The write service loads them;
// this pure evaluator is not itself an authorization or persistence boundary.
export function evaluateRewardQualification(booking, sitter) {
  if (!booking) return fail("BOOKING_NOT_FOUND");
  if (booking.status !== "COMPLETED") return fail("BOOKING_NOT_COMPLETED");
  const snapshot = booking.attributionSnapshot;
  if (!snapshot) return fail("ATTRIBUTION_SNAPSHOT_MISSING");
  if (
    snapshot.compensationLane !== "SITTER_ORIGINATED" ||
    snapshot.clientOriginKind !== "SITTER_REFERRAL"
  ) return fail("NOT_SITTER_ORIGINATED");
  const sitterId = snapshot.referringSitterId;
  if (!sitterId || snapshot.requestedSitterId !== sitterId) {
    return fail("SITTER_MISMATCH");
  }
  if (!sitter || sitter.id !== sitterId || sitter.role !== "SITTER") {
    return fail("INVALID_SITTER");
  }
  if (!Array.isArray(booking.visits) || booking.visits.length === 0) {
    return fail("NO_VISITS");
  }
  if (booking.visits.some((visit) => visit.status !== "COMPLETED")) {
    return fail("VISITS_NOT_COMPLETE");
  }
  if (booking.visits.some((visit) => !visit.performedBySitterId)) {
    return fail("PERFORMER_MISSING");
  }
  if (booking.visits.some((visit) => visit.performedBySitterId !== sitterId)) {
    return fail("PERFORMER_MISMATCH");
  }
  if (booking.visits.some((visit) =>
    !(visit.completedAt instanceof Date) || !Number.isFinite(visit.completedAt.getTime())
  )) return fail("COMPLETION_TIME_MISSING");
  if (["RESERVED", "CONSUMED"].includes(booking.rewardReservation?.status)) {
    return fail("BOOKING_ALREADY_REWARDED");
  }
  return {
    qualified: true,
    reasonCode: null,
    sitterId,
    qualificationTime: new Date(Math.max(...booking.visits.map((visit) => visit.completedAt.getTime()))),
  };
}
