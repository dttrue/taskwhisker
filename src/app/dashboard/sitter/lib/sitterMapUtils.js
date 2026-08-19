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

  const visitStart = new Date(booking.todayVisitStart);
  const visitEnd = booking.todayVisitEnd
    ? new Date(booking.todayVisitEnd)
    : null;
  const startTime = visitStart.getTime();

  if (Number.isNaN(startTime)) return null;

  if (
    visitEnd &&
    !Number.isNaN(visitEnd.getTime()) &&
    visitEnd.getTime() < now.getTime()
  ) {
    return null;
  }

  return visitStart;
}


export function getRelativeDayLabel(date, now) {
  const d = new Date(date);
  const n = new Date(now);

  const isToday = d.toDateString() === n.toDateString();

  const tomorrow = new Date(n);
  tomorrow.setDate(n.getDate() + 1);

  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";

  return null;
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
