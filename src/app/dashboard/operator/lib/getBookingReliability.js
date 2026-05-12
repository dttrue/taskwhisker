// src/app/dashboard/lib/getBookingReliability.js
import { getSitterReliability } from "./sitterReliability";

export function getBookingReliability(booking, now = new Date()) {
  const history = booking.history || [];
  const currentTime = now instanceof Date ? now : new Date(now);

  const sitterFaultCount = history.filter(
    (h) => h.missedVisitReviewStatus === "SITTER_FAULT"
  ).length;

  const followUpCount = history.filter(
    (h) => h.missedVisitReviewStatus === "NEEDS_FOLLOW_UP"
  ).length;

  const excusedCount = history.filter(
    (h) => h.missedVisitReviewStatus === "EXCUSED"
  ).length;

  const unresolvedMissedFromHistory = history.filter(
    (h) =>
      h.note?.toLowerCase().includes("missed visit") &&
      !h.missedVisitReviewStatus
  ).length;

  const unresolvedMissedFromVisits = (booking.visits || []).filter((v) => {
    if (v.status !== "CONFIRMED") return false;

    const end = new Date(v.endTime);
    if (Number.isNaN(end.getTime())) return false;

    return end < currentTime;
  }).length;

  const unresolvedMissedCount =
    unresolvedMissedFromHistory + unresolvedMissedFromVisits;

  const lateCount = history.filter((h) =>
    h.note?.toLowerCase().includes("late")
  ).length;

  return getSitterReliability({
    sitterFaultCount,
    followUpCount,
    excusedCount,
    lateCount,
    unresolvedMissedCount,
  });
}
