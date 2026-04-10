// src/app/dashboard/sitter/bookings/[id]/page.jsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import { completeVisitAsSitter } from "../../actions";
import {
  formatMoney,
  formatTime,
  buildAddress,
  groupVisitsByDay,
  getVisitProgressLabel,
  getActionableVisitForBooking,
  canCompleteVisit,
} from "@/app/dashboard/sitter/lib/sitterDashboardUtils";
import CompleteVisitButton from "../../_components/CompleteVisitButton";
import CollapsibleCard from "@/components/ui/CollapsibleCard";


function getStatusPillClasses(status) {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "COMPLETED":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "CANCELED":
      return "bg-rose-50 text-rose-700 border border-rose-200";
    case "REQUESTED":
    default:
      return "bg-amber-50 text-amber-700 border border-amber-200";
  }
}

function getVisitStatusLabel(visit, now) {
  if (visit.status === "COMPLETED") {
    return "Completed";
  }

  if (visit.status === "CANCELED") {
    return "Canceled";
  }

  if (canCompleteVisit(visit, now)) {
    return "Ready now";
  }

  if (visit.status === "CONFIRMED") {
    return "Scheduled";
  }

  return "Requested";
}

function getVisitStatusClasses(visit, now) {
  if (visit.status === "COMPLETED") {
    return "bg-blue-50 text-blue-700";
  }

  if (visit.status === "CANCELED") {
    return "bg-rose-50 text-rose-700";
  }

  if (canCompleteVisit(visit, now)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (visit.status === "CONFIRMED") {
    return "bg-zinc-100 text-zinc-700";
  }

  return "bg-amber-50 text-amber-700";
}

function formatVisitDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DetailCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SitterBookingDetailPage({ params }) {
  const session = await requireRole(["SITTER"]);
  const sitterId = session.user?.id;
  const resolvedParams = await params;
  const bookingId = resolvedParams?.id;

  if (!sitterId || !bookingId) {
    notFound();
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: true,
      sitter: true,
      visits: {
        orderBy: { startTime: "asc" },
      },
      lineItems: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!booking || booking.sitterId !== sitterId) {
    notFound();
  }

  const now = new Date();
  const address = buildAddress(booking);
  const visitGroups = groupVisitsByDay(booking.visits || []);
  const actionableVisit = getActionableVisitForBooking(booking, now);
  const canCompleteActionableVisit = canCompleteVisit(actionableVisit, now);
  const nextUpcomingVisit =
    booking.visits?.find(
      (visit) =>
        visit.status === "CONFIRMED" &&
        new Date(visit.startTime).getTime() > now.getTime()
    ) || null;

  const highlightedVisitId =
    actionableVisit?.id || nextUpcomingVisit?.id || null;

  const totalVisits = booking.visits?.length || 0;
  const completedVisits =
    booking.visits?.filter((visit) => visit.status === "COMPLETED").length || 0;
  const canceledVisits =
    booking.visits?.filter((visit) => visit.status === "CANCELED").length || 0;
  const remainingVisits =
    booking.visits?.filter(
      (visit) => visit.status !== "COMPLETED" && visit.status !== "CANCELED"
    ).length || 0;
  const visitProgressLabel = getVisitProgressLabel(booking.visits || []);

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/dashboard/sitter"
              className="inline-flex items-center text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
            >
              ← Back to sitter dashboard
            </Link>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-zinc-900">
                {booking.client?.name || "Client"}
              </h1>

              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusPillClasses(
                  booking.status
                )}`}
              >
                {booking.status}
              </span>
            </div>

            <p className="mt-2 text-sm text-zinc-600">
              {booking.serviceSummary || "Service booking"}
            </p>

            <p className="mt-2 text-sm text-zinc-500">{visitProgressLabel}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 self-stretch sm:min-w-[320px]">
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Visits
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">
                {totalVisits}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Remaining
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">
                {remainingVisits}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Payout
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">
                {formatMoney(booking.sitterPayoutCents || 0)}
              </div>
            </div>
          </div>
        </div>

        <DetailCard title="Next action">
          {actionableVisit && canCompleteActionableVisit ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Ready now</p>
                <p className="mt-1 text-sm text-zinc-600">
                  You can complete this visit now.
                </p>
                <p className="mt-2 text-sm text-zinc-800">
                  {formatVisitDateTime(actionableVisit.startTime)}–
                  {formatTime(actionableVisit.endTime)}
                </p>
              </div>

              <CompleteVisitButton
                visitId={actionableVisit.id}
                nextVisitStartTime={nextUpcomingVisit?.startTime || null}
              />
            </div>
          ) : actionableVisit ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Not ready yet
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  This visit cannot be completed before it starts.
                </p>
                <p className="mt-2 text-sm font-medium text-zinc-800">
                  Available at {formatVisitDateTime(actionableVisit.startTime)}
                </p>
              </div>

              <button
                type="button"
                disabled
                title={`This visit becomes available at ${formatVisitDateTime(
                  actionableVisit.startTime
                )}.`}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-400 cursor-not-allowed"
              >
                Available at {formatTime(actionableVisit.startTime)}
              </button>
            </div>
          ) : nextUpcomingVisit ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">
                Not ready yet
              </p>
              <p className="text-sm text-zinc-600">
                Your next confirmed visit starts at:
              </p>
              <p className="text-sm font-medium text-zinc-800">
                {formatVisitDateTime(nextUpcomingVisit.startTime)}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">
                No immediate action
              </p>
              <p className="text-sm text-zinc-600">
                There are no confirmed visits left to complete for this booking.
              </p>
            </div>
          )}
        </DetailCard>

        <div className="border-t border-zinc-200 pt-6" />

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="space-y-6">
            <DetailCard title="Visit schedule">
              {visitGroups.length === 0 ? (
                <p className="text-sm text-zinc-600">No visits scheduled.</p>
              ) : (
                <div className="space-y-4">
                  {visitGroups.map((group) => (
                    <div
                      key={group.key}
                      className="rounded-xl border border-zinc-200"
                    >
                      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                        <div className="text-sm font-semibold text-zinc-900">
                          {group.label}
                        </div>
                      </div>

                      <div className="divide-y divide-zinc-200">
                        {group.visits.map((visit) => (
                          <div
                            key={visit.id}
                            className={`flex flex-col gap-3 px-4 py-4 transition sm:flex-row sm:items-center sm:justify-between ${
                              visit.id === highlightedVisitId
                                ? "bg-blue-50 ring-1 ring-blue-200"
                                : canCompleteVisit(visit, now)
                                ? "bg-emerald-50/60"
                                : ""
                            }`}
                          >
                            <div>
                              <div className="text-sm font-medium text-zinc-900">
                                {formatTime(visit.startTime)}–
                                {formatTime(visit.endTime)}
                              </div>

                              {visit.id === highlightedVisitId ? (
                                <span className="mt-1 inline-flex w-fit rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                  Next up
                                </span>
                              ) : null}

                              <div className="mt-1 text-xs text-zinc-500">
                                Visit ID: {visit.id}
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-2 sm:items-end">
                              <span
                                className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${getVisitStatusClasses(
                                  visit,
                                  now
                                )}`}
                              >
                                {getVisitStatusLabel(visit, now)}
                              </span>

                              {canCompleteVisit(visit, now) ? (
                                <form action={completeVisitAsSitter}>
                                  <input
                                    type="hidden"
                                    name="visitId"
                                    value={visit.id}
                                  />
                                  <button
                                    type="submit"
                                    className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                                  >
                                    Mark complete
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DetailCard>

            <DetailCard title="Location">
              {address ? (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-800">{address}</p>

                  {booking.accessInstructions ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Access instructions
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">
                        {booking.accessInstructions}
                      </p>
                    </div>
                  ) : null}

                  {booking.locationNotes ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Location notes
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">
                        {booking.locationNotes}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">
                  No service address saved for this booking.
                </p>
              )}
            </DetailCard>

            {(booking.notes || booking.petDetails) && (
              <DetailCard title="Visit notes">
                <div className="space-y-4">
                  {booking.petDetails ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Pet details
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">
                        {booking.petDetails}
                      </p>
                    </div>
                  ) : null}

                  {booking.notes ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Booking notes
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">
                        {booking.notes}
                      </p>
                    </div>
                  ) : null}
                </div>
              </DetailCard>
            )}
          </div>

          <div className="space-y-6">
            <DetailCard title="Client">
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Name
                  </div>
                  <div className="mt-1 text-zinc-800">
                    {booking.client?.name || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Email
                  </div>
                  <div className="mt-1 text-zinc-800">
                    {booking.client?.email || "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Phone
                  </div>
                  <div className="mt-1 text-zinc-800">
                    {booking.client?.phone || "—"}
                  </div>
                </div>
              </div>
            </DetailCard>

            <DetailCard title="Booking summary">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Service</span>
                  <span className="text-right font-medium text-zinc-800">
                    {booking.serviceSummary || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Status</span>
                  <span className="font-medium text-zinc-800">
                    {booking.status}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Remaining visits</span>
                  <span className="font-medium text-zinc-800">
                    {remainingVisits}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Completed visits</span>
                  <span className="font-medium text-zinc-800">
                    {completedVisits}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Canceled visits</span>
                  <span className="font-medium text-zinc-800">
                    {canceledVisits}
                  </span>
                </div>

                <div className="border-t border-zinc-200 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">Sitter payout</span>
                    <span className="text-sm font-medium text-zinc-800">
                      {formatMoney(booking.sitterPayoutCents || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </DetailCard>

            {booking.lineItems?.length > 0 ? (
              <CollapsibleCard title="Pricing details">
                <div className="space-y-3 pt-1">
                  {booking.lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-900">
                          {item.label || "Line item"}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Qty {item.quantity || 1}
                        </div>
                      </div>

                      <div className="mt-3 border-t border-zinc-200 pt-3 flex items-center justify-between">
                        <span className="text-sm text-zinc-500">Total</span>
                        <span className="text-sm font-semibold text-zinc-900">
                          {formatMoney(booking.clientTotalCents || 0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleCard>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
