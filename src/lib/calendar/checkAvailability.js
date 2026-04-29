// src/lib/calendar/checkAvailability.js
import { prisma } from "@/lib/db";

function toDate(value) {
  return value instanceof Date ? new Date(value) : new Date(value);
}

export async function checkAvailability({
  sitterId,
  startTime,
  endTime,
  bufferMinutes = 15,
}) {
  if (!sitterId) return { valid: false, reason: "missing_sitter" };
  if (!startTime || !endTime) {
    return { valid: false, reason: "invalid_time_range" };
  }

  const requestedStart = toDate(startTime);
  const requestedEnd = toDate(endTime);

  if (
    Number.isNaN(requestedStart.getTime()) ||
    Number.isNaN(requestedEnd.getTime())
  ) {
    return { valid: false, reason: "invalid_time_range" };
  }

  if (requestedStart >= requestedEnd) {
    return { valid: false, reason: "start_after_end" };
  }

  const bufferedStart = new Date(requestedStart);
  bufferedStart.setMinutes(bufferedStart.getMinutes() - bufferMinutes);

  const bufferedEnd = new Date(requestedEnd);
  bufferedEnd.setMinutes(bufferedEnd.getMinutes() + bufferMinutes);

  const conflictingVisits = await prisma.visit.findMany({
    where: {
      sitterId,
      status: {
        in: ["CONFIRMED", "PENDING"],
      },
      startTime: {
        lt: bufferedEnd,
      },
      endTime: {
        gt: bufferedStart,
      },
    },
    select: {
      id: true,
      sitterId: true,
      status: true,
      date: true,
      startTime: true,
      endTime: true,
    },
    orderBy: {
      startTime: "asc",
    },
  });

  if (conflictingVisits.length > 0) {
    return {
      valid: false,
      reason: "overlap",
      conflicts: conflictingVisits,
    };
  }

  return { valid: true };
}
