// src/app/dashboard/operator/triage/page.jsx
import Link from "next/link";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import { bookingNeedsReview } from "../lib/bookingNeedsReview";
import { getBookingReliability } from "../lib/getBookingReliability";
import StatusBadge from "../booking-list/StatusBadge";

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
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <p className="text-sm font-medium text-zinc-600">
          {bookings.length === 0
            ? "✅ All issues resolved"
            : `${bookings.length} issue${
                bookings.length > 1 ? "s" : ""
              } remaining`}
        </p>
        <header className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Operator queue
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-red-950">
            Triage Queue
          </h1>
          <p className="mt-2 text-sm text-red-800">
            Bookings that need operator attention before normal workflow can
            continue.
          </p>
        </header>

        {triageBookings.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            No urgent booking issues right now.
          </section>
        ) : (
          <section className="space-y-3">
            {triageBookings.map((booking) => {
              const reliability = getBookingReliability(booking, now);
              const overdueVisits = booking.visits.filter((visit) => {
                if (visit.status !== "CONFIRMED") return false;
                const end = new Date(visit.endTime);
                return !Number.isNaN(end.getTime()) && end < now;
              });

              return (
                <article
                  key={booking.id}
                  className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-zinc-950">
                          {booking.client?.name || "Unknown client"}
                        </h2>
                        <StatusBadge status={booking.status} />
                      </div>

                      <p className="mt-1 text-sm text-zinc-600">
                        Sitter:{" "}
                        {booking.sitter?.name ||
                          booking.sitter?.email ||
                          "Unassigned"}
                      </p>

                      <p className="mt-1 text-sm font-medium text-red-700">
                        {overdueVisits.length} missed visit
                        {overdueVisits.length === 1 ? "" : "s"} need review
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        Next/first visit:{" "}
                        {booking.visits[0]?.startTime
                          ? formatDateTime(booking.visits[0].startTime)
                          : "No visits"}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900">
                        {reliability.label} · Score {reliability.score}
                      </span>

                      <Link
                        href={`/dashboard/operator/bookings/${booking.id}?review=needs-review`}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                      >
                        Review booking
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
