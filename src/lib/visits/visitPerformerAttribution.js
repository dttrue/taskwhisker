export const SITTER_COMPLETION_OUTCOME = Object.freeze({
  COMPLETE: "COMPLETE",
  ALREADY_COMPLETED: "ALREADY_COMPLETED",
  PERFORMER_CONFLICT: "PERFORMER_CONFLICT",
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  CANCELED: "CANCELED",
  INVALID_STATUS: "INVALID_STATUS",
});

export const REASSIGNABLE_VISIT_STATUSES = Object.freeze([
  "PENDING",
  "CONFIRMED",
]);

export function resolveSitterCompletionOutcome(visit, sitterId) {
  if (visit.sitterId !== sitterId) {
    return SITTER_COMPLETION_OUTCOME.NOT_AUTHORIZED;
  }

  if (visit.status === "COMPLETED") {
    if (
      visit.performedBySitterId &&
      visit.performedBySitterId !== sitterId
    ) {
      return SITTER_COMPLETION_OUTCOME.PERFORMER_CONFLICT;
    }

    return SITTER_COMPLETION_OUTCOME.ALREADY_COMPLETED;
  }

  if (visit.status === "CANCELED") {
    return SITTER_COMPLETION_OUTCOME.CANCELED;
  }

  if (visit.status !== "CONFIRMED") {
    return SITTER_COMPLETION_OUTCOME.INVALID_STATUS;
  }

  return SITTER_COMPLETION_OUTCOME.COMPLETE;
}

export function buildSitterCompletionData(sitterId, completedAt) {
  return {
    status: "COMPLETED",
    completedAt,
    performedBySitterId: sitterId,
  };
}

export function buildOperatorCompletionData(completedAt) {
  return {
    status: "COMPLETED",
    completedAt,
  };
}

export function isBookingReadyForAutoCompletion(remainingActiveVisitCount) {
  return remainingActiveVisitCount === 0;
}
