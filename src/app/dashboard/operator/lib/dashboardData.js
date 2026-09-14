import { economicsSelect, aggregateBookingAmounts, economicsInclude } from "@/lib/bookings/economics/bookingEconomics";
// src/app/dashboard/operator/lib/dashboardData.js
import { prisma } from "@/lib/db";
import { buildDateWhere } from "./dashboardQuery";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";

function serializeBookingForMap(booking) {
  return {
    id: booking.id,
    clientName: booking.client?.name ?? "—",
    serviceSummary: booking.serviceSummary ?? "—",
    petDisplayName: formatBookingPetNames(
      booking.petNames,
      booking.serviceSummary || "Pet care booking"
    ),
    status: booking.status,
    startTime:
      booking.startTime instanceof Date
        ? booking.startTime.toISOString()
        : booking.startTime,

    lat: booking.serviceLat != null ? Number(booking.serviceLat) : null,
    lng: booking.serviceLng != null ? Number(booking.serviceLng) : null,

    address: [
      booking.serviceAddressLine1,
      booking.serviceCity,
      booking.serviceState,
    ]
      .filter(Boolean)
      .join(", "),

    sitterName: booking.sitter?.name || booking.sitter?.email || "Unassigned",
  };
}

export function normalizeMetrics(bookings) {
  return Object.fromEntries(["ALL", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELED"].map((status) => {
    const rows = status === "ALL" ? bookings : bookings.filter((b) => b.status === status);
    const amounts = aggregateBookingAmounts(rows);
    return [status, { count: rows.length, revenueCents: amounts.totalCents, ...amounts }];
  }));
}

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

export async function getOperatorDashboardData({
  operatorId,
  status,
  from,
  to,
}) {
  const dateWhere = buildDateWhere({ from, to });

  const where = {
    ...(operatorId ? { operatorId } : {}),
    ...dateWhere,
    ...(status && status !== "ALL" ? { status } : {}),
  };

  console.log("OP DASH final where:", JSON.stringify(where, null, 2));

  const [bookings, grouped] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        ...economicsInclude,
        client: true,
        sitter: true,
        lineItems: true,
        visits: {
          orderBy: { startTime: "asc" },
        },
      },
      orderBy: { startTime: "asc" },
      take: 50,
    }),
    prisma.booking.findMany({
      where: {
        ...(operatorId ? { operatorId } : {}),
        ...dateWhere,
      },
      select: { status: true, ...economicsSelect },
    }),
  ]);

  console.log("OP DASH bookings count:", bookings.length);

  return {
    bookings: toClientValue(bookings),
    metrics: normalizeMetrics(grouped),
    mapBookings: bookings.map(serializeBookingForMap),
  };
}
