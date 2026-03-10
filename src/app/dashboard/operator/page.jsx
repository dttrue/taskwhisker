// src/app/dashboard/operator/page.jsx
import { requireRole } from "@/auth";
import {
  confirmBooking,
  cancelBooking,
  completeBooking,
} from "./bookings/actions";

import MetricsBar from "./_components/MetricsBar";
import DateRangeFilter from "./_components/DateRangeFilter";
import BookingsTable from "./_components/BookingsTable";

import { resolveStatus, resolveDateRange } from "./lib/dashboardQuery";
import { getOperatorDashboardData } from "./lib/dashboardData";

function formatDateOnly(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getTodayVisitCount(bookings, now = new Date()) {
  return bookings.reduce((count, booking) => {
    const todayVisits =
      booking.visits?.filter((visit) =>
        isSameDay(new Date(visit.startTime), now)
      ) || [];

    return count + todayVisits.length;
  }, 0);
}

function getConfirmedRevenue(bookings) {
  return bookings
    .filter((b) => b.status === "CONFIRMED")
    .reduce((sum, b) => sum + (b.clientTotalCents || 0), 0);
}

function getBookingNextVisit(booking, now = new Date()) {
  if (!booking?.visits?.length) return null;

  return (
    booking.visits.find((visit) => new Date(visit.endTime) >= now) ||
    booking.visits[0]
  );
}

function groupBookings(bookings, now = new Date()) {
  const requested = [];
  const today = [];
  const upcoming = [];
  const completed = [];
  const canceled = [];

  for (const booking of bookings) {
    if (booking.status === "REQUESTED") {
      requested.push(booking);
      continue;
    }

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

  return { requested, today, upcoming, completed, canceled };
}

function getNeedsAttentionBooking(bookings, now = new Date()) {
  const priorityPool = bookings
    .filter(
      (b) =>
        b.status === "REQUESTED" || (b.status === "CONFIRMED" && !b.sitterId)
    )
    .map((booking) => ({
      booking,
      nextVisit: getBookingNextVisit(booking, now),
    }));

  priorityPool.sort((a, b) => {
    const aTime = a.nextVisit
      ? new Date(a.nextVisit.startTime).getTime()
      : new Date(a.booking.startTime).getTime();

    const bTime = b.nextVisit
      ? new Date(b.nextVisit.startTime).getTime()
      : new Date(b.booking.startTime).getTime();

    return aTime - bTime;
  });

  return priorityPool[0] || null;
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

function Section({
  title,
  description,
  bookings,
  confirmBooking,
  cancelBooking,
  completeBooking,
  listQs,
  maxVisible = 2,
  collapsedByDefault = false,
  viewAllHref = "",
}) {
  if (!bookings?.length) return null;

  const visibleBookings = collapsedByDefault
    ? []
    : bookings.slice(0, maxVisible);
  const hiddenCount = Math.max(bookings.length - visibleBookings.length, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-zinc-600">{description}</p>
          ) : null}
        </div>

        <div className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
          {bookings.length}
        </div>
      </div>

      {collapsedByDefault ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-zinc-600">
            {bookings.length} booking{bookings.length === 1 ? "" : "s"} hidden
            in this section.
          </div>

          {viewAllHref ? (
            <a
              href={viewAllHref}
              className="mt-3 inline-flex text-sm font-medium text-zinc-700 underline hover:text-zinc-900"
            >
              View all {title.toLowerCase()}
            </a>
          ) : null}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <BookingsTable
              bookings={visibleBookings}
              confirmBooking={confirmBooking}
              cancelBooking={cancelBooking}
              completeBooking={completeBooking}
              listQs={listQs}
            />
          </div>

          {(hiddenCount > 0 || viewAllHref) && (
            <div className="flex items-center justify-between px-1">
              <div className="text-xs text-zinc-500">
                Showing {visibleBookings.length} of {bookings.length}
              </div>

              {viewAllHref ? (
                <a
                  href={viewAllHref}
                  className="text-sm font-medium text-zinc-700 underline hover:text-zinc-900"
                >
                  View all
                </a>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default async function OperatorDashboard({ searchParams }) {
  const session = await requireRole(["OPERATOR"]);
  const operatorId = session.user.id;

  const sp = await Promise.resolve(searchParams);

  const { from, to, isDefault } = resolveDateRange(sp);
  const hasRange = !isDefault;

  const status = resolveStatus(sp);

  const { bookings, metrics } = await getOperatorDashboardData({
    operatorId,
    status,
    from,
    to,
  });

  const fromStr = formatDateOnly(from);
  const toStr = formatDateOnly(to);

  const hrefForStatus = (s) => {
    const u = new URLSearchParams();
    if (s !== "ALL") u.set("status", s);
    if (fromStr) u.set("from", fromStr);
    if (toStr) u.set("to", toStr);
    const qs = u.toString();
    return qs ? `/dashboard/operator?${qs}` : "/dashboard/operator";
  };

  const hrefForSectionStatus = (sectionStatus) => {
    const u = new URLSearchParams();
    if (sectionStatus && sectionStatus !== "ALL") {
      u.set("status", sectionStatus);
    }
    if (fromStr) u.set("from", fromStr);
    if (toStr) u.set("to", toStr);
    const qs = u.toString();
    return qs ? `/dashboard/operator?${qs}` : "/dashboard/operator";
  };

  const u = new URLSearchParams();
  if (status !== "ALL") u.set("status", status);
  if (fromStr) u.set("from", fromStr);
  if (toStr) u.set("to", toStr);
  const listQs = u.toString();

  const overviewHref = listQs
    ? `/dashboard/operator?${listQs}`
    : "/dashboard/operator";

  const now = new Date();
  const { requested, today, upcoming, completed, canceled } = groupBookings(
    bookings,
    now
  );

  const todayVisitCount = getTodayVisitCount(bookings, now);
  const confirmedRevenue = getConfirmedRevenue(bookings);
  const unassignedCount = bookings.filter((b) => !b.sitterId).length;
  const needsAttention = getNeedsAttentionBooking(bookings, now);

  const showGroupedDashboard = status === "ALL";

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Internal MVP
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Operator Dashboard
          </h1>
          <p className="text-sm text-zinc-600">
            Signed in as{" "}
            <span className="font-medium">{session.user.email}</span> ·{" "}
            <span className="uppercase text-xs tracking-wide">
              {session.user.role}
            </span>
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Requested"
            value={metrics?.REQUESTED?.count ?? 0}
            subtext="Bookings waiting for action"
          />
          <StatCard
            label="Unassigned"
            value={unassignedCount}
            subtext="Bookings without a sitter"
          />
          <StatCard
            label="Today's Visits"
            value={todayVisitCount}
            subtext="Visits scheduled for today"
          />
          <StatCard
            label="Confirmed Revenue"
            value={formatMoney(confirmedRevenue)}
            subtext="From confirmed bookings"
          />
        </section>

        {showGroupedDashboard && needsAttention ? (
          <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Needs Attention
            </div>

            <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {needsAttention.booking.client?.name || "—"}
                </h2>
                <div className="mt-1 text-sm text-zinc-700">
                  {needsAttention.booking.serviceSummary || "Booking"}
                </div>
                <div className="mt-2 text-sm font-medium text-amber-700">
                  {needsAttention.booking.status === "REQUESTED"
                    ? "Awaiting confirmation"
                    : "Confirmed but still unassigned"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {needsAttention.booking.visits?.length || 0} visit
                  {needsAttention.booking.visits?.length === 1
                    ? ""
                    : "s"} •{" "}
                  {needsAttention.booking.sitter?.name ||
                    needsAttention.booking.sitter?.email ||
                    "Unassigned"}
                </div>
              </div>

              <div className="text-left md:text-right">
                <div className="text-xs text-zinc-500">Client Total</div>
                <div className="text-lg font-semibold text-zinc-900">
                  {formatMoney(needsAttention.booking.clientTotalCents)}
                </div>
                <a
                  href={
                    listQs
                      ? `/dashboard/operator/bookings/${needsAttention.booking.id}?${listQs}`
                      : `/dashboard/operator/bookings/${needsAttention.booking.id}`
                  }
                  className="mt-3 inline-flex rounded-md border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-600 hover:text-white"
                >
                  Review Booking
                </a>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-4 border-b border-zinc-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-zinc-900">
              {hasRange
                ? "Filtered bookings"
                : showGroupedDashboard
                ? "Bookings overview"
                : "Bookings"}
            </h2>

            <DateRangeFilter from={fromStr} to={toStr} />
          </div>

          <div className="p-4 border-b border-zinc-200">
            <MetricsBar
              metrics={metrics}
              active={status}
              hrefForStatus={hrefForStatus}
            />
          </div>

          {!showGroupedDashboard ? (
            <BookingsTable
              bookings={bookings}
              confirmBooking={confirmBooking}
              cancelBooking={cancelBooking}
              completeBooking={completeBooking}
              listQs={listQs}
            />
          ) : (
            <div className="p-4 space-y-6">
              <Section
                title="Requested"
                description="New bookings waiting to be confirmed or reviewed."
                bookings={requested}
                confirmBooking={confirmBooking}
                cancelBooking={cancelBooking}
                completeBooking={completeBooking}
                listQs={listQs}
                maxVisible={2}
                viewAllHref={hrefForSectionStatus("REQUESTED")}
              />

              <Section
                title="Today"
                description="Bookings with visits scheduled today."
                bookings={today}
                confirmBooking={confirmBooking}
                cancelBooking={cancelBooking}
                completeBooking={completeBooking}
                listQs={listQs}
                maxVisible={2}
                viewAllHref={overviewHref}
              />

              <Section
                title="Upcoming"
                description="Future confirmed and scheduled bookings."
                bookings={upcoming}
                confirmBooking={confirmBooking}
                cancelBooking={cancelBooking}
                completeBooking={completeBooking}
                listQs={listQs}
                maxVisible={2}
                viewAllHref={overviewHref}
              />

              <Section
                title="Completed"
                description="Bookings that have already been finished."
                bookings={completed}
                confirmBooking={confirmBooking}
                cancelBooking={cancelBooking}
                completeBooking={completeBooking}
                listQs={listQs}
                maxVisible={1}
                collapsedByDefault={true}
                viewAllHref={hrefForSectionStatus("COMPLETED")}
              />

              <Section
                title="Canceled"
                description="Bookings that are no longer active."
                bookings={canceled}
                confirmBooking={confirmBooking}
                cancelBooking={cancelBooking}
                completeBooking={completeBooking}
                listQs={listQs}
                maxVisible={1}
                collapsedByDefault={true}
                viewAllHref={hrefForSectionStatus("CANCELED")}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
