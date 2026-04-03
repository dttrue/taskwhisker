// src/app/dashboard/sitter/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";

import StatCard from "./_components/StatCard";
import VisitHistorySection from "./_components/VisitHistorySection";
import UpcomingVisitsSection from "./_components/UpcomingVisitsSection.jsx";
import SitterRoutePanel from "./_components/SitterRoutePanel";
import TodayVisitsSection from "./_components/TodayVisitsSection";

import {
  formatMoney,
  formatDateTime,
  groupBookings,
  getRemainingVisitCountForToday,
  getRemainingPayoutForToday,
  getCompletedThisWeekCount,
  getSitterMapBookings,
  getRemainingMapStops,
  getNextMapStop,
  getLastGraceStop,
  getRemainingTodayVisitEntries,
  getUpcomingVisitEntries,
  getCompletedVisitEntries,
  getCanceledVisitEntries,
  serializeVisitEntry,
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
  const { today } = groupBookings(bookings, now);

  const todayVisitEntries = getRemainingTodayVisitEntries(bookings, now).map(
    (entry) => serializeVisitEntry(entry)
  );

  const upcomingVisitEntries = getUpcomingVisitEntries(bookings, now).map(
    (entry) => serializeVisitEntry(entry)
  );

  const completedVisitEntries = getCompletedVisitEntries(bookings).map(
    (entry) => serializeVisitEntry(entry)
  );

  const canceledVisitEntries = getCanceledVisitEntries(bookings).map((entry) =>
    serializeVisitEntry(entry)
  );

  const completedVisitCount = completedVisitEntries.length;
  const canceledVisitCount = canceledVisitEntries.length;

  const sitterMapBookings = getSitterMapBookings(today, now);
  const remainingSitterMapBookings = getRemainingMapStops(
    sitterMapBookings,
    now
  );
  const nextUp = getNextMapStop(sitterMapBookings, now);
  const lastGraceStop = getLastGraceStop(sitterMapBookings, now);
  const hasActiveRoute = remainingSitterMapBookings.length > 0;

  const defaultBooking =
    remainingSitterMapBookings.find((b) => b.id === nextUp?.id) ??
    remainingSitterMapBookings[0] ??
    null;

  const safeLastGraceStop =
    remainingSitterMapBookings.find((b) => b.id === lastGraceStop?.id) ?? null;

  const todayVisitCount = getRemainingVisitCountForToday(bookings, now);
  const remainingTodayPayout = getRemainingPayoutForToday(bookings, now);
  const completedThisWeek = getCompletedThisWeekCount(bookings, now);

  const nextUpcomingVisit =
    bookings
      .flatMap((b) => b.visits || [])
      .filter((v) => {
        if (v.status === "COMPLETED" || v.status === "CANCELED") return false;
        return new Date(v.startTime) > now;
      })
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0] || null;

  const nextUpcomingBooking = nextUpcomingVisit
    ? bookings.find((b) => b.visits?.some((v) => v.id === nextUpcomingVisit.id))
    : null;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tomorrowCount = bookings.reduce((count, booking) => {
    const visits =
      booking.visits?.filter((visit) => {
        if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
          return false;
        }

        const start = new Date(visit.startTime);
        if (Number.isNaN(start.getTime())) return false;

        return start.toDateString() === tomorrow.toDateString();
      }) || [];

    return count + visits.length;
  }, 0);

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
            label="Remaining Stops Today"
            value={todayVisitCount}
            subtext={
              todayVisitCount === 1
                ? "1 stop still active today"
                : "Stops still active today"
            }
          />

          <StatCard
            label="Next Stop"
            value={
              nextUp?.clientName
                ? nextUp.clientName
                : nextUpcomingVisit
                ? formatDateTime(nextUpcomingVisit.startTime)
                : "No upcoming stops"
            }
            subtext={
              nextUp?.nextVisitStart
                ? `Scheduled for ${formatDateTime(nextUp.nextVisitStart)}`
                : nextUpcomingVisit
                ? "Next scheduled visit"
                : "Nothing queued right now"
            }
          />

          <StatCard
            label="Tomorrow’s Visits"
            value={tomorrowCount}
            subtext={
              tomorrowCount === 1
                ? "1 visit scheduled tomorrow"
                : "Visits scheduled tomorrow"
            }
          />

          <StatCard
            label="Estimated Remaining Payout"
            value={formatMoney(remainingTodayPayout)}
            subtext={
              todayVisitCount === 1
                ? "Estimated from 1 remaining stop"
                : "Estimated from remaining stops today"
            }
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
            <TodayVisitsSection visits={todayVisitEntries} now={now} />

            <UpcomingVisitsSection visits={upcomingVisitEntries} now={now} />

            {completedVisitEntries.length > 0 ? (
              <VisitHistorySection
                title="Completed"
                description={`${completedVisitCount} completed visit${
                  completedVisitCount === 1 ? "" : "s"
                }.`}
                visits={completedVisitEntries}
                now={now}
                emptyMessage="No completed visits yet."
              />
            ) : null}

            {canceledVisitEntries.length > 0 ? (
              <VisitHistorySection
                title="Canceled"
                description={`${canceledVisitCount} canceled visit${
                  canceledVisitCount === 1 ? "" : "s"
                }.`}
                visits={canceledVisitEntries}
                now={now}
                emptyMessage="No canceled visits."
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
