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
import OperatorMap from "./_components/OperatorMap";

import CollapsibleCard from "@/components/ui/CollapsibleCard";
import { resolveStatus, resolveDateRange } from "./lib/dashboardQuery";
import { getOperatorDashboardData } from "./lib/dashboardData";
import {
  formatDateOnly,
  formatMoney,
  getTodayVisitCount,
  getConfirmedRevenue,
  groupBookings,
  getNeedsAttentionBooking,
} from "./lib/dashboardUtils";
import { bookingNeedsReview } from "./lib/bookingNeedsReview";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";
import {
  Button,
  Card,
  PageHeader,
  PageShell,
} from "@/components/ui/Foundation";




function StatCard({ label, value, subtext, tone = "neutral" }) {
  return (
    <Card
      className={`min-w-0 p-4 shadow-sm ${
        tone === "warning" ? "border-[#ead9ad] bg-[var(--task-warning-soft)]" : ""
      }`}
    >
      <div className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--task-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-[var(--task-text)]">{value}</div>
      {subtext ? (
        <div className="mt-1 text-xs leading-5 text-[var(--task-text-muted)]">
          {subtext}
        </div>
      ) : null}
    </Card>
  );
}

function toClientValue(value) {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map(toClientValue);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if (typeof value.toNumber === "function") {
      return value.toNumber();
    }

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = toClientValue(val);
    }

    return out;
  }

  return value;
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
    <CollapsibleCard
      title={`${title} (${bookings.length})`}
      defaultOpen={!collapsedByDefault}
    >
      <div className="space-y-3">
        {description ? (
          <p className="text-sm text-zinc-600">{description}</p>
        ) : null}

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
            <div className="rounded-lg border border-zinc-200 bg-white">
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
      </div>
    </CollapsibleCard>
  );
}

export default async function OperatorDashboard({ searchParams }) {
  const session = await requireRole(["OPERATOR"]);
  const operatorId = session.user.id;

  const sp = await Promise.resolve(searchParams);

  const { from, to, isDefault } = resolveDateRange(sp);
  const hasRange = !isDefault;

  const status = resolveStatus(sp);
  const review = sp?.review || "all";

  const {
    bookings: rawBookings,
    metrics,
    mapBookings,
  } = await getOperatorDashboardData({
    operatorId,
    status,
    from,
    to,
  });

  const allBookings = toClientValue(rawBookings);
  const now = new Date();
  const needsReviewCount = allBookings.filter((b) =>
    bookingNeedsReview(b, now)
  ).length;

  const bookings =
    review === "needs-review"
      ? allBookings.filter((b) => bookingNeedsReview(b, now))
      : allBookings;
  
  const filteredBookingCount = bookings.length;    

  const fromStr = formatDateOnly(from);
  const toStr = formatDateOnly(to);

  const addSharedParams = (u) => {
    if (fromStr) u.set("from", fromStr);
    if (toStr) u.set("to", toStr);
    if (review && review !== "all") u.set("review", review);
  };

  const hrefForStatus = (s) => {
    const u = new URLSearchParams();

    if (s !== "ALL") u.set("status", s);
    addSharedParams(u);

    const qs = u.toString();
    return qs ? `/dashboard/operator?${qs}` : "/dashboard/operator";
  };

  const hrefForSectionStatus = (sectionStatus) => {
    const u = new URLSearchParams();

    if (sectionStatus && sectionStatus !== "ALL") {
      u.set("status", sectionStatus);
    }

    addSharedParams(u);

    const qs = u.toString();
    return qs ? `/dashboard/operator?${qs}` : "/dashboard/operator";
  };

  const u = new URLSearchParams();

  if (status !== "ALL") u.set("status", status);
  addSharedParams(u);

  const listQs = u.toString();

  const overviewHref = listQs
    ? `/dashboard/operator?${listQs}`
    : "/dashboard/operator";

  

  const { requested, today, upcoming, completed, canceled } = groupBookings(
    bookings,
    now
  );

  const confirmed = bookings.filter(
    (booking) => booking.status === "CONFIRMED"
  );

  const todayVisitCount = getTodayVisitCount(bookings, now);
  const confirmedRevenue = getConfirmedRevenue(bookings);
  const unassignedCount = bookings.filter((b) => !b.sitterId).length;
  const needsAttention = getNeedsAttentionBooking(bookings, now);
  const needsAttentionPetDisplayName = needsAttention
    ? formatBookingPetNames(
        needsAttention.booking.petNames,
        needsAttention.booking.serviceSummary || "Pet care booking"
      )
    : null;
  const showNeedsAttentionService = Boolean(
    needsAttention?.booking.serviceSummary &&
      needsAttention.booking.serviceSummary !== needsAttentionPetDisplayName
  );
  const showGroupedDashboard = status === "ALL";

  return (
    <PageShell
      className="py-6 sm:py-8"
      containerClassName="max-w-[1360px]"
    >
      <div className="space-y-6 lg:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <PageHeader
            eyebrow="Business overview"
            title="Operator Dashboard"
            description={`Signed in as ${session.user.email} · ${session.user.role}`}
          />
          {needsReviewCount > 0 ? (
            <Button href="/dashboard/operator/triage" variant="danger">
              {needsReviewCount} need review
            </Button>
          ) : null}
        </div>

        <section
          aria-label="Operator business summary"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatCard
            label="Needs Attention"
            value={needsReviewCount}
            subtext="Missed visits awaiting review"
            tone={needsReviewCount > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Visits Today"
            value={todayVisitCount}
            subtext="Visits scheduled for today"
          />
          <StatCard
            label="Unassigned"
            value={unassignedCount}
            subtext="Bookings without a sitter"
          />
          <StatCard
            label="Requested"
            value={metrics?.REQUESTED?.count ?? 0}
            subtext="Bookings waiting for action"
          />
        </section>

        <Card className="overflow-hidden border-[#9fbdae] !bg-[var(--task-primary)] !text-white shadow-[var(--task-shadow-card)]">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-8">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">
                Daily Operations
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                Run today&apos;s schedule
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
                Monitor visits, assignments, sitter workload, routes, and
                operational interventions from one live workspace.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/90">
                <span>{todayVisitCount} visits today</span>
                <span>{unassignedCount} unassigned bookings</span>
                <span>{needsReviewCount} needing review</span>
              </div>
            </div>
            <Button
              href="/dashboard/operator/operations"
              variant="secondary"
              className="w-full border-white/70 sm:w-auto"
            >
              Open Operations Center
            </Button>
          </div>
        </Card>

        {showGroupedDashboard && needsAttention ? (
          <Card className="border-[#ead9ad] bg-[var(--task-warning-soft)] p-5 sm:p-6">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#704c16]">
              Needs Attention
            </div>

            <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-bold text-[var(--task-text)]">
                  {needsAttentionPetDisplayName}
                </h2>

                {showNeedsAttentionService ? (
                  <div className="mt-1 break-words text-sm text-[var(--task-text-muted)]">
                    {needsAttention.booking.serviceSummary}
                  </div>
                ) : null}

                <div className="mt-1 break-words text-sm text-[var(--task-text-muted)]">
                  Owner: {needsAttention.booking.client?.name || "Client"}
                </div>

                <div className="mt-2 text-sm font-semibold text-[#704c16]">
                  {needsAttention.booking.status === "REQUESTED"
                    ? "Awaiting confirmation"
                    : "Confirmed but still unassigned"}
                </div>

                <div className="mt-1 text-xs text-[var(--task-text-muted)]">
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
                <div className="text-xs text-[var(--task-text-muted)]">Client Total</div>

                <div className="text-lg font-bold text-[var(--task-text)]">
                  {formatMoney(needsAttention.booking.clientTotalCents)}
                </div>

                <Button
                  href={
                    listQs
                      ? `/dashboard/operator/bookings/${needsAttention.booking.id}?${listQs}`
                      : `/dashboard/operator/bookings/${needsAttention.booking.id}`
                  }
                  variant="secondary"
                  className="mt-3"
                >
                  Review Booking
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--task-border)] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
                {hasRange || review !== "all"
                  ? "Filtered bookings"
                  : showGroupedDashboard
                  ? "Bookings overview"
                  : "Bookings"}
              </h2>

              <p className="mt-1 text-sm text-[var(--task-text-muted)]">
                {filteredBookingCount} booking{filteredBookingCount === 1 ? "" : "s"} shown · {formatMoney(confirmedRevenue)} confirmed revenue
              </p>

              {review === "needs-review" ? (
                <p className="mt-1 text-xs font-semibold text-[#704c16]">
                  Showing bookings with missed visits that still need operator
                  review.
                </p>
              ) : null}
            </div>

            <DateRangeFilter from={fromStr} to={toStr} review={review} />
          </div>

          <div className="border-b border-[var(--task-border)] p-4 sm:px-5">
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
            <div className="space-y-6 p-4 sm:p-5">
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
                title="Confirmed"
                description="Confirmed bookings that are not scheduled for today."
                bookings={confirmed}
                confirmBooking={confirmBooking}
                cancelBooking={cancelBooking}
                completeBooking={completeBooking}
                listQs={listQs}
                maxVisible={2}
                viewAllHref={hrefForSectionStatus("CONFIRMED")}
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
        </Card>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.8fr)] lg:items-start">
          <OperatorMap bookings={mapBookings} />

          <Card className="p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-text-muted)]">
              Admin Tools
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
              Client safety
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--task-text-muted)]">
              Review and manage clients who should be prevented from creating
              new bookings.
            </p>
            <Button
              href="/dashboard/operator/blocked-clients"
              variant="secondary"
              className="mt-5 w-full sm:w-auto lg:w-full"
            >
              Open Blocked Clients
            </Button>
          </Card>
        </section>
      </div>
    </PageShell>
  );
}
