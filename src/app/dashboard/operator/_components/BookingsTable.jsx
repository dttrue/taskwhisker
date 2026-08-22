// src/app/dashboard/operator/_components/BookingsTable.jsx
"use client";

import { completeVisitAsOperator } from "../bookings/actions";
import { formatMoney } from "../lib/format";
import CancelBookingForm from "./CancelBookingForm";
import { getRiskySitterSummary } from "../../operator/lib/getRiskySitterSummary";
import { getBookingReliability } from "../../operator/lib/getBookingReliability";
import { bookingNeedsReview } from "../lib/bookingNeedsReview";
import { ReliabilityBadge } from "../booking-list/ReliabilityBadge";
import MissedVisitBadge from "../booking-list/MissedVisitBadge";
import CompletedAtLabel from "../booking-list/CompletedAtLabel";
import StatusBadge from "../booking-list/StatusBadge";
import {
  getOverdueVisits,
  formatVisitSummary,
} from "../../lib/bookingDisplayUtils";
import {
  STATUS_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_CARD_BORDER_CLASSES,
} from "@/lib/statusStyles";
import RiskySitterSummary from "../booking-list/RiskySitterSummary";
import { formatBookingPetNames } from "@/lib/bookings/formatPetNames";

function BookingActions({
  booking,
  confirmBooking,
  completeBooking,
  cancelBooking,
  listQs,
  layout = "row",
}) {
  const isTerminal =
    booking.status === "COMPLETED" || booking.status === "CANCELED";

  const canConfirm = booking.status === "REQUESTED";
  const canCancel = ["REQUESTED", "CONFIRMED"].includes(booking.status);

  const hasVisits = (booking.visits || []).length > 0;
  const allVisitsCompleted = (booking.visits || []).every(
    (v) => v.status === "COMPLETED"
  );

  const canComplete =
    booking.status === "CONFIRMED" && hasVisits && allVisitsCompleted;

  const now = new Date();
  const overdueVisits = isTerminal
    ? []
    : getOverdueVisits(booking.visits || [], now);

  const hasUnresolvedMissed = bookingNeedsReview(booking, now);

  const containerBase = "flex gap-2";
  const containerClass =
    layout === "stack"
      ? `${containerBase} flex-col sm:flex-row sm:flex-wrap`
      : `${containerBase} items-start justify-end`;

  const buttonBase = "text-xs font-semibold px-3 py-1.5 rounded-md transition";

  const viewHref = listQs
    ? `/dashboard/operator/bookings/${booking.id}?${listQs}`
    : `/dashboard/operator/bookings/${booking.id}`;

  return (
    <div className={containerClass}>
      {!isTerminal && (
        <>
          {hasUnresolvedMissed ? (
            <>
              {overdueVisits.map((visit) => (
                <form
                  key={visit.id}
                  action={completeVisitAsOperator.bind(null, visit.id)}
                  className="flex-1 sm:flex-none"
                >
                  <button
                    type="submit"
                    className={`${buttonBase} w-full border border-amber-600 text-amber-700 hover:bg-amber-600 hover:text-white`}
                  >
                    Complete missed visit
                  </button>
                </form>
              ))}
            </>
          ) : (
            <>
              {canConfirm && (
                <form action={confirmBooking} className="flex-1 sm:flex-none">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button
                    type="submit"
                    className={`${buttonBase} w-full border border-green-600 text-green-600 hover:bg-green-600 hover:text-white`}
                  >
                    Confirm
                  </button>
                </form>
              )}

              {canComplete && (
                <form action={completeBooking} className="flex-1 sm:flex-none">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button
                    type="submit"
                    className={`${buttonBase} w-full border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white`}
                  >
                    Complete
                  </button>
                </form>
              )}
            </>
          )}

          {canCancel && !hasUnresolvedMissed && (
            <div className="flex-1 sm:flex-none">
              <CancelBookingForm
                bookingId={booking.id}
                status={booking.status}
                canCancel={canCancel}
                cancelBooking={cancelBooking}
                requireReasonForRequested={false}
              />
            </div>
          )}
        </>
      )}

      {isTerminal && (
        <div className="flex-1 sm:flex-none text-xs text-zinc-500 italic">
          {booking.status === "COMPLETED"
            ? "This booking has been completed."
            : "This booking was canceled."}
        </div>
      )}

      <div className="flex-1 sm:flex-none sm:self-center">
        <a
          href={viewHref}
          className="inline-flex min-h-9 w-full items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 py-1.5 text-center text-xs font-semibold text-[var(--task-primary)] hover:bg-[var(--task-surface-soft)]"
        >
          View
        </a>
      </div>
    </div>
  );
}

export default function BookingsTable({
  bookings,
  confirmBooking,
  cancelBooking,
  completeBooking,
  listQs = "",
  emptyMessage = "No bookings found.",
}) {
  if (!bookings?.length) {
    return (
      <div className="rounded-[var(--task-radius-control)] border border-dashed border-[var(--task-border-strong)] bg-[var(--task-surface-soft)] p-6 text-center text-sm text-[var(--task-text-muted)]">
        {emptyMessage}
      </div>
    );
  }

  const now = new Date();
  const riskySitters = getRiskySitterSummary(bookings, now);

  const sortedBookings = [...bookings].sort((a, b) => {
    const aNeedsReview = bookingNeedsReview(a, now);
    const bNeedsReview = bookingNeedsReview(b, now);

    // 1. Needs review first
    if (aNeedsReview !== bNeedsReview) {
      return Number(bNeedsReview) - Number(aNeedsReview);
    }

    // 2. Then prioritize risky sitters
    const aReliability = getBookingReliability(a, now);
    const bReliability = getBookingReliability(b, now);

    const order = { risky: 0, watch: 1, excellent: 2 };

    if (aReliability.level !== bReliability.level) {
      return order[aReliability.level] - order[bReliability.level];
    }

    // 3. Fallback to score
    return aReliability.score - bReliability.score;
  });
  return (
    <div className="space-y-3">
      <RiskySitterSummary riskySitters={riskySitters} />

      <div className="space-y-3 lg:hidden">
        {sortedBookings.map((b) => {
          const overdueVisits = getOverdueVisits(b.visits || [], now);
          const reliability = getBookingReliability(b, now);
          const hasUnresolvedMissed = bookingNeedsReview(b, now);
          const isRisky = reliability.level === "risky";
          const isWatch = reliability.level === "watch";
          const petDisplayName = formatBookingPetNames(
            b.petNames,
            b.serviceSummary || "Pet care booking"
          );
          const showServiceContext =
            Boolean(b.serviceSummary) && b.serviceSummary !== petDisplayName;

          return (
            <div
              key={b.id}
              className={`rounded-lg border p-3 shadow-sm transition md:hover:shadow-md ${
                hasUnresolvedMissed
                  ? "border-red-300 bg-red-50"
                  : isRisky
                  ? "border-red-200 bg-red-50/50"
                  : isWatch
                  ? "border-amber-300 bg-amber-50"
                  : `${
                      STATUS_CARD_BORDER_CLASSES[b.status] || "border-zinc-200"
                    } bg-white`
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-zinc-900">
                    {petDisplayName}
                  </div>

                  {showServiceContext ? (
                    <div className="mt-1 break-words text-xs text-zinc-600">
                      {b.serviceSummary}
                    </div>
                  ) : null}

                  <div className="mt-1 break-words text-xs text-zinc-500">
                    Owner: {b.client?.name || "Client"}
                  </div>

                  {hasUnresolvedMissed && isRisky && (
                    <div className="mt-1 text-xs font-semibold text-red-700">
                      🚨 High priority booking
                    </div>
                  )}

                  <div className="mt-1 text-xs text-zinc-500">
                    {b.visits?.length
                      ? formatVisitSummary(b.visits)
                      : new Date(b.startTime).toLocaleString()}
                  </div>

                  <MissedVisitBadge count={overdueVisits.length} />

                  {b.status === "COMPLETED" && (
                    <CompletedAtLabel value={b.completedAt} />
                  )}
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        STATUS_DOT_CLASSES[b.status] || "bg-zinc-400"
                      }`}
                    />
                    <span className="text-xs font-medium text-zinc-800">
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-zinc-500">Total</div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {formatMoney(b.clientTotalCents)}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <BookingActions
                  booking={b}
                  confirmBooking={confirmBooking}
                  completeBooking={completeBooking}
                  cancelBooking={cancelBooking}
                  listQs={listQs}
                  layout="stack"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-[var(--task-radius-control)] border border-[var(--task-border)] lg:block">
        <table className="min-w-[960px] w-full table-fixed text-sm">
          <thead className="bg-[var(--task-surface-soft)] text-left text-[var(--task-text-muted)]">
            <tr className="border-b border-[var(--task-border)]">
              <th className="w-[20%] p-3">Pet / Owner</th>
              <th className="w-[25%] p-3">Service / Schedule</th>
              <th className="p-3">Sitter</th>
              <th className="w-[11%] p-3">Status</th>
              <th className="w-[9%] p-3 text-right">Total</th>
              <th className="w-[22%] p-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {sortedBookings.map((b) => {
              const overdueVisits = getOverdueVisits(b.visits || [], now);
              const reliability = getBookingReliability(b, now);
              const hasUnresolvedMissed = bookingNeedsReview(b, now);
              const petDisplayName = formatBookingPetNames(
                b.petNames,
                b.serviceSummary || "Pet care booking"
              );
              const showServiceContext =
                Boolean(b.serviceSummary) && b.serviceSummary !== petDisplayName;

              return (
                <tr
                  key={b.id}
                  className={`border-b ${
                    hasUnresolvedMissed
                      ? "border-red-100 bg-red-50"
                      : "border-zinc-100"
                  }`}
                >
                  <td className="p-3">
                    <div className="break-words font-semibold text-[var(--task-text)]">
                      {petDisplayName}
                    </div>
                    <div className="mt-1 break-words text-xs text-[var(--task-text-muted)]">
                      Owner: {b.client?.name || "Client"}
                    </div>
                  </td>

                  <td className="p-3 align-top">
                    {showServiceContext ? (
                      <div className="break-words font-medium text-[var(--task-text)]">
                        {b.serviceSummary}
                      </div>
                    ) : null}
                    <div className={`${showServiceContext ? "mt-1" : ""} text-xs leading-5 text-[var(--task-text-muted)]`}>
                      {b.visits?.length
                        ? formatVisitSummary(b.visits)
                        : new Date(b.startTime).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-[var(--task-text-muted)]">
                      {b.visits?.length || 0} visit
                      {b.visits?.length === 1 ? "" : "s"}
                    </div>
                    <MissedVisitBadge count={overdueVisits.length} />
                    {b.status === "COMPLETED" && (
                      <CompletedAtLabel value={b.completedAt} />
                    )}
                  </td>

                  <td className="p-3">
                    {b.sitter?.name || b.sitter?.email ? (
                      <div className="font-medium text-[var(--task-text)]">
                        {b.sitter?.name || b.sitter?.email}
                      </div>
                    ) : (
                      <span className="inline-flex rounded-full border border-[#ead9ad] bg-[var(--task-warning-soft)] px-2 py-0.5 text-xs font-semibold text-[#704c16]">
                        Unassigned
                      </span>
                    )}

                    <ReliabilityBadge reliability={reliability} />

                    {hasUnresolvedMissed && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        ⚠️ Needs review
                      </div>
                    )}
                  </td>

                  <td className="p-3">
                    <StatusBadge status={b.status} />
                  </td>

                  <td className="whitespace-nowrap p-3 text-right font-semibold text-[var(--task-text)]">
                    {formatMoney(b.clientTotalCents)}
                  </td>

                  <td className="p-3">
                    <BookingActions
                      booking={b}
                      confirmBooking={confirmBooking}
                      completeBooking={completeBooking}
                      cancelBooking={cancelBooking}
                      listQs={listQs}
                      layout="row"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
