// src/app/book/validatePublicBookingStep.js
import { isValidTimeRange, overlaps } from "./bookingFormUtils";
import { timeToMinutes } from "./bookingTimeUtils";

function formatDateLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toDateString();
}

function buildDateTime(dateStr, timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);

  // Force UTC construction
  const [year, month, day] = dateStr.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
}
export function validateScheduleStep({
  isRange,
  range,
  dates,
  scheduleMode,
  times,
  selectedDateStrs,
  slotsByDate,
}) {
  if (isRange) {
    if (!range?.from || !range?.to) {
      return "Please select a valid check-in and check-out range.";
    }
  } else if (!dates?.length) {
    return "Please select at least one date.";
  }

  if (isRange || scheduleMode === "SAME") {
    if (!times?.startTime) return "Start time is required.";
    if (!times?.endTime) return "End time is required.";

    const check = isValidTimeRange(times.startTime, times.endTime);
    if (!check.ok) return check.reason;

    return null;
  }

  if (!selectedDateStrs?.length) {
    return "Please select at least one date.";
  }

  for (const dateStr of selectedDateStrs) {
    const slots = slotsByDate?.[dateStr] || [];

    if (!slots.length) {
      return `Please add at least one time slot for ${formatDateLabel(
        dateStr
      )}.`;
    }

    for (const slot of slots) {
      if (!slot.startTime || !slot.endTime) {
        return `Missing start/end time on ${formatDateLabel(dateStr)}.`;
      }

      const check = isValidTimeRange(slot.startTime, slot.endTime);
      if (!check.ok) {
        return `${formatDateLabel(dateStr)}: ${check.reason}`;
      }
    }

    const sorted = slots
      .map((slot) => ({
        s: timeToMinutes(slot.startTime),
        e: timeToMinutes(slot.endTime),
      }))
      .sort((a, b) => a.s - b.s);

    for (let i = 1; i < sorted.length; i++) {
      if (
        overlaps(sorted[i - 1].s, sorted[i - 1].e, sorted[i].s, sorted[i].e)
      ) {
        return `Two time slots overlap on ${formatDateLabel(dateStr)}.`;
      }
    }
  }

  return null;
}

async function fetchSlotsForDate({
  sitterId,
  dateStr,
  durationMinutes = 30,
  bufferMinutes = 15,
}) {
  const params = new URLSearchParams({
    sitterId,
    date: dateStr,
    durationMinutes: String(durationMinutes),
    bufferMinutes: String(bufferMinutes),
  });

  const res = await fetch(`/api/availability/slots?${params.toString()}`);
  const data = await res.json();

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Failed to re-check availability.");
  }

  return Array.isArray(data.slots) ? data.slots : [];
}

function isoToHHMM(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function findMatchingSlot(slots, startTime, endTime) {
  return (
    slots.find((slot) => {
      const slotStart = isoToHHMM(slot.startTime);
      const slotEnd = isoToHHMM(slot.endTime);

      return slotStart === startTime && slotEnd === endTime;
    }) || null
  );
}

export async function validateScheduleAvailabilityStep({
  sitterId,
  isRange,
  scheduleMode,
  selectedDateStrs,
  times,
  slotsByDate,
  durationMinutes = 30,
  bufferMinutes = 15,
}) {
  if (!sitterId) {
    return "Scheduler is not configured correctly. Missing sitter ID.";
  }

  // Overnight can stay on the existing path for now.
  if (isRange) {
    return null;
  }

  if (scheduleMode === "SAME") {
    if (!selectedDateStrs?.length || selectedDateStrs.length !== 1) {
      return "Please select exactly one date.";
    }

    if (!times?.startTime || !times?.endTime) {
      return "Please select an available time slot.";
    }

    const dateStr = selectedDateStrs[0];
    const slots = await fetchSlotsForDate({
      sitterId,
      dateStr,
      durationMinutes,
      bufferMinutes,
    });

    const match = findMatchingSlot(slots, times.startTime, times.endTime);

    if (!match || !match.available) {
      return "That time is no longer available. Please choose another time.";
    }

    const selectedStart = buildDateTime(dateStr, times.startTime);
    if (selectedStart < new Date()) {
      return "That time has already passed. Please choose a future time.";
    }

    return null;
  }

  for (const dateStr of selectedDateStrs || []) {
    const requestedSlots = slotsByDate?.[dateStr] || [];

    if (!requestedSlots.length) {
      return `Please add at least one time slot for ${formatDateLabel(
        dateStr
      )}.`;
    }

    const slots = await fetchSlotsForDate({
      sitterId,
      dateStr,
      durationMinutes,
      bufferMinutes,
    });

    for (const requested of requestedSlots) {
      const match = findMatchingSlot(
        slots,
        requested.startTime,
        requested.endTime
      );

      if (!match || !match.available) {
        return `One or more selected times on ${formatDateLabel(
          dateStr
        )} are no longer available. Please choose another time.`;
      }

      const selectedStart = buildDateTime(dateStr, requested.startTime);
      if (selectedStart < new Date()) {
        return `${formatDateLabel(
          dateStr
        )}: one or more selected times have already passed.`;
      }
    }
  }

  return null;
}

export function validateAddOnsStep({ addOns, nailTrimExtra, bathExtra }) {
  if (addOns?.nailTrim?.enabled && !nailTrimExtra) {
    return "Nail trim is not available for this service.";
  }

  if (addOns?.bath?.enabled) {
    if (!bathExtra) {
      return "Bath is not available for this service.";
    }

    const totalDogs =
      (addOns.bath.smallDogs || 0) + (addOns.bath.largeDogs || 0);

    if (totalDogs === 0) {
      return "For Bath, please enter at least 1 dog (small or large).";
    }
  }

  return null;
}

export function validateClientInfoStep({ client, serviceLocation }) {
  if (!client?.name?.trim()) return "Name is required.";
  if (!client?.email?.trim()) return "Email is required.";
  if (!serviceLocation?.addressLine1?.trim()) {
    return "Service address is required.";
  }
  if (!serviceLocation?.city?.trim()) return "Service city is required.";
  if (!serviceLocation?.state?.trim()) return "Service state is required.";
  if (!serviceLocation?.postalCode?.trim()) {
    return "Service postal code is required.";
  }
  return null;
}
