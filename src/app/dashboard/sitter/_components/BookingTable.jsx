// src/app/dashboard/sitter/_components/BookingTable.jsx
import {
  STATUS_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_PILL_CLASSES,
} from "@/lib/statusStyles";
import {
  formatMoney,
  formatDateTime,
  getBookingNextVisit,
  getVisitSummaryLines,
  getVisitProgressLabel,
} from "../lib/sitterDashboardUtils";
import { completeVisitAsSitter } from "../actions";

export default function BookingTable({ bookings }) {
  const now = new Date();

  return (
    <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm md:block">
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
            const nextVisit = getBookingNextVisit(booking, now);

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
                    {getVisitProgressLabel(booking.visits)}
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

                
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
