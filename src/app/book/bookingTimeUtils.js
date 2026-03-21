// app/book/bookingTimeUtils.js

export const BOOKING_WINDOW_START = "07:00";
export const BOOKING_WINDOW_END = "22:00";

export function timeToMinutes(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return null;

  const [hh, mm] = t.split(":").map(Number);

  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  return hh * 60 + mm;
}

export function assertValidTimeRange(startTime, endTime, context = "") {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);

  if (s == null || e == null) {
    throw new Error(`${context}Invalid time format.`);
  }

  if (e <= s) {
    throw new Error(`${context}End time must be after start time.`);
  }

  const ws = timeToMinutes(BOOKING_WINDOW_START);
  const we = timeToMinutes(BOOKING_WINDOW_END);

  if (s < ws || e > we) {
    throw new Error(
      `${context}Bookings are only available between 7:00 AM and 10:00 PM.`
    );
  }
}
