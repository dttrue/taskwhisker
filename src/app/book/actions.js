// app/book/actions.js
"use server";

import { prisma } from "@/lib/db";
import { BookingStatus, ServiceType, VisitStatus } from "@prisma/client";
import { z } from "zod";

const publicBookingSchema = z.object({
  operatorId: z.string().min(1, "operatorId is required"),

  serviceType: z.nativeEnum(ServiceType),
  serviceSummary: z.string().min(1, "Service summary is required"),

  basePriceCentsPerVisit: z.number().int().nonnegative().default(0),

  client: z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
  }),

  mode: z.enum(["RANGE", "MULTIPLE"]),

  startDate: z.string().optional(), // "YYYY-MM-DD"
  endDate: z.string().optional(),
  dates: z.array(z.string()).optional(), // ["YYYY-MM-DD", ...]

  startTime: z.string().min(1, "Start time is required"), // "HH:mm"
  endTime: z.string().min(1, "End time is required"),

  notes: z.string().max(1000).optional(),
});

function combineDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

function getDateListFromRange(start, end) {
  const result = [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error("Invalid date range.");
  }

  if (endDate <= startDate) {
    throw new Error("End date must be after start date.");
  }

  const cursor = new Date(startDate);
  while (cursor < endDate) {
    result.push(cursor.toISOString().slice(0, 10)); // "YYYY-MM-DD"
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

async function checkConflictsForOperator(params) {
  const { operatorId, visits } = params;

  for (const v of visits) {
    const conflict = await prisma.visit.findFirst({
      where: {
        operatorId,
        status: {
          not: VisitStatus.CANCELED,
        },
        startTime: {
          lt: v.endTime,
        },
        endTime: {
          gt: v.startTime,
        },
      },
    });

    if (conflict) {
      return {
        hasConflict: true,
        conflictVisitId: conflict.id,
      };
    }
  }

  return {
    hasConflict: false,
    conflictVisitId: null,
  };
}

export async function createPublicBooking(rawInput) {
  const input = publicBookingSchema.parse(rawInput);

  const {
    operatorId,
    serviceType,
    serviceSummary,
    basePriceCentsPerVisit,
    client,
    mode,
    startDate,
    endDate,
    dates,
    startTime,
    endTime,
    notes,
  } = input;

  // 1) Normalize dates
  let dayList = [];

  if (mode === "RANGE") {
    if (!startDate || !endDate) {
      throw new Error("Start and end date are required for range mode.");
    }
    dayList = getDateListFromRange(startDate, endDate);
  } else {
    if (!dates || dates.length === 0) {
      throw new Error("At least one date is required for multiple mode.");
    }
    dayList = dates;
  }

  if (dayList.length === 0) {
    throw new Error("No valid dates selected.");
  }

  // 2) Build visit windows
  const visitWindows = dayList.map((d) => {
    const visitStart = combineDateTime(d, startTime);
    const visitEnd = combineDateTime(d, endTime);

    if (visitEnd <= visitStart) {
      throw new Error("End time must be after start time.");
    }

    return { dateStr: d, startTime: visitStart, endTime: visitEnd };
  });

  // 3) Conflict detection
  const conflictCheck = await checkConflictsForOperator({
    operatorId,
    visits: visitWindows.map((v) => ({
      startTime: v.startTime,
      endTime: v.endTime,
    })),
  });

  if (conflictCheck.hasConflict) {
    return {
      ok: false,
      error: "Requested time conflicts with an existing booking.",
      conflictVisitId: conflictCheck.conflictVisitId,
    };
  }

  // 4) Pricing
  const visitsCount = visitWindows.length;
  const clientTotalCents = basePriceCentsPerVisit * visitsCount;
  const platformFeeCents = Math.round(clientTotalCents * 0.1); // 10% platform fee
  const sitterPayoutCents = clientTotalCents - platformFeeCents;

  // 5) Transaction
  const fullBooking = await prisma.$transaction(async (tx) => {
    const dbClient = await tx.client.upsert({
      where: {
        email: client.email,
      },
      update: {
        name: client.name,
        phone: client.phone,
        addressLine1: client.addressLine1,
        addressLine2: client.addressLine2,
        city: client.city,
        state: client.state,
        postalCode: client.postalCode,
      },
      create: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        addressLine1: client.addressLine1,
        addressLine2: client.addressLine2,
        city: client.city,
        state: client.state,
        postalCode: client.postalCode,
      },
    });

    const earliestStart = visitWindows[0].startTime;
    const latestEnd = visitWindows[visitWindows.length - 1].endTime;

    const booking = await tx.booking.create({
      data: {
        clientId: dbClient.id,
        operatorId,
        sitterId: null,
        startTime: earliestStart,
        endTime: latestEnd,

        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),

        clientTotalCents,
        platformFeeCents,
        sitterPayoutCents,

        serviceSummary,
        serviceType,

        notes: notes || null,
      },
    });

    const visitCreates = visitWindows.map((v) =>
      tx.visit.create({
        data: {
          bookingId: booking.id,
          operatorId,
          sitterId: null,
          date: new Date(`${v.dateStr}T00:00:00`),
          startTime: v.startTime,
          endTime: v.endTime,
          status: VisitStatus.CONFIRMED,
        },
      })
    );

    await Promise.all(visitCreates);

    if (basePriceCentsPerVisit > 0) {
      await tx.bookingLineItem.create({
        data: {
          bookingId: booking.id,
          label: serviceSummary,
          quantity: visitsCount,
          unitPriceCents: basePriceCentsPerVisit,
          totalPriceCents: clientTotalCents,
        },
      });
    }

    await tx.bookingHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: null,
        toStatus: BookingStatus.CONFIRMED,
        changedByUserId: null,
        note: "Booking created by client via public booking link.",
      },
    });

    const result = await tx.booking.findUnique({
      where: { id: booking.id },
      include: {
        client: true,
        lineItems: true,
        visits: true,
      },
    });

    if (!result) {
      throw new Error("Failed to load booking after creation.");
    }

    return result;
  });

  // 6) Response
  return {
    ok: true,
    booking: {
      id: fullBooking.id,
      status: fullBooking.status,
      serviceSummary: fullBooking.serviceSummary,
      serviceType: fullBooking.serviceType,
      client: {
        name: fullBooking.client.name,
        email: fullBooking.client.email,
      },
      money: {
        clientTotalCents: fullBooking.clientTotalCents,
        platformFeeCents: fullBooking.platformFeeCents,
        sitterPayoutCents: fullBooking.sitterPayoutCents,
      },
      visits: fullBooking.visits.map((v) => ({
        id: v.id,
        date: v.date,
        startTime: v.startTime,
        endTime: v.endTime,
        status: v.status,
      })),
      lineItems: fullBooking.lineItems.map((li) => ({
        id: li.id,
        label: li.label,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        totalPriceCents: li.totalPriceCents,
      })),
    },
  };
}