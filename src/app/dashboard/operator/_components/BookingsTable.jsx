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
          className="block text-center text-xs underline text-zinc-600 hover:text-zinc-900 pt-1.5"
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
}) {
  if (!bookings?.length) {
    return <div className="p-6 text-sm text-zinc-600">No bookings found.</div>;
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

      <div className="space-y-3 md:hidden">
        {sortedBookings.map((b) => {
          const overdueVisits = getOverdueVisits(b.visits || [], now);
          const reliability = getBookingReliability(b, now);
          const hasUnresolvedMissed = bookingNeedsReview(b, now);
          const isRisky = reliability.level === "risky";
          const isWatch = reliability.level === "watch";

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
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {b.client?.name || "—"}
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

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="p-3">Visits</th>
              <th className="p-3">Client</th>
              <th className="p-3">Sitter</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedBookings.map((b) => {
              const overdueVisits = getOverdueVisits(b.visits || [], now);
              const reliability = getBookingReliability(b, now);
              const hasUnresolvedMissed = bookingNeedsReview(b, now);

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
                    <div className="text-sm text-zinc-900">
                      {b.visits?.length || 0} visit
                      {b.visits?.length === 1 ? "" : "s"}
                    </div>

                    <div className="text-xs text-zinc-500">
                      {b.visits?.length
                        ? formatVisitSummary(b.visits)
                        : new Date(b.startTime).toLocaleString()}
                    </div>

                    <MissedVisitBadge count={overdueVisits.length} />

                    {b.status === "COMPLETED" && (
                      <CompletedAtLabel value={b.completedAt} />
                    )}
                  </td>

                  <td className="p-3">{b.client?.name || "—"}</td>

                  <td className="p-3">
                    <div>
                      {b.sitter?.name || b.sitter?.email || "Unassigned"}
                    </div>

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

                  <td className="whitespace-nowrap p-3 font-medium text-zinc-900">
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
