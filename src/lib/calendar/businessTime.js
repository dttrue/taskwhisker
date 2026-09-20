import { BUSINESS_TIME_ZONE } from "../visits/visitOperations.js";
export { BUSINESS_TIME_ZONE };
function reject(code, message) { const error = new Error(message); error.code = code; throw error; }
export function dateNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) reject("INVALID_SCHEDULE", "Expected a calendar date YYYY-MM-DD.");
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value || +value.slice(0, 4) < 2000) reject("INVALID_SCHEDULE", "Invalid calendar date.");
  return n;
}
export function timeMinutes(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) reject("INVALID_SCHEDULE", "Expected local time HH:MM.");
  return +value.slice(0, 2) * 60 + +value.slice(3);
}
const wallFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function wallNumber(instant) {
  const p = Object.fromEntries(wallFormatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
// Enumerate nearby IANA offsets and round-trip every candidate. Zero matches is
// a DST gap; two matches is a fold. Neither is silently shifted or disambiguated.
export function businessWallTime(date, time) {
  const wall = dateNumber(date) + timeMinutes(time) * 60_000;
  const offsets = new Set([-36, -12, 0, 12, 36].map((h) => {
    const instant = wall + h * 3_600_000;
    return wallNumber(new Date(instant)) - instant;
  }));
  const matches = [...offsets].map((offset) => wall - offset).filter((n) => wallNumber(new Date(n)) === wall);
  if (matches.length !== 1) reject("INVALID_LOCAL_TIME", "Local time is nonexistent or ambiguous in the business timezone.");
  return new Date(matches[0]);
}

export function businessDateKey(value = new Date()) {
  const parts = Object.fromEntries(wallFormatter.formatToParts(value).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function addCalendarDays(date, count) {
  return new Date(dateNumber(date) + count * 86400000).toISOString().slice(0, 10);
}
export function formatBusinessTime(value) {
  return new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
export function formatBusinessDate(value) {
  return new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
