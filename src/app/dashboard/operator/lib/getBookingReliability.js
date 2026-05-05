// src/app/dashboard/lib/getBookingReliability.js
import { getSitterReliability } from "./sitterReliability";

export function getBookingReliability(booking, now = new Date()) {
  const history = booking.history || [];
  const currentTime = now instanceof Date ? now : new Date(now);

  const unresolvedMissedCount = (booking.visits || []).filter((v) => {
    if (v.status !== "CONFIRMED") return false;

    const end = new Date(v.endTime);
    if (Number.isNaN(end.getTime())) return false;

    return end < currentTime;
  }).length;

  const missedCount = history.filter((h) =>
    h.note?.toLowerCase().includes("missed visit")
  ).length;

  const lateCount = history.filter((h) =>
    h.note?.toLowerCase().includes("late")
  ).length;

  return getSitterReliability({
    missedCount,
    lateCount,
    unresolvedMissedCount,
  });
}
