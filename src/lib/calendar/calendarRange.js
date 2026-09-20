import { businessDateKey, businessWallTime, dateNumber, addCalendarDays, BUSINESS_TIME_ZONE } from "./businessTime.js";

const weekday = (date) => new Date(dateNumber(date)).getUTCDay();
function monthStart(date, offset = 0) {
  const value = new Date(dateNumber(`${date.slice(0, 7)}-01`));
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 10);
}

// Pure calendar arithmetic: no identities, database access or process-local dates.
export function calendarRange(params = {}, now = new Date()) {
  const view = ["week", "today", "day"].includes(params.view)
    ? (params.view === "day" ? "today" : params.view) : "month";
  const today = businessDateKey(now);
  let date = today, selectedDate = null;
  try { dateNumber(params.date); date = params.date; selectedDate = date; } catch { /* Invalid links reset to today. */ }
  const month = monthStart(date);
  let first, count, previous, next;
  if (view === "month") {
    first = addCalendarDays(month, -weekday(month));
    const followingMonth = monthStart(date, 1);
    const end = addCalendarDays(followingMonth, (7 - weekday(followingMonth)) % 7);
    count = (dateNumber(end) - dateNumber(first)) / 86400000;
    previous = monthStart(date, -1); next = followingMonth;
  } else {
    first = view === "week" ? addCalendarDays(date, -weekday(date)) : date;
    count = view === "week" ? 7 : 1;
    previous = addCalendarDays(first, -count); next = addCalendarDays(first, count);
  }
  const days = Array.from({ length: count }, (_, i) => addCalendarDays(first, i));
  return { view, date, selectedDate, today, month: month.slice(0, 7), days,
    label: new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, month: "long", year: "numeric" }).format(businessWallTime(month, "00:00")),
    startsAt: businessWallTime(first, "00:00"), endsAt: businessWallTime(addCalendarDays(first, count), "00:00"), previous, next };
}

export const CALENDAR_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELED"];

// A visit contributes once per intersected local day. Endpoints are half-open:
// ending exactly at midnight does not occupy the following day.
export function aggregateMonth(range, visits) {
  const unique = [...new Map(visits.map((visit) => [visit.id, visit])).values()];
  return range.days.map((date) => {
    const start = businessWallTime(date, "00:00"), end = businessWallTime(addCalendarDays(date, 1), "00:00");
    const counts = Object.fromEntries(CALENDAR_STATUSES.map((status) => [status, 0]));
    let total = 0, continuing = 0;
    for (const visit of unique) {
      if (visit.startTime >= end || visit.endTime <= start) continue;
      total++;
      if (Object.hasOwn(counts, visit.status)) counts[visit.status]++;
      if (visit.startTime < start) continuing++;
    }
    return { date, total, counts, continuing };
  });
}

export function calendarHref(basePath, view, date) {
  return `${basePath}?${new URLSearchParams({ view, date })}`;
}
