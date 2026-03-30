// src/app/dashboard/sitter/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";

import StatCard from "./_components/StatCard";
import Section from "./_components/Section";
import SitterRoutePanel from "./_components/SitterRoutePanel";

import {
  formatMoney,
  formatDateTime,
  groupBookings,
  getRemainingVisitCountForToday,
  getUpcomingPayout,
  getCompletedThisWeekCount,
  getSitterMapBookings,
  getRemainingMapStops,
  getNextMapStop,
  getLastGraceStop,
  getBookingNextVisit,
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

  const sitterMapBookings = getSitterMapBookings(today, now);
  const remainingSitterMapBookings = getRemainingMapStops(
    sitterMapBookings,
    now
  );
  const nextUp = getNextMapStop(sitterMapBookings, now);
  const lastGraceStop = getLastGraceStop(sitterMapBookings, now);

  const defaultBooking =
    remainingSitterMapBookings.find((b) => b.id === nextUp?.id) ??
    remainingSitterMapBookings[0] ??
    null;

  const safeLastGraceStop =
    remainingSitterMapBookings.find((b) => b.id === lastGraceStop?.id) ?? null;

  const todayVisitCount = getRemainingVisitCountForToday(bookings, now);
  const upcomingPayout = getUpcomingPayout(bookings);
  const completedThisWeek = getCompletedThisWeekCount(bookings, now);

  const nextUpcomingBooking = upcoming[0] || null;
  const nextUpcomingVisit = nextUpcomingBooking
    ? getBookingNextVisit(nextUpcomingBooking, now)
    : null;

  const tomorrowCount = upcoming.filter((booking) => {
    const nextVisit = getBookingNextVisit(booking, now);
    if (!nextVisit) return false;

    const visitDate = new Date(nextVisit.startTime);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return visitDate.toDateString() === tomorrow.toDateString();
  }).length;

  const hasActiveRoute = remainingSitterMapBookings.length > 0;

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
            Your live route, next visits, and shift progress.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Remaining Today"
            value={todayVisitCount}
            subtext={
              todayVisitCount === 1
                ? "1 visit still active today"
                : "Visits still active today"
            }
          />

          <StatCard
            label="Next Visit"
            value={
              nextUp?.clientName
                ? nextUp.clientName
                : nextUpcomingVisit
                ? formatDateTime(nextUpcomingVisit.startTime)
                : "No upcoming visits"
            }
            subtext={
              nextUp?.nextVisitStart
                ? formatDateTime(nextUp.nextVisitStart)
                : nextUpcomingVisit
                ? "Next scheduled stop"
                : "Nothing queued right now"
            }
          />

          <StatCard
            label="Tomorrow"
            value={tomorrowCount}
            subtext={
              tomorrowCount === 1
                ? "1 booking starts tomorrow"
                : "Bookings starting tomorrow"
            }
          />

          <StatCard
            label="Upcoming Payout"
            value={formatMoney(upcomingPayout)}
            subtext={`Completed this week: ${completedThisWeek}`}
          />
        </section>

        {hasActiveRoute ? (
          <SitterRoutePanel
            bookings={remainingSitterMapBookings}
            defaultBooking={defaultBooking}
            lastGraceStop={safeLastGraceStop}
          />
        ) : (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Shift Status
            </div>

            <h2 className="mt-2 text-xl font-semibold text-zinc-900">
              All caught up for today
            </h2>

            <p className="mt-1 text-sm text-zinc-600">
              You have no remaining active stops today.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Next Upcoming Visit
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">
                  {nextUpcomingBooking?.client?.name || "No upcoming bookings"}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {nextUpcomingVisit
                    ? formatDateTime(nextUpcomingVisit.startTime)
                    : "You're clear for now"}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  This Week
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">
                  {completedThisWeek} completed
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  Finished bookings recorded this week
                </div>
              </div>
            </div>
          </section>
        )}

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
              description="Active and upcoming stops for the rest of today."
              bookings={today}
              view="today"
              nextUp={nextUp}
              emptyMessage="No remaining visits for today."
            />

            <Section
              title="Upcoming"
              description="What’s coming after today."
              bookings={upcoming}
              view="upcoming"
              emptyMessage="No upcoming bookings scheduled."
            />

            {completed.length > 0 ? (
              <Section
                title="Completed"
                description="Finished work from recent visits."
                bookings={completed}
                view="completed"
                emptyMessage="No completed bookings yet."
                muted
              />
            ) : null}

            {canceled.length > 0 ? (
              <Section
                title="Canceled"
                description="Bookings that are no longer active."
                bookings={canceled}
                view="canceled"
                emptyMessage="No canceled bookings."
                muted
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
