// src/app/dashboard/operator/bookings/[id]/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReviewSubmitButton from "@/app/dashboard/operator/_components/ReviewSubmitButton";
import MissedVisitCard from "@/app/dashboard/operator/_components/MissedVisitCard";
import {
  cancelBooking,
  reviewMissedVisitHistory,
  reviewMissedVisit,
} from "../actions";
import { getBookingNextAction } from "@/lib/getBookingNextAction";
import CollapsibleCard from "@/components/ui/CollapsibleCard";
import CancelBookingDetailForm from "@/app/dashboard/operator/_components/CancelBookingDetailForm";
import {
  ConfirmBookingForm,
  CompleteBookingForm,
} from "@/app/dashboard/operator/_components/BookingStatusActions";
import AssignSitterForm from "@/app/dashboard/operator/_components/AssignSitterForm";
import {
  STATUS_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_PILL_CLASSES,
} from "@/lib/statusStyles";
import { getNextBookingNeedingReview } from "../../lib/getNextBookingNeedingReview";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";
import { Card, Eyebrow, Notice } from "@/components/ui/Foundation";
function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function formatDateOnly(value) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeOnly(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHistoryTimestamp(value) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getHistoryEventTitle(history) {
  if (history.toStatus) {
    const statusLabel = STATUS_LABELS[history.toStatus] || history.toStatus;
    return `Booking ${statusLabel.toLowerCase()}`;
  }

  if (history.fromSitterId || history.toSitterId) {
    return "Sitter assignment changed";
  }

  const normalizedNote = history.note?.toLowerCase() || "";
  const isMissedVisit = normalizedNote.includes("missed visit");
  const isLate = normalizedNote.includes("late");

  if (isMissedVisit && isLate) return "Missed visit completed late";
  if (isMissedVisit) return "Missed visit recorded";
  if (isLate) return "Late completion recorded";

  return "Booking updated";
}

function groupVisitsByDate(visits = []) {
  const grouped = new Map();

  for (const visit of visits) {
    const key = new Date(visit.date).toISOString().slice(0, 10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(visit);
  }

  return Array.from(grouped.entries())
    .map(([dateKey, dayVisits]) => ({
      dateKey,
      label: formatDateOnly(`${dateKey}T00:00:00`),
      visits: dayVisits.sort(
        (a, b) => new Date(a.startTime) - new Date(b.startTime)
      ),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function getScheduleSummary(visits = [], booking) {
  if (!visits.length) {
    return `${formatDateTime(booking.startTime)} → ${formatDateTime(
      booking.endTime
    )}`;
  }

  const grouped = groupVisitsByDate(visits);

  if (grouped.length === 1 && grouped[0].visits.length === 1) {
    const visit = grouped[0].visits[0];
    return `${grouped[0].label} · ${formatTimeOnly(
      visit.startTime
    )} → ${formatTimeOnly(visit.endTime)}`;
  }

  return `${grouped.length} day${grouped.length === 1 ? "" : "s"} · ${
    visits.length
  } visit${visits.length === 1 ? "" : "s"}`;
}

function getFirstUpcomingVisit(visits = []) {
  if (!visits.length) return null;

  const now = new Date();
  return (
    visits.find((visit) => new Date(visit.endTime) >= now) || visits[0] || null
  );
}


function toneClasses(tone) {
  switch (tone) {
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "green":
      return "border-green-200 bg-green-50 text-green-900";
    case "blue":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "red":
      return "border-red-200 bg-red-50 text-red-900";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-900";
  }
}

const REVIEW_STATUS_LABELS = {
  EXCUSED: "Excused",
  SITTER_FAULT: "Sitter fault",
  NEEDS_FOLLOW_UP: "Needs follow-up",
};

function SummaryCard({ label, children }) {
  return (
    <Card className="p-5 shadow-none">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--task-primary)]">
        {label}
      </div>
      <div className="mt-3 text-sm leading-6 text-[var(--task-text)]">
        {children}
      </div>
    </Card>
  );
}

export default async function OperatorBookingDetailPage({
  params,
  searchParams,
}) {
  await requireRole(["OPERATOR"]);

  const { id } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);
  const isTriageMode = sp?.mode === "triage";
  if (!id) notFound();

  const qs = new URLSearchParams(sp || {}).toString();
  const backHref = qs ? `/dashboard/operator?${qs}` : "/dashboard/operator";

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      client: true,
      sitter: true,
      lineItems: true,
      visits: {
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
      history: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: true, fromSitter: true, toSitter: true },
      },
    },
  });

  if (!booking) {
    return (
      <main className="min-h-screen bg-zinc-50 p-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-zinc-600">Booking not found.</p>
          <Link className="text-sm underline" href={backHref}>
            Back to list
          </Link>
        </div>
      </main>
    );
  }

  const petDisplayName = formatBookingPetNames(
    booking.petNames,
    booking.serviceSummary || "Pet care booking"
  );
  const showServiceContext =
    Boolean(booking.serviceSummary) &&
    booking.serviceSummary !== petDisplayName;

  

  const sitters = await prisma.user.findMany({
    where: { role: "SITTER" },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  const canConfirm = booking.status === "REQUESTED";
  const canCancel = !["CANCELED", "COMPLETED"].includes(booking.status);
  const hasVisits = booking.visits.length > 0;
  const allVisitsCompleted = booking.visits.every(
    (v) => v.status === "COMPLETED"
  );
  const canComplete =
    booking.status === "CONFIRMED" && hasVisits && allVisitsCompleted;
  const lateNoteCount = booking.history.filter((h) =>
    h.note?.toLowerCase().includes("late")
  ).length;
  const groupedVisits = groupVisitsByDate(booking.visits);
  const scheduleSummary = getScheduleSummary(booking.visits, booking);
  const firstUpcomingVisit = getFirstUpcomingVisit(booking.visits);
  const nextAction = getBookingNextAction(booking, firstUpcomingVisit) ?? {
    tone: "zinc",
    title: "No immediate action",
    description: "There is no recommended action for this booking right now.",
  };

  const missedVisitEvents = booking.history.filter((h) =>
    h.note?.toLowerCase().includes("missed visit")
  );

  const unresolvedMissedEvents = missedVisitEvents.filter(
    (h) => !h.missedVisitReviewStatus
  );

  const unresolvedMissedCount = unresolvedMissedEvents.length;
  const totalMissedCount = missedVisitEvents.length;

  const now = new Date();

  const unresolvedMissedVisits = booking.visits.filter((visit) => {
    if (visit.status !== "CONFIRMED") return false; 

    const end = new Date(visit.endTime);
    if (Number.isNaN(end.getTime())) return false;

    return end < now;
  });
  const hasUnresolvedMissedReview =
    unresolvedMissedCount > 0 || unresolvedMissedVisits.length > 0;
  const hasAvailableBookingAction = canConfirm || canComplete || canCancel;

  const shouldAutoAdvanceAfterThisVisit = unresolvedMissedVisits.length === 1;

  const allBookings = await prisma.booking.findMany({
    where: {
      operatorId: booking.operatorId,
      status: "CONFIRMED",
    },
    include: {
      visits: true,
      history: true,
    },
  });

  const nextBooking = getNextBookingNeedingReview(allBookings, booking.id, now);

  if (isTriageMode && unresolvedMissedVisits.length === 0 && nextBooking) {
    redirect(`/dashboard/operator/bookings/${nextBooking.id}?mode=triage`);
  }

  return (
    <main className="min-h-screen bg-[var(--task-canvas)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header / Hero */}
        <header className="rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-5 shadow-[var(--task-shadow-card)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <Eyebrow>Booking detail</Eyebrow>

              <div>
                <h1 className="max-w-3xl break-words text-3xl font-bold tracking-[-0.035em] text-[var(--task-text)] sm:text-4xl">
                  {petDisplayName}
                </h1>
                {showServiceContext ? (
                  <div className="mt-2 break-words text-base font-semibold text-[var(--task-text-muted)]">
                    {booking.serviceSummary}
                  </div>
                ) : null}
                <div className="mt-1 text-sm text-[var(--task-text-muted)]">
                  Owner: {booking.client?.name || "Client"}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--task-text-muted)]">
                  <span>ID: {booking.id.slice(0, 8)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{scheduleSummary}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[var(--task-text)]">
                    Total: {formatMoney(booking.clientTotalCents)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                    STATUS_PILL_CLASSES[booking.status] ||
                    "border-zinc-200 bg-zinc-100 text-zinc-700"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      STATUS_DOT_CLASSES[booking.status] || "bg-zinc-400"
                    }`}
                  />
                  <span>{STATUS_LABELS[booking.status] || booking.status}</span>
                </span>

                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                  {booking.visits.length} visit
                  {booking.visits.length === 1 ? "" : "s"}
                </span>

                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                  {groupedVisits.length} day
                  {groupedVisits.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm sm:flex-col sm:items-end">
              {isTriageMode && (
                <Link
                  href="/dashboard/operator/triage"
                  className="font-semibold text-[var(--task-danger)] underline underline-offset-4 hover:brightness-75"
                >
                  Back to triage queue
                </Link>
              )}

              <Link
                href={backHref}
                className="font-semibold text-[var(--task-primary)] underline underline-offset-4 hover:text-[var(--task-primary-hover)]"
              >
                Back to bookings
              </Link>
            </div>
          </div>
        </header>

        {hasUnresolvedMissedReview ? (
          <Notice title="Needs attention" tone="warning">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {unresolvedMissedCount > 0 && (
                <p className="text-sm font-medium text-[#704c16]">
                  {unresolvedMissedCount} missed-visit review
                  {unresolvedMissedCount === 1 ? "" : "s"} unresolved
                </p>
              )}

              {unresolvedMissedVisits.length > 0 && (
                <p className="text-sm font-medium text-[#704c16]">
                  {unresolvedMissedVisits.length} overdue visit
                  {unresolvedMissedVisits.length === 1 ? "" : "s"} need
                  {unresolvedMissedVisits.length === 1 ? "s" : ""} review
                </p>
              )}
            </div>
          </Notice>
        ) : null}

        {lateNoteCount > 0 ? (
          <Notice title="Operational history" tone="neutral">
            {lateNoteCount} late completion{lateNoteCount === 1 ? "" : "s"}
            {" "}recorded for context.
          </Notice>
        ) : null}

        {unresolvedMissedVisits.length > 0 && (
          <section className="space-y-3 rounded-[var(--task-radius-card)] border border-[#e8c8c3] bg-[var(--task-danger-soft)] p-4">
            <p className="text-sm font-semibold text-[#86382f]">
              Missed visits need review
            </p>

            {unresolvedMissedVisits.map((visit) => (
              <MissedVisitCard
                key={visit.id}
                visit={visit}
                reviewMissedVisit={reviewMissedVisit}
                isTriageMode={isTriageMode}
                nextBookingId={
                  shouldAutoAdvanceAfterThisVisit
                    ? nextBooking?.id || null
                    : null
                }
              />
            ))}
          </section>
        )}
        {isTriageMode && (
          <p className="text-xs text-zinc-500 mt-2">
            Moving through unresolved bookings
          </p>
        )}

        {isTriageMode && nextBooking && unresolvedMissedVisits.length > 1 && (
          <div className="flex justify-end">
            <Link
              href={`/dashboard/operator/bookings/${nextBooking.id}?mode=triage`}
              className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Skip to next issue →
            </Link>
          </div>
        )}

        {!hasUnresolvedMissedReview && totalMissedCount > 0 && (
          <div className="rounded-[var(--task-radius-control)] border border-[#c9dfd4] bg-[var(--task-success-soft)] px-4 py-3">
            <p className="text-sm font-semibold text-[#285844]">
              Review complete
            </p>

            <p className="mt-1 text-sm text-green-800">
              All missed-visit review work for this booking is resolved.
            </p>

            <Link
              href="/dashboard/operator/triage"
              className="mt-3 inline-block text-sm font-medium text-green-900 underline hover:text-green-700"
            >
              Return to triage queue
            </Link>
          </div>
        )}

        {/* Next Action */}
        <section
          className={`rounded-[var(--task-radius-card)] border p-5 ${toneClasses(
            nextAction.tone
          )}`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.14em]">
            Next Action
          </div>

          <div className="mt-2">
            <h2 className="text-xl font-bold tracking-[-0.02em]">
              {nextAction.title}
            </h2>
            <p className="mt-1 text-sm opacity-90">{nextAction.description}</p>
          </div>

          {hasAvailableBookingAction ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <ConfirmBookingForm
                bookingId={booking.id}
                canConfirm={canConfirm}
              />
              <CompleteBookingForm
                bookingId={booking.id}
                canComplete={canComplete}
              />
              <CancelBookingDetailForm
                bookingId={booking.id}
                canCancel={canCancel}
                cancelBooking={cancelBooking}
              />
            </div>
          ) : null}
        </section>

        {/* Summary cards */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SummaryCard label="Client">
            <div className="font-medium text-zinc-900">
              {booking.client?.name || "—"}
            </div>
            <div className="mt-1 text-zinc-600">
              {booking.client?.email || "—"}
            </div>
            {booking.client?.phone ? (
              <div className="mt-1 text-zinc-600">{booking.client.phone}</div>
            ) : null}
          </SummaryCard>

          <SummaryCard label="Assignment">
            <div className="break-words font-semibold text-zinc-900">
              {petDisplayName}
            </div>
            {showServiceContext ? (
              <div className="mt-1 break-words text-zinc-600">
                {booking.serviceSummary}
              </div>
            ) : null}
            <div className="mt-1 break-words text-zinc-500">
              Owner: {booking.client?.name || "Client"}
            </div>
            <div className="mt-3 font-medium text-zinc-900">
              Assigned sitter: {" "}
              {booking.sitter?.name || booking.sitter?.email || "Unassigned"}
            </div>
            <div className="mt-3">
              <AssignSitterForm
                bookingId={booking.id}
                currentSitterId={booking.sitterId}
                sitters={sitters}
                bookingStatus={booking.status}
                canAssignToMe={true}
              />
            </div>
          </SummaryCard>

          <SummaryCard label="Schedule">
            <div className="font-medium text-zinc-900">{scheduleSummary}</div>
            <div className="mt-1 text-zinc-600">
              Parent window: {formatDateTime(booking.startTime)} →{" "}
              {formatDateTime(booking.endTime)}
            </div>
            {firstUpcomingVisit ? (
              <div className="mt-2 text-xs text-zinc-500">
                Next visit: {formatDateOnly(firstUpcomingVisit.startTime)} at{" "}
                {formatTimeOnly(firstUpcomingVisit.startTime)}
              </div>
            ) : null}
          </SummaryCard>

          <SummaryCard label="Money">
            <div className="font-medium text-zinc-900">
              {formatMoney(booking.clientTotalCents)}
            </div>
            <div className="mt-1 text-zinc-600">
              Fee: {formatMoney(booking.platformFeeCents)}
            </div>
            <div className="mt-1 text-zinc-600">
              Payout: {formatMoney(booking.sitterPayoutCents)}
            </div>
            {booking.serviceSummary ? (
              <div className="mt-2 text-xs text-zinc-500">
                Service: {booking.serviceSummary}
              </div>
            ) : null}
          </SummaryCard>
        </section>

        {/* Notes */}
        {booking.notes ? (
          <CollapsibleCard title="Notes / Add-ons" defaultOpen={false}>
            <div className="whitespace-pre-wrap text-sm text-zinc-900">
              {booking.notes}
            </div>
          </CollapsibleCard>
        ) : null}

        {/* Visit schedule */}
        <CollapsibleCard title="Visit schedule" defaultOpen={true}>
          {booking.visits.length === 0 ? (
            <div className="text-sm text-zinc-600">No visits found.</div>
          ) : (
            <div className="space-y-4">
              {groupedVisits.map((group) => (
                <div
                  key={group.dateKey}
                  className="rounded-xl border border-zinc-200"
                >
                  <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900">
                    {group.label}
                  </div>

                  <div className="divide-y divide-zinc-100">
                    {group.visits.map((visit, idx) => (
                      <div
                        key={visit.id}
                        className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="break-words text-sm font-semibold text-zinc-900">
                            {petDisplayName}
                          </div>
                          <div className="text-sm text-zinc-600">
                            Visit {idx + 1} · {formatTimeOnly(visit.startTime)} →{" "}
                            {formatTimeOnly(visit.endTime)}
                          </div>
                          <div className="mt-1 break-words text-xs text-zinc-500">
                            Owner: {booking.client?.name || "Client"} · Sitter:{" "}
                            {booking.sitter?.name ||
                              booking.sitter?.email ||
                              "Unassigned"}
                          </div>
                        </div>

                        <div className="text-xs text-zinc-500">
                          Status: {visit.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleCard>

        {/* Secondary details */}
        <CollapsibleCard
          title={`Line items (${booking.lineItems.length})`}
          defaultOpen={false}
        >
          <summary className="cursor-pointer list-none border-b border-zinc-200 p-4 font-semibold text-zinc-900">
            <div className="flex items-center justify-between">
              <span>Line items</span>
              <span className="text-xs font-medium text-zinc-500">
                {booking.lineItems.length}
              </span>
            </div>
          </summary>

          {booking.lineItems.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No line items.</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-zinc-500">
                    <tr className="border-b border-zinc-200">
                      <th className="p-3">Label</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Unit</th>
                      <th className="p-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.lineItems.map((li) => (
                      <tr key={li.id} className="border-b border-zinc-100">
                        <td className="p-3">{li.label}</td>
                        <td className="p-3">{li.quantity}</td>
                        <td className="p-3">
                          {formatMoney(li.unitPriceCents)}
                        </td>
                        <td className="p-3">
                          {formatMoney(li.totalPriceCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 sm:hidden">
                {booking.lineItems.map((li) => (
                  <div
                    key={li.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-zinc-900">
                        {li.label}
                      </div>
                      <div className="text-xs text-zinc-500">
                        Qty: {li.quantity}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Unit: {formatMoney(li.unitPriceCents)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Total</div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {formatMoney(li.totalPriceCents)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          title={
            <>
              <span>History</span>
              <span className="text-xs font-normal text-[var(--task-text-muted)]">
                {booking.history.length} event
                {booking.history.length === 1 ? "" : "s"}
              </span>
            </>
          }
          defaultOpen={false}
        >
          {booking.history.length === 0 ? (
            <div className="text-sm text-zinc-600">No history yet.</div>
          ) : (
            <ol className="relative space-y-0">
              {booking.history.map((h, index) => {
                const isLateNote = h.note?.toLowerCase().includes("late");
                const isMissedVisitNote = h.note
                  ?.toLowerCase()
                  .includes("missed visit");
                const needsReview =
                  isMissedVisitNote && !h.missedVisitReviewStatus;
                const eventTitle = getHistoryEventTitle(h);
                const actorLabel = h.changedBy?.name || h.changedBy?.email;
                const markerClasses = needsReview
                  ? "border-[#d4a854] bg-[var(--task-warning-soft)]"
                  : h.missedVisitReviewStatus
                  ? "border-[#8bb6a4] bg-[var(--task-success-soft)]"
                  : "border-[var(--task-border-strong)] bg-white";

                return (
                  <li
                    key={h.id}
                    className="relative grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-3 pb-6 last:pb-0"
                  >
                    {index < booking.history.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-[0.6rem] top-5 w-px bg-[var(--task-border)]"
                      />
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={`relative z-10 mt-1 h-5 w-5 rounded-full border-2 ${markerClasses}`}
                    />

                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <h3 className="break-words text-sm font-semibold text-[var(--task-text)]">
                          {eventTitle}
                        </h3>
                        <p className="shrink-0 break-all text-xs text-[var(--task-text-muted)] sm:text-right">
                          {formatHistoryTimestamp(h.createdAt)}
                          {actorLabel ? ` · by ${actorLabel}` : ""}
                        </p>
                      </div>

                      {h.fromSitterId || h.toSitterId ? (
                        <p className="mt-1 break-words text-xs text-[var(--task-text-muted)]">
                          {h.fromSitter?.name || h.fromSitter?.email || "Unassigned"}
                          {" → "}
                          {h.toSitter?.name ||
                            h.toSitter?.email ||
                            "Unassigned"}
                        </p>
                      ) : null}

                      {h.note ? (
                        <p
                          className={`mt-2 break-words text-sm leading-6 ${
                            needsReview
                              ? "font-medium text-[#704c16]"
                              : isLateNote
                              ? "text-[#705b39]"
                              : "text-[var(--task-text-muted)]"
                          }`}
                        >
                          {h.note}
                        </p>
                      ) : null}

                      {needsReview ? (
                        <div className="mt-3 rounded-[var(--task-radius-control)] border border-[#ead9ad] bg-[var(--task-warning-soft)] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#704c16]">
                            Review this incident
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <form
                              action={reviewMissedVisitHistory.bind(null, {
                                historyId: h.id,
                                status: "EXCUSED",
                                note: "Operator marked this missed visit as excused.",
                              })}
                            >
                              <button
                                type="submit"
                                className="inline-flex min-h-10 items-center justify-center rounded-[var(--task-radius-control)] border border-[#8bb6a4] bg-white px-3 py-2 text-xs font-semibold text-[#285844] hover:bg-[var(--task-success-soft)]"
                              >
                                Excuse
                              </button>
                            </form>

                            <form
                              action={reviewMissedVisitHistory.bind(null, {
                                historyId: h.id,
                                status: "SITTER_FAULT",
                                note: "Operator marked this missed visit as sitter fault.",
                              })}
                            >
                              <button
                                type="submit"
                                className="inline-flex min-h-10 items-center justify-center rounded-[var(--task-radius-control)] border border-[#c98d84] bg-white px-3 py-2 text-xs font-semibold text-[#86382f] hover:bg-[var(--task-danger-soft)]"
                              >
                                Sitter fault
                              </button>
                            </form>

                            <form
                              action={reviewMissedVisitHistory.bind(null, {
                                historyId: h.id,
                                status: "NEEDS_FOLLOW_UP",
                                note: "Operator marked this missed visit as needing follow-up.",
                              })}
                            >
                              <button
                                type="submit"
                                className="inline-flex min-h-10 items-center justify-center rounded-[var(--task-radius-control)] border border-[#d4a854] bg-white px-3 py-2 text-xs font-semibold text-[#704c16] hover:bg-[#fbf3df]"
                              >
                                Follow up
                              </button>
                            </form>
                          </div>
                        </div>
                      ) : null}

                      {h.missedVisitReviewStatus ? (
                        <div className="mt-3 flex flex-wrap items-start gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              h.missedVisitReviewStatus === "EXCUSED"
                                ? "border-[#c9dfd4] bg-[var(--task-success-soft)] text-[#285844]"
                                : h.missedVisitReviewStatus === "SITTER_FAULT"
                                ? "border-[#e8c8c3] bg-[var(--task-danger-soft)] text-[#86382f]"
                                : h.missedVisitReviewStatus ===
                                  "NEEDS_FOLLOW_UP"
                                ? "border-[#ead9ad] bg-[var(--task-warning-soft)] text-[#704c16]"
                                : "border-[var(--task-border)] bg-[var(--task-surface-soft)] text-[var(--task-text-muted)]"
                            }`}
                          >
                            {REVIEW_STATUS_LABELS[
                              h.missedVisitReviewStatus
                            ] ?? h.missedVisitReviewStatus}
                          </span>
                          {h.missedVisitReviewNote ? (
                            <p className="min-w-0 flex-1 break-words text-xs leading-5 text-[var(--task-text-muted)]">
                              {h.missedVisitReviewNote}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CollapsibleCard>
      </div>
    </main>
  );
}
