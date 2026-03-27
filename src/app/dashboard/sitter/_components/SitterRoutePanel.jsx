// src/app/dashboard/sitter/_components/SitterRoutePanel.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatDateTime } from "../lib/sitterDashboardUtils";
import { completeBookingAsSitter } from "../actions";
import SitterMap from "./SitterMap";

export default function SitterRoutePanel({
  bookings = [],
  defaultBooking = null,
  lastGraceStop = null,
}) {
  const [selectedBookingId, setSelectedBookingId] = useState(
    defaultBooking?.id || null
  );

  useEffect(() => {
    const isValidBooking =
      selectedBookingId &&
      bookings.some((booking) => booking.id === selectedBookingId);

    if (!isValidBooking) {
      setSelectedBookingId(defaultBooking?.id || bookings[0]?.id || null);
    }
  }, [selectedBookingId, bookings, defaultBooking]);

  const selectedBooking = useMemo(() => {
    if (!bookings.length) return null;

    if (selectedBookingId) {
      const found = bookings.find((b) => b.id === selectedBookingId);
      if (found) return found;
    }

    if (defaultBooking) {
      const foundDefault = bookings.find((b) => b.id === defaultBooking.id);
      if (foundDefault) return foundDefault;
    }

    return bookings[0] || null;
  }, [bookings, selectedBookingId, defaultBooking]);

  const showLastStop =
    !!lastGraceStop &&
    bookings.some((booking) => booking.id === lastGraceStop.id);

  const canComplete = selectedBooking?.status === "CONFIRMED";
  const visitDateTime =
    selectedBooking?.todayVisitStart || selectedBooking?.nextVisitStart;

  if (!selectedBooking) return null;

  const currentIndex = bookings.findIndex((b) => b.id === selectedBooking?.id);

  const nextStop =
    currentIndex >= 0 && currentIndex < bookings.length - 1
      ? bookings[currentIndex + 1]
      : null;

  const previousStop = currentIndex > 0 ? bookings[currentIndex - 1] : null;

  return (
    <section className="space-y-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm">
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
            {visitDateTime ? formatDateTime(visitDateTime) : "No visit time"}
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
              disabled={!canComplete}
              onClick={() => {
                if (nextStop) setSelectedBookingId(nextStop.id);
              }}
              className={
                canComplete
                  ? "rounded-md border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                  : "cursor-not-allowed rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-400"
              }
            >
              Mark complete
            </button>
          </form>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 text-left md:text-left">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Route Controls
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Move through your remaining stops for today.
                </p>
              </div>

              <div className="text-[11px] font-medium text-zinc-500">
                Stop {currentIndex >= 0 ? currentIndex + 1 : 1} of{" "}
                {bookings.length}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  previousStop && setSelectedBookingId(previousStop.id)
                }
                disabled={!previousStop}
                className={
                  previousStop
                    ? "rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
                    : "cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-400 shadow-sm"
                }
              >
                Back
              </button>

              <button
                type="button"
                onClick={() => nextStop && setSelectedBookingId(nextStop.id)}
                disabled={!nextStop}
                className={
                  nextStop
                    ? "rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
                    : "cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-400 shadow-sm"
                }
              >
                Next Stop
              </button>

              {showLastStop ? (
                <button
                  type="button"
                  onClick={() => setSelectedBookingId(lastGraceStop.id)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
                >
                  Last Stop
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
              <div className="rounded-xl bg-zinc-50 px-3 py-2">
                <span className="font-semibold text-zinc-700">Current:</span>{" "}
                {selectedBooking?.clientName || "—"}
              </div>

              <div className="rounded-xl bg-zinc-50 px-3 py-2">
                <span className="font-semibold text-zinc-700">Next:</span>{" "}
                {nextStop?.clientName || "No more stops"}
              </div>
            </div>
          </div>
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
          selectedBookingId={selectedBooking?.id || null}
          onSelectBooking={(bookingId) => setSelectedBookingId(bookingId)}
        />
      </div>
    </section>
  );
}
