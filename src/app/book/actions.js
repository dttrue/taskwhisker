// app/book/actions.js
"use server";

import { prisma } from "@/lib/db";
import { BookingStatus, VisitStatus } from "@prisma/client";

import { publicBookingSchema } from "./bookingSchemas";
import { assertValidTimeRange } from "./bookingTimeUtils";
import { combineDateTime, getDateListFromRange } from "./bookingDateUtils";
import { checkConflictsForOperator } from "./bookingConflictUtils";
import { checkAvailability } from "@/lib/calendar/checkAvailability";
import { formatServiceAddress } from "@/lib/formatAddress";
import { geocodeAddress } from "@/lib/geocodeAddress";

const BUFFER_MINUTES = 15;



function toClientValue(value) {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map(toClientValue);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if (typeof value.toNumber === "function") {
      return value.toNumber();
    }

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = toClientValue(val);
    }
    return out;
  }

  return value;
}

export async function getPublicServices() {
  return prisma.service.findMany({
    where: {
      isActive: true,
      category: {
        in: ["DROP_IN", "WALK", "OVERNIGHT"],
      },
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getPublicExtras() {
  return prisma.service.findMany({
    where: {
      isActive: true,
      category: "EXTRA",
    },
    orderBy: [{ species: "asc" }, { name: "asc" }],
  });
}

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

    serviceAddressLine1,
    serviceAddressLine2,
    serviceCity,
    serviceState,
    servicePostalCode,
    serviceCountry,
    serviceLat,
    serviceLng,
    accessInstructions,
    locationNotes,

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

  // Real availability enforcement using the same engine that powers slot blocking.
  // For now, public bookings are checked against the operator's schedule.
  for (const v of visitWindows) {
    const availability = await checkAvailability({
      sitterId: operatorId,
      startTime: v.startTime,
      endTime: v.endTime,
      bufferMinutes: BUFFER_MINUTES,
    });

    if (!availability.valid) {
      return {
        ok: false,
        error: "Selected time slot is no longer available.",
        reason: availability.reason || null,
        conflicts: (availability.conflicts || []).map((conflict) => ({
          id: conflict.id,
          startTime: conflict.startTime,
          endTime: conflict.endTime,
          status: conflict.status,
        })),
      };
    }
  }

  // Keep the operator conflict check as an additional safeguard.
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

  const normalizedClientAddress = {
    addressLine1: client.addressLine1?.trim() || null,
    addressLine2: client.addressLine2?.trim() || null,
    city: client.city?.trim() || null,
    state: client.state?.trim() || null,
    postalCode: client.postalCode?.trim() || null,
  };

  const bookingServiceAddress = {
    serviceAddressLine1:
      serviceAddressLine1 ?? normalizedClientAddress.addressLine1,
    serviceAddressLine2:
      serviceAddressLine2 ?? normalizedClientAddress.addressLine2,
    serviceCity: serviceCity ?? normalizedClientAddress.city,
    serviceState: serviceState ?? normalizedClientAddress.state,
    servicePostalCode: servicePostalCode ?? normalizedClientAddress.postalCode,
    serviceCountry: serviceCountry ?? "US",
    serviceLat: serviceLat ?? null,
    serviceLng: serviceLng ?? null,
    accessInstructions: accessInstructions ?? null,
    locationNotes: locationNotes ?? null,
  };

  const formattedServiceAddress = formatServiceAddress({
    addressLine1: bookingServiceAddress.serviceAddressLine1,
    addressLine2: bookingServiceAddress.serviceAddressLine2,
    city: bookingServiceAddress.serviceCity,
    state: bookingServiceAddress.serviceState,
    postalCode: bookingServiceAddress.servicePostalCode,
  });

  let geocodedLat = bookingServiceAddress.serviceLat;
  let geocodedLng = bookingServiceAddress.serviceLng;

  if (geocodedLat == null && geocodedLng == null && formattedServiceAddress) {
    try {
      const coords = await geocodeAddress(formattedServiceAddress);

      if (coords) {
        geocodedLat = coords.lat;
        geocodedLng = coords.lng;
      }
    } catch (error) {
      console.error("Geocoding failed during booking creation:", error);
    }
  }

  const fullBooking = await prisma.$transaction(async (tx) => {
    const dbClient = await tx.client.upsert({
      where: { email: client.email },
      update: {
        name: client.name,
        phone: client.phone?.trim() || null,
        addressLine1: normalizedClientAddress.addressLine1,
        addressLine2: normalizedClientAddress.addressLine2,
        city: normalizedClientAddress.city,
        state: normalizedClientAddress.state,
        postalCode: normalizedClientAddress.postalCode,
      },
      create: {
        name: client.name,
        email: client.email,
        phone: client.phone?.trim() || null,
        addressLine1: normalizedClientAddress.addressLine1,
        addressLine2: normalizedClientAddress.addressLine2,
        city: normalizedClientAddress.city,
        state: normalizedClientAddress.state,
        postalCode: normalizedClientAddress.postalCode,
      },
    });

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

        serviceAddressLine1: bookingServiceAddress.serviceAddressLine1,
        serviceAddressLine2: bookingServiceAddress.serviceAddressLine2,
        serviceCity: bookingServiceAddress.serviceCity,
        serviceState: bookingServiceAddress.serviceState,
        servicePostalCode: bookingServiceAddress.servicePostalCode,
        serviceCountry: bookingServiceAddress.serviceCountry,
        serviceLat: geocodedLat,
        serviceLng: geocodedLng,
        accessInstructions: bookingServiceAddress.accessInstructions,
        locationNotes: bookingServiceAddress.locationNotes,

        notes: notes || null,
      },
    });

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

  return toClientValue({
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
      location: {
        serviceAddressLine1: fullBooking.serviceAddressLine1,
        serviceAddressLine2: fullBooking.serviceAddressLine2,
        serviceCity: fullBooking.serviceCity,
        serviceState: fullBooking.serviceState,
        servicePostalCode: fullBooking.servicePostalCode,
        serviceCountry: fullBooking.serviceCountry,
        serviceLat: fullBooking.serviceLat,
        serviceLng: fullBooking.serviceLng,
        accessInstructions: fullBooking.accessInstructions,
        locationNotes: fullBooking.locationNotes,
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
  });
}
