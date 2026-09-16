import { activeAuthorization, authorizationValid } from "./contract.js";

// Original commitment is context, never a cap. Missing coverage remains explicit.
export function readVisitCompensationExposure(booking) {
  let earnedPayoutCents = 0, unearnedAuthorizedPayoutCents = 0, reviewVisitCount = 0;
  for (const visit of booking.visits) {
    if (visit.compensationAllocation) { earnedPayoutCents += visit.compensationAllocation.sitterPayoutCents; continue; }
    if (visit.status === "CANCELED") continue;
    const authorization = activeAuthorization(visit);
    if (visit.status === "COMPLETED" || !authorizationValid(booking, visit, authorization)) { reviewVisitCount++; continue; }
    unearnedAuthorizedPayoutCents += authorization.sitterPayoutCents;
  }
  return { originalCommitmentPayoutCents: booking.sitterCompensation?.sitterPayoutCents ?? null,
    earnedPayoutCents, unearnedAuthorizedPayoutCents,
    currentExposurePayoutCents: reviewVisitCount ? null : earnedPayoutCents + unearnedAuthorizedPayoutCents,
    reviewVisitCount };
}
