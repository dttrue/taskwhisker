// app/book/actions.js
"use server";

import { prisma } from "@/lib/db";
import { BookingStatus, ServiceType, VisitStatus } from "@prisma/client";
import { z } from "zod";

const publicBookingSchema = z.object({
  // operatorId now decided on the server
  serviceType: z.string().optional(),

  serviceCode: z.string().min(1, "Service code is required"),
  serviceSummary: z.string().optional(),

  basePriceCentsPerVisit: z.number().int().nonnegative().optional().default(0),

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
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dates: z.array(z.string()).optional(),

  startTime: z.string().min(1, "Start time is required"),
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

/**
 * 🔍 Public services for the booking form
 * (pulled from DB instead of hard-coding)
 */
export async function getPublicServices() {
  const services = await prisma.service.findMany({
    orderBy: [{ species: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  return services.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    species: s.species,
    category: s.category,
    serviceType: s.serviceType,
    basePriceCents: s.basePriceCents,
  }));
}

export async function createPublicBooking(rawInput) {
  const input = publicBookingSchema.parse(rawInput);

  const operator = await prisma.user.findFirst({
    where: { email: "therainbowniche@gmail.com" }, // Bridget
  });

  if (!operator) {
    throw new Error("Operator user not found in DB. Check your seed data.");
  }

  const operatorId = operator.id;
  console.log("📌 Using operatorId:", operatorId);

  const {
    serviceType,
    serviceCode,
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

  // 1.5) Look up service pricing from DB
  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
  });

  if (!service) {
    throw new Error("Selected service is not available.");
  }

  const pricePerVisitCents =
    typeof basePriceCentsPerVisit === "number" && basePriceCentsPerVisit > 0
      ? basePriceCentsPerVisit
      : service.basePriceCents;

  const effectiveSummary = serviceSummary || service.name;
  const effectiveServiceType = serviceType || service.serviceType;

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
  const clientTotalCents = pricePerVisitCents * visitsCount;
  const platformFeeCents = Math.round(clientTotalCents * 0.1); // 10% platform fee
  const sitterPayoutCents = clientTotalCents - platformFeeCents;

  // 5) Transaction
  const fullBooking = await prisma.$transaction(async (tx) => {
    const dbClient = await tx.client.upsert({
      where: { email: client.email },
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
        client: {
          connect: { id: dbClient.id },
        },

        operator: {
          connect: { id: operatorId },
        },

        startTime: earliestStart,
        endTime: latestEnd,

        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),

        clientTotalCents,
        platformFeeCents,
        sitterPayoutCents,

        // 🔹 service fields
        service: {
          connect: { id: service.id },
        },
        serviceSummary: effectiveSummary,
        serviceType: effectiveServiceType,

        notes: notes || null,
      },
    });

    // line item (so operator sees proper breakdown)
    if (pricePerVisitCents > 0) {
      await tx.bookingLineItem.create({
        data: {
          bookingId: booking.id,
          label: effectiveSummary,
          quantity: visitsCount,
          unitPriceCents: pricePerVisitCents,
          totalPriceCents: clientTotalCents,
        },
      });
    }

    // visits
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

    // history
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
