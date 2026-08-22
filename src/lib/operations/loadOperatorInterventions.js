import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";
import { prisma } from "@/lib/db";
import {
  getBusinessDayRange,
  getVisitOperationalStatus,
  visitRequiresOperationalResolution,
} from "@/lib/visits/visitOperations";

import { buildInterventionIssues } from "./interventionQueue";

function getBookingIdentity(booking) {
  const serviceSummary = booking.serviceSummary || "Pet care booking";

  return {
    petDisplayName: formatBookingPetNames(booking.petNames, serviceSummary),
    serviceSummary,
    ownerName: booking.client?.name || "Client",
    sitterId: booking.sitterId || null,
    sitterName: booking.sitter?.name || booking.sitter?.email || null,
  };
}

async function loadUnassignedVisits({ operatorId, now }) {
  const { startsAt, endsAt } = getBusinessDayRange(now);
  const visits = await prisma.visit.findMany({
    where: {
      operatorId,
      sitterId: null,
      startTime: { gte: startsAt, lt: endsAt },
    },
    select: {
      id: true,
      bookingId: true,
      sitterId: true,
      startTime: true,
      endTime: true,
      status: true,
      booking: {
        select: {
          petNames: true,
          serviceSummary: true,
          client: { select: { name: true } },
        },
      },
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });

  return visits
    .map((visit) => {
      const identity = getBookingIdentity(visit.booking);

      return {
        id: visit.id,
        bookingId: visit.bookingId,
        sitterId: null,
        startTime: visit.startTime,
        endTime: visit.endTime,
        status: visit.status,
        operationalStatus: getVisitOperationalStatus(visit, now),
        ...identity,
      };
    })
    .filter(visitRequiresOperationalResolution);
}

export async function loadOperatorInterventions({
  operatorId,
  now = new Date(),
  unassignedVisits,
}) {
  if (!operatorId) {
    throw new Error("operatorId is required to load interventions");
  }

  const unassignedVisitsPromise =
    unassignedVisits === undefined
      ? loadUnassignedVisits({ operatorId, now })
      : Promise.resolve(unassignedVisits);

  const [
    requestedBookingsData,
    liveMissedBookingsData,
    missedReviewBookingsData,
    cancellationData,
    resolvedUnassignedVisits,
  ] = await Promise.all([
    prisma.booking.findMany({
      where: { operatorId, status: "REQUESTED" },
      select: {
        id: true,
        createdAt: true,
        sitterId: true,
        petNames: true,
        serviceSummary: true,
        client: { select: { name: true } },
        sitter: { select: { name: true, email: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.booking.findMany({
      where: {
        operatorId,
        status: "CONFIRMED",
        visits: {
          some: { status: "CONFIRMED", endTime: { lt: now } },
        },
      },
      select: {
        id: true,
        sitterId: true,
        petNames: true,
        serviceSummary: true,
        client: { select: { name: true } },
        sitter: { select: { name: true, email: true } },
        visits: {
          where: { status: "CONFIRMED", endTime: { lt: now } },
          select: {
            id: true,
            sitterId: true,
            endTime: true,
            sitter: { select: { name: true, email: true } },
          },
          orderBy: [{ endTime: "asc" }, { id: "asc" }],
        },
      },
    }),
    prisma.booking.findMany({
      where: {
        operatorId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        history: {
          some: {
            note: { contains: "missed visit", mode: "insensitive" },
            missedVisitReviewStatus: null,
          },
        },
      },
      select: {
        id: true,
        sitterId: true,
        petNames: true,
        serviceSummary: true,
        client: { select: { name: true } },
        sitter: { select: { name: true, email: true } },
        history: {
          where: {
            note: { contains: "missed visit", mode: "insensitive" },
            missedVisitReviewStatus: null,
          },
          select: { id: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    }),
    prisma.conversation.findMany({
      where: {
        booking: {
          operatorId,
          status: { in: ["REQUESTED", "CONFIRMED"] },
        },
        messages: {
          some: {
            senderType: "CLIENT",
            body: {
              startsWith: "Cancellation request:",
              mode: "insensitive",
            },
          },
        },
      },
      select: {
        booking: {
          select: {
            id: true,
            sitterId: true,
            petNames: true,
            serviceSummary: true,
            client: { select: { name: true } },
            sitter: { select: { name: true, email: true } },
          },
        },
        messages: {
          where: {
            senderType: "CLIENT",
            body: {
              startsWith: "Cancellation request:",
              mode: "insensitive",
            },
          },
          select: { id: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    }),
    unassignedVisitsPromise,
  ]);

  const requestedBookings = requestedBookingsData.map((booking) => ({
    ...booking,
    ...getBookingIdentity(booking),
  }));
  const liveMissedBookings = liveMissedBookingsData.map((booking) => ({
    ...booking,
    ...getBookingIdentity(booking),
    visits: booking.visits.map((visit) => ({
      ...visit,
      sitterName: visit.sitter?.name || visit.sitter?.email || null,
    })),
  }));
  const missedReviewBookings = missedReviewBookingsData.map((booking) => ({
    ...booking,
    ...getBookingIdentity(booking),
    unresolvedHistories: booking.history,
  }));
  const cancellationConversations = cancellationData.map((conversation) => ({
    ...conversation,
    booking: {
      ...conversation.booking,
      ...getBookingIdentity(conversation.booking),
    },
  }));

  return buildInterventionIssues({
    liveMissedBookings,
    missedReviewBookings,
    requestedBookings,
    cancellationConversations,
    unassignedVisits: resolvedUnassignedVisits,
  });
}
