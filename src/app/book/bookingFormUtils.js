// app/book/bookingFormUtils.js
import {
  BOOKING_WINDOW_START,
  BOOKING_WINDOW_END,
  timeToMinutes,
} from "./bookingTimeUtils";

export function formatTimeSlots(slotsByDate) {
  if (!slotsByDate) return [];

  return Object.entries(slotsByDate).map(([date, slots]) => ({
    date,
    slots,
  }));
}

export function isValidTimeRange(startTime, endTime) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);

  if (s == null || e == null) {
    return { ok: false, reason: "Invalid time format." };
  }

  if (e <= s) {
    return { ok: false, reason: "End time must be after start time." };
  }

  const ws = timeToMinutes(BOOKING_WINDOW_START);
  const we = timeToMinutes(BOOKING_WINDOW_END);

  if (s < ws || e > we) {
    return {
      ok: false,
      reason: "Bookings are only available between 7:00 AM and 10:00 PM.",
    };
  }

  return { ok: true };
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

export function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export function formatTime12h(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return "—";

  const [hhRaw, mmRaw] = t.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);

  if (Number.isNaN(hh) || Number.isNaN(mm)) return "—";

  const suffix = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  const mm2 = String(mm).padStart(2, "0");

  return `${hour12}:${mm2} ${suffix}`;
}
