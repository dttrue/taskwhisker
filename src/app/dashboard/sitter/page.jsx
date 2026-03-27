// src/app/dashboard/sitter/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";

import StatCard from "./_components/StatCard";
import Section from "./_components/Section";
import SitterRoutePanel from "./_components/SitterRoutePanel";

import {
  formatMoney,
  groupBookings,
  getVisitCountForToday,
  getUpcomingPayout,
  getCompletedThisWeekCount,
  getSitterMapBookings,
  getRemainingMapStops,
  getNextMapStop,
  getLastGraceStop,
  hasRemainingTodayVisit,
  hasFutureVisit,
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

  const todayVisitCount = getVisitCountForToday(bookings, now);
  const upcomingPayout = getUpcomingPayout(bookings);
  const completedThisWeek = getCompletedThisWeekCount(bookings, now);

  const todayActive = today.filter((b) => hasRemainingTodayVisit(b, now));

  const todayMovedToUpcoming = today.filter(
    (b) => !hasRemainingTodayVisit(b, now) && hasFutureVisit(b, now)
  );

  const upcomingCombined = [...todayMovedToUpcoming, ...upcoming].filter(
    (b, i, arr) => arr.findIndex((x) => x.id === b.id) === i
  );

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

        {remainingSitterMapBookings.length ? (
          <SitterRoutePanel
            bookings={remainingSitterMapBookings}
            defaultBooking={defaultBooking}
            lastGraceStop={safeLastGraceStop}
          />
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
              description="Your remaining visits for today."
              bookings={todayActive}
            />

            <Section
              title="Upcoming"
              description="Future assigned bookings."
              bookings={upcomingCombined}
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
