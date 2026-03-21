// src/app/book/validatePublicBookingStep.js
import { isValidTimeRange, overlaps } from "./bookingFormUtils";
import { timeToMinutes } from "./bookingTimeUtils";


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
      return `Please add at least one time slot for ${new Date(
        `${dateStr}T00:00:00`
      ).toDateString()}.`;
    }

    for (const slot of slots) {
      if (!slot.startTime || !slot.endTime) {
        return `Missing start/end time on ${new Date(
          `${dateStr}T00:00:00`
        ).toDateString()}.`;
      }

      const check = isValidTimeRange(slot.startTime, slot.endTime);
      if (!check.ok) {
        return `${new Date(`${dateStr}T00:00:00`).toDateString()}: ${
          check.reason
        }`;
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
        return `Two time slots overlap on ${new Date(
          `${dateStr}T00:00:00`
        ).toDateString()}.`;
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
  if (!serviceLocation?.addressLine1?.trim())
    return "Service address is required.";
  if (!serviceLocation?.city?.trim()) return "Service city is required.";
  if (!serviceLocation?.state?.trim()) return "Service state is required.";
  if (!serviceLocation?.postalCode?.trim())
    return "Service postal code is required.";
  return null;
}
