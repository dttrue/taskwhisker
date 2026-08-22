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
import InterventionPreview from "./_components/InterventionPreview";
import OperatorMap from "./_components/OperatorMap";

import { resolveStatus, resolveDateRange } from "./lib/dashboardQuery";
import { getOperatorDashboardData } from "./lib/dashboardData";
import {
  formatDateOnly,
  formatMoney,
  getTodayVisitCount,
  getConfirmedRevenue,
} from "./lib/dashboardUtils";
import { bookingNeedsReview } from "./lib/bookingNeedsReview";
import { loadOperatorInterventions } from "@/lib/operations/loadOperatorInterventions";
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

export default async function OperatorDashboard({ searchParams }) {
  const session = await requireRole(["OPERATOR"]);
  const operatorId = session.user.id;

  const sp = await Promise.resolve(searchParams);

  const { from, to, isDefault } = resolveDateRange(sp);
  const hasRange = !isDefault;

  const status = resolveStatus(sp);
  const review = sp?.review || "all";

  const [dashboardData, interventionIssues] = await Promise.all([
    getOperatorDashboardData({
      operatorId,
      status,
      from,
      to,
    }),
    loadOperatorInterventions({ operatorId }),
  ]);
  const {
    bookings: rawBookings,
    metrics,
    mapBookings,
  } = dashboardData;

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

  const u = new URLSearchParams();

  if (status !== "ALL") u.set("status", status);
  addSharedParams(u);

  const listQs = u.toString();

  const todayVisitCount = getTodayVisitCount(bookings, now);
  const confirmedRevenue = getConfirmedRevenue(bookings);
  const unassignedCount = bookings.filter((b) => !b.sitterId).length;
  const workspaceIsFiltered =
    status !== "ALL" || hasRange || review !== "all";
  const emptyMessage =
    review === "needs-review"
      ? "No bookings need review in the current range."
      : status !== "ALL"
        ? `No ${status.toLowerCase()} bookings in the current range.`
        : "No bookings in the current range.";

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
            value={interventionIssues.length}
            subtext="Open operational issues"
            tone={interventionIssues.length > 0 ? "warning" : "neutral"}
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

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <Card className="overflow-hidden border-[#9fbdae] !bg-[var(--task-primary)] !text-white shadow-[var(--task-shadow-card)]">
            <div className="flex h-full flex-col justify-between gap-6 p-5 sm:p-6 lg:p-8">
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
                  <span>{interventionIssues.length} open issues</span>
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

          <InterventionPreview issues={interventionIssues} />
        </section>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--task-border)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
                    Bookings
                  </h2>
                  {workspaceIsFiltered ? (
                    <span className="rounded-full border border-[#ead9ad] bg-[var(--task-warning-soft)] px-2.5 py-1 text-xs font-semibold text-[#704c16]">
                      Filters active
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[var(--task-text-muted)]">
                  {filteredBookingCount} result{filteredBookingCount === 1 ? "" : "s"} · {formatMoney(confirmedRevenue)} confirmed revenue · {fromStr || "Any date"}–{toStr || "Any date"}
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
          </div>

          <div className="border-b border-[var(--task-border)] px-4 py-3 sm:px-5">
            <MetricsBar
              metrics={metrics}
              active={status}
              hrefForStatus={hrefForStatus}
            />
          </div>

          <div className="p-4 sm:p-5">
            <BookingsTable
              bookings={bookings}
              confirmBooking={confirmBooking}
              cancelBooking={cancelBooking}
              completeBooking={completeBooking}
              listQs={listQs}
              emptyMessage={emptyMessage}
            />
          </div>
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
