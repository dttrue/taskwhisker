const PRIORITY_ORDER = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
};

function toTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

export function sortInterventionIssues(issues = []) {
  return [...issues].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? Number.MAX_SAFE_INTEGER) -
        (PRIORITY_ORDER[b.priority] ?? Number.MAX_SAFE_INTEGER) ||
      toTimestamp(a.timestamp) - toTimestamp(b.timestamp) ||
      String(a.id).localeCompare(String(b.id))
  );
}

export function buildInterventionIssues({
  liveMissedBookings = [],
  missedReviewBookings = [],
  requestedBookings = [],
  cancellationConversations = [],
  unassignedVisits = [],
} = {}) {
  const issues = [];

  for (const booking of liveMissedBookings) {
    for (const visit of booking.visits || []) {
      issues.push({
        id: `missed-visit:${visit.id}`,
        type: "MISSED_VISIT",
        priority: "URGENT",
        title: "Missed visit needs review",
        description: "This confirmed visit ended without being completed or reviewed.",
        bookingId: booking.id,
        visitId: visit.id,
        sitterId: visit.sitterId,
        timestamp: visit.endTime,
        petDisplayName: booking.petDisplayName,
        serviceSummary: booking.serviceSummary,
        ownerName: booking.ownerName,
        sitterName: visit.sitterName,
        actionHref: `/dashboard/operator/bookings/${booking.id}?review=needs-review&mode=triage`,
        actionLabel: "Review missed visit",
      });
    }
  }

  for (const booking of missedReviewBookings) {
    for (const history of booking.unresolvedHistories || []) {
      issues.push({
        id: `missed-review:${history.id}`,
        type: "MISSED_REVIEW",
        priority: "URGENT",
        title: "Missed-visit record needs review",
        description: "An unresolved missed-visit history entry requires operator review.",
        bookingId: booking.id,
        visitId: null,
        sitterId: booking.sitterId,
        timestamp: history.createdAt,
        petDisplayName: booking.petDisplayName,
        serviceSummary: booking.serviceSummary,
        ownerName: booking.ownerName,
        sitterName: booking.sitterName,
        actionHref: `/dashboard/operator/bookings/${booking.id}?review=needs-review&mode=triage`,
        actionLabel: "Review booking",
      });
    }
  }

  for (const visit of unassignedVisits) {
    issues.push({
      id: `unassigned-visit:${visit.id}`,
      type: "UNASSIGNED_VISIT",
      priority:
        visit.operationalStatus === "CURRENT" ||
        visit.operationalStatus === "MISSED"
          ? "URGENT"
          : "HIGH",
      title: "Visit needs a sitter",
      description: "Today’s visit has no sitter assigned in the visit schedule.",
      bookingId: visit.bookingId,
      visitId: visit.id,
      sitterId: null,
      timestamp: visit.startTime,
      petDisplayName: visit.petDisplayName,
      serviceSummary: visit.serviceSummary,
      ownerName: visit.ownerName,
      sitterName: null,
      actionHref: `/dashboard/operator/bookings/${visit.bookingId}`,
      actionLabel: "Assign sitter",
    });
  }

  for (const conversation of cancellationConversations) {
    const booking = conversation.booking;
    const request = conversation.messages?.[0];
    if (!booking || !request) continue;

    issues.push({
      id: `cancellation-request:${request.id}`,
      type: "CLIENT_CANCELLATION_REQUEST",
      priority: "HIGH",
      title: "Client cancellation request",
      description: "The client asked to cancel this active booking.",
      bookingId: booking.id,
      visitId: null,
      sitterId: booking.sitterId,
      timestamp: request.createdAt,
      petDisplayName: booking.petDisplayName,
      serviceSummary: booking.serviceSummary,
      ownerName: booking.ownerName,
      sitterName: booking.sitterName,
      actionHref: `/dashboard/operator/bookings/${booking.id}`,
      actionLabel: "Review request",
    });
  }

  for (const booking of requestedBookings) {
    issues.push({
      id: `requested-booking:${booking.id}`,
      type: "REQUESTED_BOOKING",
      priority: "NORMAL",
      title: "Booking awaiting confirmation",
      description: "A requested booking is waiting for operator review.",
      bookingId: booking.id,
      visitId: null,
      sitterId: booking.sitterId,
      timestamp: booking.createdAt,
      petDisplayName: booking.petDisplayName,
      serviceSummary: booking.serviceSummary,
      ownerName: booking.ownerName,
      sitterName: booking.sitterName,
      actionHref: `/dashboard/operator/bookings/${booking.id}`,
      actionLabel: "Review booking",
    });
  }

  const missedBookingIds = new Set(
    issues
      .filter(
        (issue) =>
          issue.type === "MISSED_VISIT" || issue.type === "MISSED_REVIEW"
      )
      .map((issue) => issue.bookingId)
  );
  const missedVisitIds = new Set(
    issues
      .filter((issue) => issue.type === "MISSED_VISIT")
      .map((issue) => issue.visitId)
  );
  const cancellationBookingIds = new Set(
    issues
      .filter((issue) => issue.type === "CLIENT_CANCELLATION_REQUEST")
      .map((issue) => issue.bookingId)
  );
  const unassignedBookingIds = new Set(
    issues
      .filter((issue) => issue.type === "UNASSIGNED_VISIT")
      .map((issue) => issue.bookingId)
  );

  return sortInterventionIssues(
    issues.filter((issue) => {
      if (
        issue.type === "UNASSIGNED_VISIT" &&
        (missedVisitIds.has(issue.visitId) ||
          cancellationBookingIds.has(issue.bookingId))
      ) {
        return false;
      }

      if (
        issue.type === "REQUESTED_BOOKING" &&
        (missedBookingIds.has(issue.bookingId) ||
          cancellationBookingIds.has(issue.bookingId) ||
          unassignedBookingIds.has(issue.bookingId))
      ) {
        return false;
      }

      return true;
    })
  );
}
