// src/app/dashboard/operator/triage/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import { bookingNeedsReview } from "../lib/bookingNeedsReview";
import { getBookingReliability } from "../lib/getBookingReliability";
import BookingStatusBadge from "../booking-list/StatusBadge";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";
import {
  Button,
  Card,
  Eyebrow,
  Notice,
  StatusBadge,
} from "@/components/ui/Foundation";

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

export default async function OperatorTriagePage() {
  await requireRole(["OPERATOR"]);

  const now = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      status: {
        in: ["REQUESTED", "CONFIRMED"],
      },
    },
    include: {
      client: true,
      sitter: true,
      visits: {
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
      history: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const triageBookings = bookings
    .filter((booking) => bookingNeedsReview(booking, now))
    .sort((a, b) => {
      const aReliability = getBookingReliability(a, now);
      const bReliability = getBookingReliability(b, now);

      return aReliability.score - bReliability.score;
    });

  return (
    <main className="min-h-screen bg-[var(--task-canvas)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <Eyebrow>Operator review</Eyebrow>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[var(--task-text)] sm:text-4xl">
            Triage
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--task-text-muted)] sm:text-base">
            Review unresolved missed-visit incidents.
          </p>
        </header>

        {triageBookings.length === 0 ? (
          <Notice title="All caught up" tone="success" className="max-w-2xl">
            There are no missed-visit reviews waiting for you.
          </Notice>
        ) : (
          <section className="space-y-4" aria-labelledby="triage-queue-heading">
            <Notice title="Needs review" tone="warning">
              <span id="triage-queue-heading">
                {triageBookings.length} booking
                {triageBookings.length === 1 ? "" : "s"} with missed-visit
                incidents require operator review.
              </span>
            </Notice>

            <div className="grid gap-3">
              {triageBookings.map((booking) => {
                const reliability = getBookingReliability(booking, now);
                const overdueVisits = booking.visits.filter((visit) => {
                  if (visit.status !== "CONFIRMED") return false;
                  const end = new Date(visit.endTime);
                  return !Number.isNaN(end.getTime()) && end < now;
                });
                const unresolvedHistoryCount = booking.history.filter(
                  (entry) =>
                    entry.note?.toLowerCase().includes("missed visit") &&
                    !entry.missedVisitReviewStatus
                ).length;
                const petDisplayName = formatBookingPetNames(
                  booking.petNames,
                  booking.serviceSummary || "Pet care booking"
                );
                const showServiceContext =
                  Boolean(booking.serviceSummary) &&
                  booking.serviceSummary !== petDisplayName;

                return (
                  <Card
                    key={booking.id}
                    as="article"
                    className="p-5 shadow-none"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-lg font-bold tracking-[-0.02em] text-[var(--task-text)]">
                            {petDisplayName}
                          </h2>
                          <BookingStatusBadge status={booking.status} />
                        </div>

                        {showServiceContext ? (
                          <p className="mt-1 break-words text-sm text-zinc-600">
                            {booking.serviceSummary}
                          </p>
                        ) : null}

                        <p className="mt-1 break-words text-sm text-zinc-500">
                          Owner: {booking.client?.name || "Client"}
                        </p>

                        <p className="mt-1 text-sm text-zinc-600">
                          Sitter:{" "}
                          {booking.sitter?.name ||
                            booking.sitter?.email ||
                            "Unassigned"}
                        </p>

                        <div className="mt-3 space-y-1 text-sm font-semibold text-[#704c16]">
                          {unresolvedHistoryCount > 0 ? (
                            <p>
                              {unresolvedHistoryCount} missed-visit review
                              {unresolvedHistoryCount === 1 ? "" : "s"}{" "}
                              unresolved
                            </p>
                          ) : null}
                          {overdueVisits.length > 0 ? (
                            <p>
                              {overdueVisits.length} overdue confirmed visit
                              {overdueVisits.length === 1 ? "" : "s"} need
                              {overdueVisits.length === 1 ? "s" : ""} review
                            </p>
                          ) : null}
                        </div>

                        <p className="mt-2 text-xs text-zinc-500">
                          Next/first visit:{" "}
                          {booking.visits[0]?.startTime
                            ? formatDateTime(booking.visits[0].startTime)
                            : "No visits"}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                        <StatusBadge tone="warning">
                          {reliability.label} · Score {reliability.score}
                        </StatusBadge>

                        <Button
                          href={`/dashboard/operator/bookings/${booking.id}?review=needs-review&mode=triage`}
                          className="w-full sm:w-auto"
                        >
                          Review booking
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
