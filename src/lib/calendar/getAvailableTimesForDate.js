// src/lib/calendar/getAvailableTimesForDate.js

import { prisma } from "@/lib/db";

function parseDateInput(dateInput) {
  if (typeof dateInput === "string") {
    const [year, month, day] = dateInput.split("-").map(Number);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    ) {
      return new Date(NaN);
    }

    // New York midnight during EDT (-04:00)
    return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
  }

  if (dateInput instanceof Date) {
    const year = dateInput.getUTCFullYear();
    const month = dateInput.getUTCMonth();
    const day = dateInput.getUTCDate();

    return new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
  }

  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(NaN);
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const day = parsed.getUTCDate();

  return new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
}

function combineDateAndTime(date, hours, minutes = 0) {
  const totalMinutes = hours * 60 + minutes;
  return new Date(date.getTime() + totalMinutes * 60 * 1000);
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDateKeyFromBaseDate(baseDate) {
  const shifted = new Date(baseDate.getTime() - 4 * 60 * 60 * 1000);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function overlapsWithBuffer(
  slotStart,
  slotEnd,
  visitStart,
  visitEnd,
  bufferMinutes
) {
  const bufferedSlotStart = new Date(
    slotStart.getTime() - bufferMinutes * 60 * 1000
  );
  const bufferedSlotEnd = new Date(
    slotEnd.getTime() + bufferMinutes * 60 * 1000
  );

  return visitStart < bufferedSlotEnd && visitEnd > bufferedSlotStart;
}

export async function getAvailableTimesForDate({
  sitterId,
  date,
  durationMinutes = 30,
  bufferMinutes = 15,
  dayStartHour = 7,
  dayEndHour = 22,
  slotIntervalMinutes = 30,
}) {
  if (!sitterId) {
    return { ok: false, error: "missing_sitter" };
  }

  if (!date) {
    return { ok: false, error: "missing_date" };
  }

  const baseDate = parseDateInput(date);

  if (Number.isNaN(baseDate.getTime())) {
    return { ok: false, error: "invalid_date" };
  }

  const dayStart = combineDateAndTime(baseDate, dayStartHour, 0);
  const dayEnd = combineDateAndTime(baseDate, dayEndHour, 0);
  const dateKey = getDateKeyFromBaseDate(baseDate);

  // One DB read for the whole day window.
  const existingVisits = await prisma.visit.findMany({
    where: {
      sitterId,
      status: {
        in: ["CONFIRMED", "PENDING"],
      },
      startTime: {
        lt: dayEnd,
      },
      endTime: {
        gt: dayStart,
      },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
    },
    orderBy: {
      startTime: "asc",
    },
  });

  const normalizedVisits = existingVisits.map((visit) => ({
    ...visit,
    startTime: new Date(visit.startTime),
    endTime: new Date(visit.endTime),
  }));

  const slots = [];

  for (
    let cursor = new Date(dayStart);
    cursor < dayEnd;
    cursor = new Date(cursor.getTime() + slotIntervalMinutes * 60 * 1000)
  ) {
    const startTime = new Date(cursor);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    if (endTime > dayEnd) {
      break;
    }

    const conflicts = normalizedVisits.filter((visit) =>
      overlapsWithBuffer(
        startTime,
        endTime,
        visit.startTime,
        visit.endTime,
        bufferMinutes
      )
    );

    const available = conflicts.length === 0;

    slots.push({
      start: formatTime(startTime),
      end: formatTime(endTime),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      available,
      reason: available ? null : "overlap",
      conflicts: conflicts.map((visit) => ({
        id: visit.id,
        startTime: visit.startTime.toISOString(),
        endTime: visit.endTime.toISOString(),
        status: visit.status,
      })),
    });
  }

  return {
    ok: true,
    date: dateKey,
    durationMinutes,
    bufferMinutes,
    slots,
  };
}
