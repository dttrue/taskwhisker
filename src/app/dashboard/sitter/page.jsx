import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import { getSitterMapBookings } from "./lib/sitterDashboardUtils";
import { completeBookingAsSitter } from "./actions";

import SitterMap from "./_components/SitterMap";
import StatCard from "./_components/StatCard";
import Section from "./_components/Section";

import {
  formatMoney,
  formatDateTime,
  groupBookings,
  getNextUpBooking,
  getVisitCountForToday,
  getUpcomingPayout,
  getCompletedThisWeekCount,
} from "./lib/sitterDashboardUtils";

export default async function SitterDashboardPage() {
  const session = await requireRole(["SITTER"]);
  const userId = session.user?.id;
  
  if (!userId) {
    throw new Error("Missing user id in session for sitter.");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      sitterId: userId,
    },
    orderBy: { startTime: "asc" },
    include: {
      client: true,
      visits: {
        orderBy: { startTime: "asc" },
      },
    },
  });

  const now = new Date();
  const { today, upcoming, completed, canceled } = groupBookings(bookings, now);
  const nextUp = getNextUpBooking(bookings, now);
  const sitterMapBookings = getSitterMapBookings(today, now);
  const todayVisitCount = getVisitCountForToday(bookings, now);
  const upcomingPayout = getUpcomingPayout(bookings);
  const completedThisWeek = getCompletedThisWeekCount(bookings, now);

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Internal MVP
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Sitter Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            See what’s next, manage today’s work, and track your payout.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Today’s Visits"
            value={todayVisitCount}
            subtext="Visits scheduled for today"
          />
          <StatCard
            label="Upcoming Bookings"
            value={upcoming.length}
            subtext="Future assigned bookings"
          />
          <StatCard
            label="Completed This Week"
            value={completedThisWeek}
            subtext="Bookings marked complete"
          />
          <StatCard
            label="Upcoming Payout"
            value={formatMoney(upcomingPayout)}
            subtext="From confirmed assigned bookings"
          />
        </section>

        {nextUp ? (
          <section className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Next Up
            </div>

            <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {nextUp.booking.client?.name || "—"}
                </h2>
                <div className="mt-1 text-sm text-zinc-700">
                  {nextUp.booking.serviceSummary || "Drop-in visit"}
                </div>
                <div className="mt-2 text-sm font-medium text-blue-700">
                  {formatDateTime(nextUp.nextVisit.startTime)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {nextUp.booking.visits?.length || 0} visit
                  {nextUp.booking.visits?.length === 1 ? "" : "s"} in this
                  booking
                </div>
              </div>

              {sitterMapBookings.length > 0 ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-lg font-semibold text-zinc-900">
                      Today’s Route 🗺️
                    </h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      Your assigned visits for today.
                    </p>
                  </div>

                  <SitterMap bookings={sitterMapBookings} />
                </section>
              ) : null}

              <div className="text-left md:text-right">
                <div className="text-xs text-zinc-500">Payout</div>
                <div className="text-lg font-semibold text-zinc-900">
                  {formatMoney(nextUp.booking.sitterPayoutCents)}
                </div>

                <form action={completeBookingAsSitter} className="mt-3">
                  <input
                    type="hidden"
                    name="bookingId"
                    value={nextUp.booking.id}
                  />
                  <button
                    type="submit"
                    disabled={nextUp.booking.status !== "CONFIRMED"}
                    className={
                      nextUp.booking.status === "CONFIRMED"
                        ? "rounded-md border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                        : "cursor-not-allowed rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-400"
                    }
                  >
                    Mark complete
                  </button>
                </form>
              </div>
            </div>
          </section>
        ) : null}

        {bookings.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="p-6 text-sm text-zinc-600">
              No bookings assigned yet.
            </div>
          </section>
        ) : (
          <>
            <Section
              title="Today"
              description="Your bookings with visits scheduled today."
              bookings={today}
            />

            <Section
              title="Upcoming"
              description="Future assigned bookings."
              bookings={upcoming}
            />

            <Section
              title="Completed"
              description="Bookings you’ve already finished."
              bookings={completed}
            />

            <Section
              title="Canceled"
              description="Bookings that are no longer active."
              bookings={canceled}
            />
          </>
        )}
      </div>
    </main>
  );
}
