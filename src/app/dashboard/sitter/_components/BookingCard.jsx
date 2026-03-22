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
} from "../lib/sitterDashboardUtils";
import { completeBookingAsSitter } from "../actions";

export default function BookingCard({ booking }) {
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
