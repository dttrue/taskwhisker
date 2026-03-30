// src/app/dashboard/sitter/lib/sitterMapUtils.js

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getActionableVisitTime(booking, now) {
  if (!now || !booking.todayVisitStart) return null;

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const visitStart = new Date(booking.todayVisitStart);
  const time = visitStart.getTime();

  if (Number.isNaN(time)) return null;

  if (time + graceMs < now.getTime()) return null;

  return visitStart;
}

export function isVisitInGraceWindow(booking, now) {
  if (!now || !booking.todayVisitStart) return false;

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const visitStart = new Date(booking.todayVisitStart);
  const time = visitStart.getTime();

  if (Number.isNaN(time)) return false;

  return time <= now.getTime() && time + graceMs >= now.getTime();
}

export function getSortTime(booking, now) {
  const actionableVisit = getActionableVisitTime(booking, now);
  return actionableVisit ? actionableVisit.getTime() : Number.MAX_SAFE_INTEGER;
}
