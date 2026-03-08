// app/book/actions.js
"use server";

import { prisma } from "@/lib/db";
import { BookingStatus, VisitStatus } from "@prisma/client";
import { z } from "zod";

const BOOKING_WINDOW_START = "07:00";
const BOOKING_WINDOW_END = "22:00";

function timeToMinutes(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function assertValidTimeRange(startTime, endTime, context = "") {
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
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

async function checkConflictsForOperator({ operatorId, visits }) {
  for (const v of visits) {
    const conflict = await prisma.visit.findFirst({
      where: {
        operatorId,
        status: { not: VisitStatus.CANCELED },
        startTime: { lt: v.endTime },
        endTime: { gt: v.startTime },
      },
    });

    if (conflict) {
      return { hasConflict: true, conflictVisitId: conflict.id };
    }
  }

  return { hasConflict: false, conflictVisitId: null };
}

const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM (24h)");

const slotSchema = z.object({
  startTime: timeStr,
  endTime: timeStr,
});

const addOnSchema = z.object({
  code: z.string().min(1, "Add-on code is required"),
  appliesTo: z.enum(["ONCE", "EACH_VISIT"]).optional().default("ONCE"),
  quantity: z.number().int().positive().optional().default(1),
  smallDogs: z.number().int().nonnegative().optional(),
  largeDogs: z.number().int().nonnegative().optional(),
});

const publicBookingSchema = z
  .object({
    serviceType: z.string().optional(),
    serviceCode: z.string().min(1, "Service code is required"),
    serviceSummary: z.string().optional(),
    basePriceCentsPerVisit: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .default(0),

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

    scheduleMode: z.enum(["SAME", "CUSTOM"]).optional().default("SAME"),

    startTime: timeStr.optional(),
    endTime: timeStr.optional(),

    slotsByDate: z
      .record(z.string(), z.array(slotSchema))
      .optional()
      .default({}),

    addOns: z.array(addOnSchema).optional().default([]),

    notes: z.string().max(1000).optional(),
  })
  .superRefine((val, ctx) => {
    const isOvernight = val.serviceType === "OVERNIGHT";

    if (val.mode === "RANGE") {
      if (!val.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startDate is required for RANGE mode.",
          path: ["startDate"],
        });
      }

      if (!val.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endDate is required for RANGE mode.",
          path: ["endDate"],
        });
      }
    } else {
      if (!val.dates || val.dates.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one date is required for MULTIPLE mode.",
          path: ["dates"],
        });
      }
    }

    if (isOvernight && val.scheduleMode === "CUSTOM") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Overnight bookings cannot use custom per-date time slots.",
        path: ["scheduleMode"],
      });
    }

    if (val.scheduleMode === "SAME") {
      if (!val.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startTime is required when scheduleMode is SAME.",
          path: ["startTime"],
        });
      }

      if (!val.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endTime is required when scheduleMode is SAME.",
          path: ["endTime"],
        });
      }
    }

    if (val.scheduleMode === "CUSTOM") {
      const totalSlots = Object.values(val.slotsByDate || {}).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0
      );

      if (totalSlots === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please add at least one time slot.",
          path: ["slotsByDate"],
        });
      }

      for (const [dateStr, slots] of Object.entries(val.slotsByDate || {})) {
        if (!Array.isArray(slots)) continue;

        slots.forEach((slot, i) => {
          if (slot.endTime <= slot.startTime) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid slot on ${dateStr}: endTime must be after startTime.`,
              path: ["slotsByDate", dateStr, i, "endTime"],
            });
          }
        });
      }
    }
  });

export async function createPublicBooking(rawInput) {
  const input = publicBookingSchema.parse(rawInput);

  const operator = await prisma.user.findFirst({
    where: { email: "therainbowniche@gmail.com" },
  });

  if (!operator) {
    throw new Error("Operator user not found in DB. Check your seed data.");
  }

  const operatorId = operator.id;

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
    scheduleMode,
    startTime,
    endTime,
    slotsByDate,
    notes,
    addOns = [],
  } = input;

  // Normalize date list
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

  if (!dayList.length) {
    throw new Error("No valid dates selected.");
  }

  // Service lookup
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
  const effectiveServiceType = serviceType || service.category;

  // Build visit windows
  let visitWindows = [];

  const isOvernight = effectiveServiceType === "OVERNIGHT";
  const effectiveScheduleMode = isOvernight ? "SAME" : scheduleMode || "SAME";

  if (effectiveScheduleMode === "SAME") {
    if (!startTime || !endTime) {
      throw new Error("Start time and end time are required.");
    }

    assertValidTimeRange(startTime, endTime);

    visitWindows = dayList.map((d) => {
      const visitStart = combineDateTime(d, startTime);
      const visitEnd = combineDateTime(d, endTime);

      return {
        dateStr: d,
        startTime: visitStart,
        endTime: visitEnd,
      };
    });
  } else {
    if (!slotsByDate) {
      throw new Error("slotsByDate is required for CUSTOM schedule mode.");
    }

    for (const d of dayList) {
      const slots = slotsByDate[d];

      if (!slots || !slots.length) {
        throw new Error(`At least one time slot is required for ${d}.`);
      }

      for (const s of slots) {
        assertValidTimeRange(s.startTime, s.endTime, `${d}: `);

        visitWindows.push({
          dateStr: d,
          startTime: combineDateTime(d, s.startTime),
          endTime: combineDateTime(d, s.endTime),
        });
      }
    }
  }

  // Conflict detection
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

  // Pricing
  const visitsCount = visitWindows.length;
  const baseServiceTotalCents = pricePerVisitCents * visitsCount;

  const submittedAddOns = Array.isArray(addOns) ? addOns : [];
  const selectedAddOnCodes = submittedAddOns
    .map((addOn) => addOn?.code)
    .filter(Boolean);

  const dbAddOnServices =
    selectedAddOnCodes.length > 0
      ? await prisma.service.findMany({
          where: {
            code: { in: selectedAddOnCodes },
            category: "EXTRA",
            isActive: true,
          },
        })
      : [];

  const addOnByCode = new Map(dbAddOnServices.map((item) => [item.code, item]));

  const resolvedAddOns = submittedAddOns.map((submitted) => {
    const dbAddOn = addOnByCode.get(submitted.code);

    if (!dbAddOn) {
      throw new Error(`Selected add-on is not available: ${submitted.code}`);
    }

    const quantity =
      typeof submitted.quantity === "number" && submitted.quantity > 0
        ? submitted.quantity
        : 1;

    return {
      code: dbAddOn.code,
      name: dbAddOn.name,
      priceCents: dbAddOn.basePriceCents,
      quantity,
      totalPriceCents: dbAddOn.basePriceCents * quantity,
      appliesTo: submitted.appliesTo || "ONCE",
      smallDogs: submitted.smallDogs ?? null,
      largeDogs: submitted.largeDogs ?? null,
    };
  });

  const addOnTotalCents = resolvedAddOns.reduce(
    (sum, addOn) => sum + addOn.totalPriceCents,
    0
  );

  const clientTotalCents = baseServiceTotalCents + addOnTotalCents;
  const platformFeeCents = Math.round(clientTotalCents * 0.1);
  const sitterPayoutCents = clientTotalCents - platformFeeCents;

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

    // Booking window = earliest start to latest end across all visits
    const sorted = [...visitWindows].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );

    const earliestStart = sorted[0].startTime;
    const latestEnd = sorted.reduce(
      (max, v) => (v.endTime > max ? v.endTime : max),
      sorted[0].endTime
    );

    const booking = await tx.booking.create({
      data: {
        client: { connect: { id: dbClient.id } },
        operator: { connect: { id: operatorId } },

        startTime: earliestStart,
        endTime: latestEnd,

        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),

        clientTotalCents,
        platformFeeCents,
        sitterPayoutCents,

        service: { connect: { id: service.id } },
        serviceSummary: effectiveSummary,
        serviceType: effectiveServiceType,

        notes: notes || null,
      },
    });

    // Build line items
        const lineItemsToCreate = [];

        if (pricePerVisitCents > 0) {
          lineItemsToCreate.push({
            bookingId: booking.id,
            label: effectiveSummary,
            quantity: visitsCount,
            unitPriceCents: pricePerVisitCents,
            totalPriceCents: baseServiceTotalCents,
          });
        }

        for (const addOn of resolvedAddOns) {
          lineItemsToCreate.push({
            bookingId: booking.id,
            label: addOn.name,
            quantity: addOn.quantity,
            unitPriceCents: addOn.priceCents,
            totalPriceCents: addOn.totalPriceCents,
          });
        }

        if (lineItemsToCreate.length > 0) {
          await tx.bookingLineItem.createMany({
            data: lineItemsToCreate,
          });
        }

    // Visits
    await Promise.all(
      visitWindows.map((v) =>
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
      )
    );

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