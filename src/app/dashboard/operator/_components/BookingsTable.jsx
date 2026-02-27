// src/app/dashboard/operator/_components/BookingsTable.jsx
"use client";

import { formatMoney } from "../lib/format";
import CancelBookingForm from "./CancelBookingForm";

function StatusBadge({ status }) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border";

  const map = {
    REQUESTED: "bg-yellow-50 text-yellow-700 border-yellow-200",
    CONFIRMED: "bg-green-50 text-green-700 border-green-200",
    CANCELED: "bg-red-50 text-red-700 border-red-200",
    COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <span className={`${base} ${map[status] || "bg-zinc-100 text-zinc-700"}`}>
      {status}
    </span>
  );
}

function BookingActions({
  booking,
  confirmBooking,
  completeBooking,
  cancelBooking,
  listQs,
  layout = "row", // "row" (desktop table) | "stack" (mobile card)
}) {
  const canConfirm = booking.status === "REQUESTED";
  const canCancel = ["REQUESTED", "CONFIRMED"].includes(booking.status);
  const canComplete = booking.status === "CONFIRMED";

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
      <form action={confirmBooking} className="flex-1 sm:flex-none">
        <input type="hidden" name="bookingId" value={booking.id} />
        <button
          type="submit"
          disabled={!canConfirm}
          className={
            canConfirm
              ? `${buttonBase} w-full border border-green-600 text-green-600 hover:bg-green-600 hover:text-white`
              : `${buttonBase} w-full border border-zinc-200 text-zinc-400 cursor-not-allowed`
          }
        >
          Confirm
        </button>
      </form>

      <form action={completeBooking} className="flex-1 sm:flex-none">
        <input type="hidden" name="bookingId" value={booking.id} />
        <button
          type="submit"
          disabled={!canComplete}
          className={
            canComplete
              ? `${buttonBase} w-full border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white`
              : `${buttonBase} w-full border border-zinc-200 text-zinc-400 cursor-not-allowed`
          }
        >
          Complete
        </button>
      </form>

      <div className="flex-1 sm:flex-none">
        <CancelBookingForm
          bookingId={booking.id}
          status={booking.status}
          canCancel={canCancel}
          cancelBooking={cancelBooking}
          // list view keeps REQUESTED optional, CONFIRMED required
          requireReasonForRequested={false}
        />
      </div>

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

  return (
    <div className="space-y-3">
      {/* Mobile: card layout */}
      <div className="md:hidden space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className={`rounded-lg border bg-white p-3 shadow-sm transition md:hover:shadow-md ${
              b.status === "CONFIRMED"
                ? "border-l-[6px] border-l-green-500"
                : b.status === "REQUESTED"
                ? "border-l-[6px] border-l-yellow-400"
                : b.status === "CANCELED"
                ? "border-l-[6px] border-l-red-500"
                : b.status === "COMPLETED"
                ? "border-l-[6px] border-l-blue-500"
                : "border-zinc-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              {/* Left side: client, sitter, date */}
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  {b.client?.name || "—"}
                </div>
                <div className="text-xs text-zinc-500">
                  {b.sitter?.name || b.sitter?.email || "Unassigned"}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {new Date(b.startTime).toLocaleString()}
                </div>
              </div>

              {/* Right side: status + total */}
              <div className="text-right">
                <div className="inline-flex items-center gap-1 justify-end">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      b.status === "CONFIRMED"
                        ? "bg-green-600"
                        : b.status === "REQUESTED"
                        ? "bg-yellow-500"
                        : b.status === "CANCELED"
                        ? "bg-red-600"
                        : b.status === "COMPLETED"
                        ? "bg-blue-600"
                        : "bg-zinc-400"
                    }`}
                  />
                  <span className="text-xs font-medium text-zinc-700">
                    {{
                      REQUESTED: "Requested",
                      CONFIRMED: "Confirmed",
                      CANCELED: "Canceled",
                      COMPLETED: "Completed",
                    }[b.status] || b.status}
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
        ))}
      </div>

      {/* Desktop: original table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="p-3">Start</th>
              <th className="p-3">Client</th>
              <th className="p-3">Sitter</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-zinc-100">
                <td className="p-3 whitespace-nowrap">
                  {new Date(b.startTime).toLocaleString()}
                </td>
                <td className="p-3">{b.client?.name || "—"}</td>
                <td className="p-3">
                  {b.sitter?.name || b.sitter?.email || "Unassigned"}
                </td>
                <td className="p-3">
                  <StatusBadge status={b.status} />
                </td>
                <td className="p-3 whitespace-nowrap font-medium text-zinc-900">
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
