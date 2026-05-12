// src/app/dashboard/operator/lib/getRiskySitterSummary.js
import { getSitterReliability } from "./sitterReliability";

export function getRiskySitterSummary(bookings = [], now = new Date()) {
  const sitterMap = new Map();

  for (const booking of bookings) {
    if (!booking.sitterId || !booking.sitter) continue;

    const existing = sitterMap.get(booking.sitterId) || {
      sitterId: booking.sitterId,
      sitterName:
        booking.sitter.name || booking.sitter.email || "Unknown sitter",
      sitterFaultCount: 0,
      followUpCount: 0,
      excusedCount: 0,
      lateCount: 0,
      unresolvedMissedCount: 0,
    };

    const history = booking.history || [];

    existing.sitterFaultCount += history.filter(
      (h) => h.missedVisitReviewStatus === "SITTER_FAULT"
    ).length;

    existing.followUpCount += history.filter(
      (h) => h.missedVisitReviewStatus === "NEEDS_FOLLOW_UP"
    ).length;

    existing.excusedCount += history.filter(
      (h) => h.missedVisitReviewStatus === "EXCUSED"
    ).length;

    existing.lateCount += history.filter((h) =>
      h.note?.toLowerCase().includes("late")
    ).length;

    existing.unresolvedMissedCount += history.filter(
      (h) =>
        h.note?.toLowerCase().includes("missed visit") &&
        !h.missedVisitReviewStatus
    ).length;

    existing.unresolvedMissedCount += (booking.visits || []).filter((v) => {
      if (v.status !== "CONFIRMED") return false;

      const end = new Date(v.endTime);
      if (Number.isNaN(end.getTime())) return false;

      return end < now;
    }).length;

    sitterMap.set(booking.sitterId, existing);
  }

  return Array.from(sitterMap.values())
    .map((sitter) => ({
      ...sitter,
      reliability: getSitterReliability({
        sitterFaultCount: sitter.sitterFaultCount,
        followUpCount: sitter.followUpCount,
        excusedCount: sitter.excusedCount,
        lateCount: sitter.lateCount,
        unresolvedMissedCount: sitter.unresolvedMissedCount,
      }),
    }))
    .filter((sitter) => sitter.reliability.level !== "excellent")
    .sort((a, b) => a.reliability.score - b.reliability.score);
}
