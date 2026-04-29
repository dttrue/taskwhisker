// src/lib/getBookingNextAction.js
export function getBookingNextAction(booking, firstUpcomingVisit) {
  if (!booking.sitterId) {
    return {
      title: "Assign a sitter",
      description: "This confirmed booking still has no sitter assigned.",
      tone: "amber",
    };
  }

  if (booking.status === "CONFIRMED" && booking.sitterId) {
    const hasVisits = (booking.visits || []).length > 0;
    const allVisitsCompleted = (booking.visits || []).every(
      (v) => v.status === "COMPLETED"
    );

    if (hasVisits && !allVisitsCompleted) {
      return {
        title: "Waiting for sitter",
        description: "Visits are still in progress.",
        tone: "amber",
      };
    }

    if (hasVisits && allVisitsCompleted) {
      return {
        title: "Ready to complete",
        description: "All visits are completed.",
        tone: "green",
      };
    }

    return {
      title: "Ready for service",
      description: "Booking is confirmed and assigned.",
      tone: "green",
    };
  }

  return null;
}
