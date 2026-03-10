import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import { completeBookingAsSitter } from "./actions";

import {
  STATUS_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_PILL_CLASSES,
  STATUS_CARD_BORDER_CLASSES,
} from "@/lib/statusStyles";

function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getBookingNextVisit(booking, now = new Date()) {
  if (!booking?.visits?.length) return null;

  return (
    booking.visits.find((visit) => new Date(visit.endTime) >= now) ||
    booking.visits[0]
  );
}

function getVisitSummaryLines(visits = []) {
  if (!visits.length) return ["No visits scheduled"];

  return visits.slice(0, 3).map((visit) => {
    const start = new Date(visit.startTime);
    const end = new Date(visit.endTime);

    return `${start.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    })} • ${formatTime(start)}–${formatTime(end)}`;
  });
}

function getVisitCountForToday(bookings, now = new Date()) {
  return bookings.reduce((count, booking) => {
    const todayVisits =
      booking.visits?.filter((visit) =>
        isSameDay(new Date(visit.startTime), now)
      ) || [];
    return count + todayVisits.length;
  }, 0);
}

function getUpcomingPayout(bookings) {
  return bookings
    .filter((b) => b.status === "CONFIRMED")
    .reduce((sum, b) => sum + (b.sitterPayoutCents || 0), 0);
}

function getCompletedThisWeekCount(bookings, now = new Date()) {
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  return bookings.filter((booking) => {
    if (booking.status !== "COMPLETED") return false;
    const completedAt = booking.updatedAt ? new Date(booking.updatedAt) : null;
    return completedAt && completedAt >= startOfWeek;
  }).length;
}

function groupBookings(bookings, now = new Date()) {
  const today = [];
  const upcoming = [];
  const completed = [];
  const canceled = [];

  for (const booking of bookings) {
    if (booking.status === "COMPLETED") {
      completed.push(booking);
      continue;
    }

    if (booking.status === "CANCELED") {
      canceled.push(booking);
      continue;
    }

    const hasVisitToday =
      booking.visits?.some((visit) =>
        isSameDay(new Date(visit.startTime), now)
      ) || false;

    if (hasVisitToday) {
      today.push(booking);
    } else {
      upcoming.push(booking);
    }
  }

  return { today, upcoming, completed, canceled };
}

function getNextUpBooking(bookings, now = new Date()) {
  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");

  const withNextVisit = confirmed
    .map((booking) => ({
      booking,
      nextVisit: getBookingNextVisit(booking, now),
    }))
    .filter((item) => item.nextVisit);

  withNextVisit.sort(
    (a, b) =>
      new Date(a.nextVisit.startTime).getTime() -
      new Date(b.nextVisit.startTime).getTime()
  );

  return withNextVisit[0] || null;
}

function StatCard({ label, value, subtext }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900">{value}</div>
      {subtext ? (
        <div className="mt-1 text-xs text-zinc-500">{subtext}</div>
      ) : null}
    </div>
  );
}

function BookingCard({ booking }) {
  const nextVisit = getBookingNextVisit(booking);
  const visitLines = getVisitSummaryLines(booking.visits);

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        STATUS_CARD_BORDER_CLASSES[booking.status] || "border-zinc-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">
            {booking.client?.name || "—"}
          </div>

          <div className="mt-1 text-xs text-zinc-600">
            {booking.serviceSummary || "Drop-in visit"}
          </div>

          {nextVisit ? (
            <div className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              Next visit: {formatDateTime(nextVisit.startTime)}
            </div>
          ) : null}

          <div className="mt-3 space-y-1">
            {visitLines.map((line, index) => (
              <div key={index} className="text-xs text-zinc-500">
                {line}
              </div>
            ))}
            {booking.visits?.length > 3 ? (
              <div className="text-xs text-zinc-400">
                +{booking.visits.length - 3} more visit
                {booking.visits.length - 3 === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>

          <div className="mt-3 text-xs text-zinc-500">
            {booking.visits?.length || 0} visit
            {booking.visits?.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="inline-flex items-center gap-1 justify-end">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                STATUS_DOT_CLASSES[booking.status] || "bg-zinc-400"
              }`}
            />
            <span className="text-xs font-semibold text-zinc-800">
              {STATUS_LABELS[booking.status] || booking.status}
            </span>
          </div>

          <div className="mt-3 text-xs text-zinc-500">Payout</div>
          <div className="text-sm font-semibold text-zinc-900">
            {formatMoney(booking.sitterPayoutCents)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <form action={completeBookingAsSitter}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <button
            type="submit"
            disabled={booking.status !== "CONFIRMED"}
            className={
              booking.status === "CONFIRMED"
                ? "rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                : "cursor-not-allowed rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-400"
            }
          >
            Mark complete
          </button>
        </form>
      </div>
    </div>
  );
}

function BookingTable({ bookings }) {
  return (
    <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-zinc-200">
            <th className="p-3">Client</th>
            <th className="p-3">Service</th>
            <th className="p-3">Next Visit</th>
            <th className="p-3">Visits</th>
            <th className="p-3">Status</th>
            <th className="p-3">Payout</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => {
            const nextVisit = getBookingNextVisit(booking);

            return (
              <tr
                key={booking.id}
                className="border-b border-zinc-100 align-top"
              >
                <td className="p-3 font-medium text-zinc-900">
                  {booking.client?.name || "—"}
                </td>
                <td className="p-3 text-zinc-700">
                  {booking.serviceSummary || "Drop-in visit"}
                </td>
                <td className="p-3 text-zinc-700">
                  {nextVisit ? formatDateTime(nextVisit.startTime) : "—"}
                </td>
                <td className="p-3">
                  <div className="text-sm text-zinc-900">
                    {booking.visits?.length || 0} visit
                    {booking.visits?.length === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 space-y-1">
                    {getVisitSummaryLines(booking.visits).map((line, index) => (
                      <div key={index} className="text-xs text-zinc-500">
                        {line}
                      </div>
                    ))}
                    {booking.visits?.length > 3 ? (
                      <div className="text-xs text-zinc-400">
                        +{booking.visits.length - 3} more
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="p-3">
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
                    <span>
                      {STATUS_LABELS[booking.status] || booking.status}
                    </span>
                  </span>
                </td>
                <td className="p-3 whitespace-nowrap font-medium text-zinc-900">
                  {formatMoney(booking.sitterPayoutCents)}
                </td>
                <td className="p-3 text-right">
                  <form action={completeBookingAsSitter}>
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button
                      type="submit"
                      disabled={booking.status !== "CONFIRMED"}
                      className={
                        booking.status === "CONFIRMED"
                          ? "rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                          : "cursor-not-allowed rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-400"
                      }
                    >
                      Mark complete
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, description, bookings }) {
  if (!bookings.length) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        ) : null}
      </div>

      <div className="md:hidden space-y-3">
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </div>

      <BookingTable bookings={bookings} />
    </section>
  );
}

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
