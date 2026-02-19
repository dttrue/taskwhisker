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
    <div className="overflow-x-auto">
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
          {bookings.map((b) => {
            const canConfirm = b.status === "REQUESTED";
            const canCancel = ["REQUESTED", "CONFIRMED"].includes(b.status);
            const canComplete = b.status === "CONFIRMED";

            return (
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
                  <div className="flex items-start justify-end gap-2">
                    <form action={confirmBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <button
                        type="submit"
                        disabled={!canConfirm}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
                          canConfirm
                            ? "border border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
                            : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
                        }`}
                      >
                        Confirm
                      </button>
                    </form>

                    <form action={completeBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <button
                        type="submit"
                        disabled={!canComplete}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
                          canComplete
                            ? "border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                            : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
                        }`}
                      >
                        Complete
                      </button>
                    </form>

                    <CancelBookingForm
                      bookingId={b.id}
                      status={b.status}
                      canCancel={canCancel}
                      cancelBooking={cancelBooking}
                      // list view keeps REQUESTED optional, CONFIRMED required
                      requireReasonForRequested={false}
                    />

                    <a
                      href={
                        listQs
                          ? `/dashboard/operator/bookings/${b.id}?${listQs}`
                          : `/dashboard/operator/bookings/${b.id}`
                      }
                      className="text-xs underline text-zinc-600 hover:text-zinc-900 ml-2 pt-2"
                    >
                      View
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
