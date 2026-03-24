"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatDateTime } from "../lib/sitterDashboardUtils";
import { completeBookingAsSitter } from "../actions";
import SitterMap from "./SitterMap";

export default function SitterRoutePanel({
  bookings = [],
  defaultBooking = null,
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedBooking = useMemo(() => {
    if (!mounted || !bookings.length) return null;

    if (selectedBookingId) {
      const found = bookings.find((b) => b.id === selectedBookingId);
      if (found) return found;
    }

    if (defaultBooking) {
      const foundDefault = bookings.find((b) => b.id === defaultBooking.id);
      if (foundDefault) return foundDefault;
    }

    return null; // ❗ DO NOT fallback to bookings[0]
  }, [mounted, bookings, selectedBookingId, defaultBooking]);
   
  useEffect(() => {
    if (!mounted || !defaultBooking) return;
    setSelectedBookingId(defaultBooking.id);
  }, [mounted, defaultBooking]);
  const showJumpBack =
    mounted &&
    defaultBooking &&
    selectedBooking &&
    defaultBooking.id !== selectedBooking.id &&
    bookings.some((booking) => booking.id === defaultBooking.id);

  const canComplete = selectedBooking?.status === "CONFIRMED";
  const visitDateTime =
    selectedBooking?.todayVisitStart || selectedBooking?.nextVisitStart;

  if (!mounted) {
    return (
      <section className="space-y-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Selected Stop
        </div>

        <div className="h-40 animate-pulse rounded-xl bg-white/70" />

        <div>
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-zinc-900">
              Today’s Route 🗺️
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Your remaining assigned visits for today.
            </p>
          </div>

          <div className="h-[300px] animate-pulse rounded-xl bg-white/70" />
        </div>
      </section>
    );
  }
  console.log("SITTER ROUTE PANEL DEBUG", {
  mounted,
  bookingCount: bookings.length,
  defaultBookingId: defaultBooking?.id || null,
  selectedBookingId,
  bookingIds: bookings.map((b) => b.id),
  resolvedSelectedBookingId: selectedBooking?.id || null,
});

  if (!selectedBooking) return null;

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
              className={
                canComplete
                  ? "rounded-md border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
                  : "cursor-not-allowed rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-400"
              }
            >
              Mark complete
            </button>
          </form>

          {/* {showJumpBack ? (
            <button
              type="button"
              onClick={() => setSelectedBookingId(defaultBooking.id)}
              className="mt-2 text-xs font-medium text-zinc-600 underline"
            >
              Jump back to next stop
            </button>
          ) : null} */}
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
