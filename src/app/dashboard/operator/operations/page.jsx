import Link from "next/link";

import { requireRole } from "@/auth";
import {
  Button,
  Card,
  FormField,
  PageHeader,
  PageShell,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Foundation";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";
import { prisma } from "@/lib/db";
import { buildInterventionIssues } from "@/lib/operations/interventionQueue";
import {
  BUSINESS_TIME_ZONE,
  getBusinessDayRange,
  getCurrentVisit,
  getNextVisit,
  getVisitOperationalStatus,
  normalizeCoordinates,
  sortVisitsChronologically,
  visitRequiresOperationalResolution,
} from "@/lib/visits/visitOperations";

import DailyVisitCard from "./_components/DailyVisitCard";
import InterventionQueue from "./_components/InterventionQueue";
import OperatorSitterRoute from "./_components/OperatorSitterRoute";
import SitterStatusCard from "./_components/SitterStatusCard";

const OPERATIONAL_STATUS_OPTIONS = [
  "ALL",
  "CURRENT",
  "UPCOMING",
  "MISSED",
  "COMPLETED",
  "CANCELED",
  "SCHEDULED",
];
const ASSIGNMENT_OPTIONS = ["ALL", "ASSIGNED", "UNASSIGNED"];

function getStringParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveEnumParam(value, allowedValues, fallback = "ALL") {
  const normalized = String(getStringParam(value) || fallback).toUpperCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function formatBusinessTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBusinessDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function buildAddress(booking) {
  return [
    booking.serviceAddressLine1,
    booking.serviceAddressLine2,
    booking.serviceCity,
    booking.serviceState,
    booking.servicePostalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

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

function SummaryCard({ label, value, tone = "neutral" }) {
  return (
    <Card className="min-w-0 p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--task-text-muted)]">
          {label}
        </p>
        {tone !== "neutral" ? <StatusBadge tone={tone}>{value}</StatusBadge> : null}
      </div>
      {tone === "neutral" ? (
        <p className="mt-1 text-2xl font-bold text-[var(--task-text)]">{value}</p>
      ) : null}
    </Card>
  );
}

function getSitterSummaries(schedule, now) {
  const visitsBySitter = new Map();

  for (const visit of schedule) {
    if (!visit.sitterId) continue;

    const existing = visitsBySitter.get(visit.sitterId) || {
      id: visit.sitterId,
      name: visit.sitterName || "Sitter",
      visits: [],
    };

    existing.visits.push(visit);
    visitsBySitter.set(visit.sitterId, existing);
  }

  return Array.from(visitsBySitter.values())
    .map((sitter) => {
      const orderedVisits = sortVisitsChronologically(sitter.visits);
      const currentVisit = getCurrentVisit(orderedVisits, now);
      const nextVisit = getNextVisit(orderedVisits, now);
      const completed = orderedVisits.filter(
        (visit) => visit.status === "COMPLETED"
      ).length;
      const missedVisits = sortVisitsChronologically(
        orderedVisits.filter((visit) => visit.operationalStatus === "MISSED")
      );
      const remaining = orderedVisits.filter((visit) =>
        visitRequiresOperationalResolution(visit)
      ).length;
      const priority = currentVisit
        ? 0
        : missedVisits.length > 0
          ? 1
          : remaining > 0
            ? 2
            : 3;
      const priorityVisit =
        priority === 0
          ? currentVisit
          : priority === 1
            ? missedVisits[0] || null
            : priority === 2
              ? nextVisit
              : null;

      return {
        id: sitter.id,
        name: sitter.name,
        total: orderedVisits.length,
        completed,
        remaining,
        missed: missedVisits.length,
        currentVisit,
        nextVisit,
        priority,
        priorityTime: priorityVisit
          ? new Date(priorityVisit.startTime).getTime()
          : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.priorityTime - b.priorityTime ||
        a.name.localeCompare(b.name)
    );
}

export default async function OperatorOperationsPage({ searchParams }) {
  const session = await requireRole(["OPERATOR"]);
  const params = await Promise.resolve(searchParams);
  const now = new Date();
  const { startsAt, endsAt } = getBusinessDayRange(now);

  const [
    visits,
    requestedBookingsData,
    liveMissedBookingsData,
    missedReviewBookingsData,
    cancellationData,
  ] = await Promise.all([
    prisma.visit.findMany({
        where: {
          operatorId: session.user.id,
          startTime: { gte: startsAt, lt: endsAt },
        },
        select: {
          id: true,
          bookingId: true,
          sitterId: true,
          startTime: true,
          endTime: true,
          status: true,
          sitter: { select: { id: true, name: true, email: true } },
          booking: {
            select: {
              petNames: true,
              serviceSummary: true,
              sitterPayoutCents: true,
              serviceAddressLine1: true,
              serviceAddressLine2: true,
              serviceCity: true,
              serviceState: true,
              servicePostalCode: true,
              serviceLat: true,
              serviceLng: true,
              client: { select: { name: true } },
              conversation: { select: { id: true } },
              _count: { select: { visits: true } },
            },
          },
        },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
    }),
    prisma.booking.findMany({
        where: { operatorId: session.user.id, status: "REQUESTED" },
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
          operatorId: session.user.id,
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
          operatorId: session.user.id,
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
            operatorId: session.user.id,
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
  ]);

  const schedule = sortVisitsChronologically(visits).map((visit) => {
    const serviceSummary = visit.booking.serviceSummary || "Pet care booking";
    const petDisplayName = formatBookingPetNames(
      visit.booking.petNames,
      serviceSummary
    );
    const visitCount = visit.booking._count.visits || 1;
    const coordinates = normalizeCoordinates(
      visit.booking.serviceLat,
      visit.booking.serviceLng
    );

    return {
      id: visit.id,
      bookingId: visit.bookingId,
      hasConversation: Boolean(visit.booking.conversation),
      sitterId: visit.sitterId,
      sitterName: visit.sitter?.name || visit.sitter?.email || null,
      ownerName: visit.booking.client?.name || "Client",
      petDisplayName,
      serviceSummary,
      showServiceContext: serviceSummary !== petDisplayName,
      payoutPerVisitCents: Math.round(
        (visit.booking.sitterPayoutCents || 0) / visitCount
      ),
      address: buildAddress(visit.booking),
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      hasCoordinates: Boolean(coordinates),
      startTime: visit.startTime,
      endTime: visit.endTime,
      status: visit.status,
      operationalStatus: getVisitOperationalStatus(visit, now),
    };
  });

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
  const interventionIssues = buildInterventionIssues({
    liveMissedBookings,
    missedReviewBookings,
    requestedBookings,
    cancellationConversations,
    unassignedVisits: schedule.filter(
      (visit) =>
        !visit.sitterId && visitRequiresOperationalResolution(visit)
    ),
  });

  const sitterOptions = Array.from(
    new Map(
      schedule
        .filter((visit) => visit.sitterId)
        .map((visit) => [visit.sitterId, visit.sitterName])
    ),
    ([id, name]) => ({ id, name })
  ).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const requestedSitter = getStringParam(params?.sitter) || "ALL";
  const sitter = sitterOptions.some((option) => option.id === requestedSitter)
    ? requestedSitter
    : requestedSitter === "UNASSIGNED"
      ? "UNASSIGNED"
      : "ALL";
  const operationalStatus = resolveEnumParam(
    params?.state,
    OPERATIONAL_STATUS_OPTIONS
  );
  const assignment = resolveEnumParam(
    params?.assignment,
    ASSIGNMENT_OPTIONS
  );

  const filteredSchedule = schedule.filter((visit) => {
    if (sitter === "UNASSIGNED" && visit.sitterId) return false;
    if (sitter !== "ALL" && sitter !== "UNASSIGNED" && visit.sitterId !== sitter) {
      return false;
    }
    if (operationalStatus !== "ALL" && visit.operationalStatus !== operationalStatus) {
      return false;
    }
    if (assignment === "ASSIGNED" && !visit.sitterId) return false;
    if (assignment === "UNASSIGNED" && visit.sitterId) return false;
    return true;
  });

  const counts = schedule.reduce(
    (summary, visit) => {
      summary.total += 1;
      if (!visit.sitterId) summary.unassigned += 1;
      if (visit.operationalStatus === "CURRENT") summary.current += 1;
      if (visit.operationalStatus === "UPCOMING") summary.upcoming += 1;
      if (visit.operationalStatus === "MISSED") summary.missed += 1;
      if (visit.operationalStatus === "COMPLETED") summary.completed += 1;
      return summary;
    },
    { total: 0, current: 0, upcoming: 0, missed: 0, completed: 0, unassigned: 0 }
  );
  const filtersAreActive =
    sitter !== "ALL" || operationalStatus !== "ALL" || assignment !== "ALL";
  const sitterSummaries = getSitterSummaries(schedule, now);
  const assignedVisitCount = sitterSummaries.reduce(
    (total, sitterSummary) => total + sitterSummary.total,
    0
  );
  const selectedSitterSummary = sitterSummaries.find(
    (sitterSummary) => sitterSummary.id === sitter
  );
  const selectedSitterRoute = selectedSitterSummary
    ? schedule
        .filter((visit) => visit.sitterId === selectedSitterSummary.id)
        .map((visit, index) => ({
          ...visit,
          startTime: new Date(visit.startTime).toISOString(),
          endTime: new Date(visit.endTime).toISOString(),
          stopNumber: index + 1,
        }))
    : [];

  return (
    <PageShell className="py-6 sm:py-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <PageHeader
            eyebrow="Operator Operations Center"
            title="Today's Schedule"
            description={`${formatBusinessDate(now)} · Times shown in New Jersey time.`}
          />
          <Button href="/dashboard/operator" variant="secondary">
            Booking dashboard
          </Button>
        </div>

        <section aria-label="Today's visit summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <SummaryCard label="Total today" value={counts.total} />
          <SummaryCard label="Current" value={counts.current} tone="success" />
          <SummaryCard label="Upcoming" value={counts.upcoming} />
          <SummaryCard label="Missed" value={counts.missed} tone="warning" />
          <SummaryCard label="Completed" value={counts.completed} tone="info" />
          <SummaryCard label="Unassigned" value={counts.unassigned} tone="warning" />
        </section>

        <InterventionQueue issues={interventionIssues} />

        <section aria-label="Sitters Today" className="space-y-3">
          <SectionHeader
            title="Sitters Today"
            description="Full-day assignment overview. Schedule filters below do not change these sitter totals."
            meta={
              <span className="text-sm font-semibold text-[var(--task-text-muted)]">
                {sitterSummaries.length} sitter{sitterSummaries.length === 1 ? "" : "s"} · {assignedVisitCount} assigned
              </span>
            }
          />
          {sitterSummaries.length === 0 ? (
            <Card className="p-5 text-sm text-[var(--task-text-muted)]">
              No sitters have assigned visits today.
              {counts.unassigned > 0
                ? ` ${counts.unassigned} unassigned visit${
                    counts.unassigned === 1 ? " remains" : "s remain"
                  } in the daily schedule.`
                : ""}
            </Card>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {sitterSummaries.map((sitterSummary) => (
                <SitterStatusCard
                  key={sitterSummary.id}
                  sitter={sitterSummary}
                  formatTime={formatBusinessTime}
                  isScheduleFiltered={sitter === sitterSummary.id}
                />
              ))}
            </div>
          )}
        </section>

        {selectedSitterSummary ? (
          <OperatorSitterRoute
            key={selectedSitterSummary.id}
            sitterName={selectedSitterSummary.name}
            visits={selectedSitterRoute}
          />
        ) : null}

        <Card className="p-4 sm:p-5">
          <form method="get" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <FormField id="operations-sitter" label="Sitter" as="select" name="sitter" defaultValue={sitter}>
              <option value="ALL">All sitters</option>
              <option value="UNASSIGNED">Unassigned</option>
              {sitterOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </FormField>
            <FormField id="operations-state" label="Operational status" as="select" name="state" defaultValue={operationalStatus}>
              {OPERATIONAL_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All statuses" : option.charAt(0) + option.slice(1).toLowerCase()}
                </option>
              ))}
            </FormField>
            <FormField id="operations-assignment" label="Assignment" as="select" name="assignment" defaultValue={assignment}>
              <option value="ALL">All assignments</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNASSIGNED">Unassigned</option>
            </FormField>
            <div className="grid grid-cols-2 gap-2 lg:flex">
              <Button type="submit">Apply filters</Button>
              <Button href="/dashboard/operator/operations" variant="secondary">Reset</Button>
            </div>
          </form>
        </Card>

        <section aria-labelledby="daily-schedule-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="daily-schedule-heading" className="text-xl font-bold text-[var(--task-text)]">Daily schedule</h2>
              <p className="mt-1 text-sm text-[var(--task-text-muted)]">
                {filtersAreActive
                  ? `${filteredSchedule.length} of ${schedule.length} visits shown`
                  : `${schedule.length} visit${schedule.length === 1 ? "" : "s"} in chronological order`}
              </p>
            </div>
            {filtersAreActive ? (
              <Link href="/dashboard/operator/operations" className="text-sm font-semibold text-[var(--task-primary)] underline underline-offset-4">
                Clear filters
              </Link>
            ) : null}
          </div>

          {schedule.length === 0 ? (
            <Card className="p-6 text-sm text-[var(--task-text-muted)]">No visits scheduled for today.</Card>
          ) : filteredSchedule.length === 0 ? (
            <Card className="p-6 text-sm text-[var(--task-text-muted)]">No visits match these filters.</Card>
          ) : (
            filteredSchedule.map((visit) => (
              <DailyVisitCard key={visit.id} visit={visit} formatTime={formatBusinessTime} />
            ))
          )}
        </section>
      </div>
    </PageShell>
  );
}
