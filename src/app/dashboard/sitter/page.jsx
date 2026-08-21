// src/app/dashboard/sitter/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import SitterDashboardLive from "./_components/SitterDashboardLive";
import {
  hasOpenCancellationRequest,
  serializeVisitEntry,
} from "./lib/sitterDashboardUtils";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";
import {
  getBusinessDateParts,
  getBusinessDayStart,
} from "@/lib/visits/visitOperations";

const VISIT_PAGE_SIZE = 10;

function parsePage(value) {
  const normalized = String(value ?? "1");
  if (!/^\d+$/.test(normalized)) return 1;

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SitterDashboardPage({ searchParams }) {
  const session = await requireRole(["SITTER"]);
  const userId = session.user?.id;
  const params = await Promise.resolve(searchParams);
  const now = new Date();
  const businessDate = getBusinessDateParts(now);
  const todayStartsAt = getBusinessDayStart(now);
  const upcomingStartsAt = getBusinessDayStart(now, 1);
  const businessWeekday = new Date(
    Date.UTC(businessDate.year, businessDate.month - 1, businessDate.day)
  ).getUTCDay();
  const weekStartsAt = getBusinessDayStart(now, -businessWeekday);

  if (!userId) {
    throw new Error("Missing user id in session for sitter.");
  }

  const [
    bookings,
    upcomingVisitTotal,
    completedVisitTotal,
    completedMetricVisits,
  ] = await Promise.all([
    prisma.booking.findMany({
      where: {
        sitterId: userId,
        status: { not: "COMPLETED" },
      },
      orderBy: { startTime: "asc" },
      include: {
        client: true,
        visits: {
          orderBy: { startTime: "asc" },
        },
        conversation: {
          include: {
            messages: {
              orderBy: {
                createdAt: "desc",
              },
              take: 20,
            },
          },
        },
      },
    }),
    prisma.visit.count({
      where: {
        sitterId: userId,
        status: { notIn: ["COMPLETED", "CANCELED"] },
        startTime: { gte: upcomingStartsAt },
        booking: { status: { notIn: ["COMPLETED", "CANCELED"] } },
      },
    }),
    prisma.visit.count({
      where: {
        sitterId: userId,
        status: "COMPLETED",
      },
    }),
    prisma.visit.findMany({
      where: {
        sitterId: userId,
        status: "COMPLETED",
        completedAt: {
          gte: weekStartsAt,
          lt: upcomingStartsAt,
        },
      },
      select: {
        id: true,
        completedAt: true,
        booking: {
          select: {
            sitterPayoutCents: true,
            _count: { select: { visits: true } },
          },
        },
      },
    }),
  ]);

  const completedThisWeek = completedMetricVisits.length;
  const acknowledgedCompletedVisitIds = completedMetricVisits.map(
    (visit) => visit.id
  );
  const earnedTodayCents = completedMetricVisits.reduce((total, visit) => {
    if (!visit.completedAt || visit.completedAt < todayStartsAt) return total;

    const totalVisits = visit.booking._count.visits || 1;
    return (
      total + Math.round((visit.booking.sitterPayoutCents || 0) / totalVisits)
    );
  }, 0);

  const upcomingPageCount = Math.max(
    1,
    Math.ceil(upcomingVisitTotal / VISIT_PAGE_SIZE)
  );
  const upcomingPage = Math.min(
    parsePage(params?.upcomingPage),
    upcomingPageCount
  );

  const completedPageCount = Math.max(
    1,
    Math.ceil(completedVisitTotal / VISIT_PAGE_SIZE)
  );
  const completedPage = Math.min(
    parsePage(params?.completedPage),
    completedPageCount
  );

  const visitInclude = {
    booking: {
      include: {
        client: true,
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        },
        _count: {
          select: { visits: true },
        },
      },
    },
  };

  const [upcomingVisits, completedVisits] = await Promise.all([
    prisma.visit.findMany({
      where: {
        sitterId: userId,
        status: { notIn: ["COMPLETED", "CANCELED"] },
        startTime: { gte: upcomingStartsAt },
        booking: { status: { notIn: ["COMPLETED", "CANCELED"] } },
      },
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
      skip: (upcomingPage - 1) * VISIT_PAGE_SIZE,
      take: VISIT_PAGE_SIZE,
      include: visitInclude,
    }),
    prisma.visit.findMany({
      where: {
        sitterId: userId,
        status: "COMPLETED",
      },
      orderBy: [
        { completedAt: { sort: "desc", nulls: "last" } },
        { endTime: "desc" },
        { id: "desc" },
      ],
      skip: (completedPage - 1) * VISIT_PAGE_SIZE,
      take: VISIT_PAGE_SIZE,
      include: visitInclude,
    }),
  ]);

  function serializeForClient(value) {
    if (value === null || value === undefined) return value;

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(serializeForClient);
    }

    if (typeof value === "object") {
      // Prisma Decimal
      if (typeof value.toNumber === "function") {
        return value.toNumber();
      }

      const output = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        output[key] = serializeForClient(nestedValue);
      }
      return output;
    }

    return value;
  }

  const serializedBookings = serializeForClient(bookings);
  function toVisitEntry(visit) {
    const booking = visit.booking;
    const totalVisits = booking._count.visits || 1;
    const address = [
      booking.serviceAddressLine1,
      booking.serviceAddressLine2,
      booking.serviceCity,
      booking.serviceState,
      booking.servicePostalCode,
    ]
      .filter(Boolean)
      .join(", ");

    return serializeVisitEntry({
      id: visit.id,
      visit,
      bookingId: booking.id,
      bookingStatus: booking.status,
      clientName: booking.client?.name || "Client",
      serviceSummary: booking.serviceSummary || "Visit",
      petNames: booking.petNames || [],
      petDisplayName: formatBookingPetNames(
        booking.petNames,
        booking.serviceSummary || "Pet care booking"
      ),
      payoutPerVisitCents: Math.round(
        (booking.sitterPayoutCents || 0) / totalVisits
      ),
      address,
      lat: booking.serviceLat != null ? Number(booking.serviceLat) : null,
      lng: booking.serviceLng != null ? Number(booking.serviceLng) : null,
      hasOpenCancellationRequest: hasOpenCancellationRequest(booking),
    });
  }

  const upcomingVisitEntries = upcomingVisits.map(toVisitEntry);
  const completedVisitEntries = completedVisits.map(toVisitEntry);

  return (
    <SitterDashboardLive
      bookings={serializedBookings}
      upcomingVisitEntries={upcomingVisitEntries}
      upcomingVisitTotal={upcomingVisitTotal}
      upcomingPage={upcomingPage}
      completedVisitEntries={completedVisitEntries}
      completedVisitTotal={completedVisitTotal}
      completedPage={completedPage}
      visitPageSize={VISIT_PAGE_SIZE}
      completedThisWeek={completedThisWeek}
      earnedTodayCents={earnedTodayCents}
      acknowledgedCompletedVisitIds={acknowledgedCompletedVisitIds}
    />
  );
}
