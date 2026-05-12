// src/app/dashboard/operator/lib/bookingNeedsReview.js

export function bookingNeedsReview(booking, now = new Date()) {
  return (
    (booking.history || []).some(
      (h) =>
        h.note?.toLowerCase().includes("missed visit") &&
        !h.missedVisitReviewStatus
    ) ||
    (booking.visits || []).some((visit) => {
      if (visit.status !== "CONFIRMED") return false;

      const end = new Date(visit.endTime);
      if (Number.isNaN(end.getTime())) return false;

      return end < now;
    })
  );
}
