// src/app/dashboard/sitter/_components/SitterRoutePanel.jsx
"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatDateTime } from "../lib/sitterDashboardUtils";
import { completeBookingAsSitter } from "../actions";
import SitterMap from "./SitterMap";

export default function SitterRoutePanel({
  bookings = [],
  defaultBooking = null,
}) {
  const initialBooking = useMemo(() => {
    if (defaultBooking) return defaultBooking;
    return bookings[0] || null;
  }, [defaultBooking, bookings]);

  const [selectedBooking, setSelectedBooking] = useState(initialBooking);

  if (!selectedBooking) return null;

  return (
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        Selected Stop
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">
            {selectedBooking.clientName || "—"}
          </h2>

          <div className="mt-1 text-sm text-zinc-700">
            {selectedBooking.serviceSummary || "Drop-in visit"}
          </div>

          <div className="mt-2 text-sm font-medium text-blue-700">
            {formatDateTime(
              selectedBooking.todayVisitStart || selectedBooking.nextVisitStart
            )}
          </div>

          {selectedBooking.address ? (
            <div className="mt-1 text-xs text-zinc-500">
              {selectedBooking.address}
            </div>
          ) : null}
        </div>

        <div className="text-left md:text-right">
          <div className="text-xs text-zinc-500">Payout</div>
          <div className="text-lg font-semibold text-zinc-900">
            {formatMoney(selectedBooking.sitterPayoutCents)}
          </div>

          <form action={completeBookingAsSitter} className="mt-3">
            <input type="hidden" name="bookingId" value={selectedBooking.id} />
            <button
              type="submit"
              disabled={selectedBooking.status !== "CONFIRMED"}
              className={
                selectedBooking.status === "CONFIRMED"
                  ? "rounded-md border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                  : "cursor-not-allowed rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-400"
              }
            >
              Mark complete
            </button>
          </form>

          {defaultBooking && defaultBooking.id !== selectedBooking.id ? (
            <button
              type="button"
              onClick={() => setSelectedBooking(defaultBooking)}
              className="mt-2 text-xs font-medium text-zinc-600 underline"
            >
              Jump back to next stop
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-zinc-900">
            Today’s Route 🗺️
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            Your remaining assigned visits for today.
          </p>
        </div>

        <SitterMap
          bookings={bookings}
          selectedBookingId={selectedBooking.id}
          onSelectBooking={setSelectedBooking}
        />
      </div>
    </section>
  );
}