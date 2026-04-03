// src/app/dashboard/sitter/_components/BookingCard.jsx
import {
  STATUS_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_CARD_BORDER_CLASSES,
} from "@/lib/statusStyles";
import {
  formatMoney,
  formatDateTime,
  getBookingNextVisit,
  getVisitSummaryLines,
  getUpcomingVisitSummaryLines,
  getRemainingTodayVisitSummaryLines,
  getActionableVisitForBooking,
  canCompleteVisit,
  getVisitProgressLabel,
} from "../lib/sitterDashboardUtils";
import { completeVisitAsSitter } from "../actions";
import VisitLinesToggle from "./VisitLinesToggle";

function getExecutionBadge({ actionableVisit, canComplete, nextVisit, view }) {
  if (actionableVisit && canComplete) {
    return {
      label: "Ready now",
      value: `${formatDateTime(actionableVisit.startTime)}`,
      classes: "bg-emerald-100 text-emerald-800",
    };
  }

  if (view === "today" && actionableVisit && !canComplete) {
    return {
      label: "Next up",
      value: `${formatDateTime(actionableVisit.startTime)}`,
      classes: "bg-blue-100 text-blue-700",
    };
  }

  if (nextVisit) {
    return {
      label: "Next up",
      value: `${formatDateTime(nextVisit.startTime)}`,
      classes: "bg-blue-100 text-blue-700",
    };
  }

  return null;
}

export default function BookingCard({ booking, view, isNextStop }) {
  const now = new Date();
  const nextVisit = getBookingNextVisit(booking, now);
  const actionableVisit = getActionableVisitForBooking(booking, now);
  const canComplete = canCompleteVisit(actionableVisit, now);

  const executionBadge = getExecutionBadge({
    actionableVisit,
    canComplete,
    nextVisit,
    view,
  });

  const todayLines = getRemainingTodayVisitSummaryLines(
    booking.visits,
    now,
    10
  );

  const futureLines = getUpcomingVisitSummaryLines(
    booking.visits,
    now,
    10
  ).filter((line) => !todayLines.includes(line));

  const defaultLines =
    view === "today"
      ? todayLines
      : view === "upcoming"
      ? getUpcomingVisitSummaryLines(booking.visits, now, 10)
      : getVisitSummaryLines(booking.visits);

  const initialLines =
    view === "upcoming" ? defaultLines.slice(0, 1) : defaultLines.slice(0, 3);

  const extraLines =
    view === "upcoming" ? defaultLines.slice(1) : defaultLines.slice(3);

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition ${
        STATUS_CARD_BORDER_CLASSES[booking.status] || "border-zinc-200"
      } ${isNextStop ? "bg-blue-50 ring-2 ring-blue-200" : "bg-white"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-zinc-900">
              {booking.client?.name || "—"}
            </div>

            {isNextStop ? (
              <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                Next up
              </span>
            ) : null}
          </div>

          <div className="mt-1 text-xs text-zinc-600">
            {booking.serviceSummary || "Drop-in visit"}
          </div>

          {executionBadge ? (
            <div
              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${executionBadge.classes}`}
            >
              {executionBadge.label}: {executionBadge.value}
            </div>
          ) : null}

          <div className="mt-3">
            <VisitLinesToggle
              initialLines={initialLines}
              extraLines={extraLines}
            />
          </div>

          {view === "today" && futureLines.length > 0 ? (
            <div className="mt-3">
              <VisitLinesToggle
                labelCollapsed={`Show ${futureLines.length} future visit${
                  futureLines.length === 1 ? "" : "s"
                }`}
                labelExpanded="Hide future visits"
                initialLines={[]}
                extraLines={futureLines}
              />
            </div>
          ) : null}

          <div className="mt-3 text-xs text-zinc-500">
            {getVisitProgressLabel(booking.visits)}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="inline-flex items-center justify-end gap-1">
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

      <div className="mt-4 flex flex-col items-end">
        <form action={completeVisitAsSitter}>
          <input
            type="hidden"
            name="visitId"
            value={actionableVisit?.id || ""}
          />
          <button
            type="submit"
            disabled={!canComplete}
            className={
              canComplete
                ? "rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                : "cursor-not-allowed rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-400"
            }
          >
            {canComplete ? "Mark visit complete" : "Not ready yet"}
          </button>
        </form>

        {actionableVisit && !canComplete ? (
          <p className="mt-2 text-right text-xs text-amber-600">
            Available at {formatDateTime(actionableVisit.startTime)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
