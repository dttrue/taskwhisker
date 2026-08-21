import Link from "next/link";

import { requireRole } from "@/auth";
import {
  Button,
  Card,
  FormField,
  PageHeader,
  PageShell,
  StatusBadge,
} from "@/components/ui/Foundation";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";
import { prisma } from "@/lib/db";
import {
  BUSINESS_TIME_ZONE,
  getBusinessDayRange,
  getVisitOperationalStatus,
  sortVisitsChronologically,
} from "@/lib/visits/visitOperations";

import DailyVisitCard from "./_components/DailyVisitCard";

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

export default async function OperatorOperationsPage({ searchParams }) {
  const session = await requireRole(["OPERATOR"]);
  const params = await Promise.resolve(searchParams);
  const now = new Date();
  const { startsAt, endsAt } = getBusinessDayRange(now);

  const visits = await prisma.visit.findMany({
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
          client: { select: { name: true } },
          conversation: { select: { id: true } },
          _count: { select: { visits: true } },
        },
      },
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });

  const schedule = sortVisitsChronologically(visits).map((visit) => {
    const serviceSummary = visit.booking.serviceSummary || "Pet care booking";
    const petDisplayName = formatBookingPetNames(
      visit.booking.petNames,
      serviceSummary
    );
    const visitCount = visit.booking._count.visits || 1;

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
      startTime: visit.startTime,
      endTime: visit.endTime,
      status: visit.status,
      operationalStatus: getVisitOperationalStatus(visit, now),
    };
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
