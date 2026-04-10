// src/app/dashboard/sitter/_components/SitterRoutePanel.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatMoney,
  formatDateTime,
  formatTime,
  getRelativeDayLabel,
  getActionableVisitForBooking,
  canCompleteVisit,
} from "../lib/sitterDashboardUtils";
import { completeVisitAsSitter } from "../actions";
import SitterMap from "./SitterMap";
import RouteNavigator from "./RouteNavigator";

export default function SitterRoutePanel({
  bookings = [],
  defaultBooking = null,
  lastGraceStop = null,
  selectedBookingId = null,
  onSelectBooking,
}) {
  const [isCompletingVisit, setIsCompletingVisit] = useState(false);
  const rowRefs = useRef({});

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

  const now = new Date();

  const getStopState = useCallback(
    (booking) => {
      const visit = getActionableVisitForBooking(booking, now);

      if (!visit) return "upcoming";

      if (visit.status === "COMPLETED") {
        return "past";
      }

      const start = new Date(visit.startTime);
      const end = new Date(visit.endTime);

      if (now >= start && now <= end) {
        return "active";
      }

      if (now < start) {
        return "upcoming";
      }

      return "past";
    },
    [now]
  );

  useEffect(() => {
    const activeBooking = bookings.find(
      (booking) => getStopState(booking) === "active"
    );

    if (!activeBooking) return;

    rowRefs.current[activeBooking.id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [bookings, getStopState]);

  if (!selectedBooking) return null;

  const showLastStop =
    !!lastGraceStop && bookings.some((b) => b.id === lastGraceStop.id);

  const actionableVisit = getActionableVisitForBooking(selectedBooking, now);
  const canComplete = canCompleteVisit(actionableVisit, now);

  const visitDateTime =
    actionableVisit?.startTime ||
    selectedBooking?.todayVisitStart ||
    selectedBooking?.nextVisitStart;

  const visitEndTime =
    actionableVisit?.endTime ||
    selectedBooking?.todayVisitEnd ||
    selectedBooking?.nextVisitEnd ||
    null;

  const relativeDayLabel = visitDateTime
    ? getRelativeDayLabel(visitDateTime, now)
    : null;

  const visitDayLabel = visitDateTime
    ? relativeDayLabel ||
      new Date(visitDateTime).toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "No visit day";

  const visitTimeLabel =
    visitDateTime && visitEndTime
      ? `${formatTime(visitDateTime)} – ${formatTime(visitEndTime)}`
      : visitDateTime
      ? formatTime(visitDateTime)
      : "No visit time";

  const currentIndex = bookings.findIndex((b) => b.id === selectedBooking.id);

  const nextStop =
    currentIndex >= 0 && currentIndex < bookings.length - 1
      ? bookings[currentIndex + 1]
      : null;

  const previousStop = currentIndex > 0 ? bookings[currentIndex - 1] : null;

  async function handleCompleteVisit() {
    if (!actionableVisit?.id || !canComplete || isCompletingVisit) return;

    try {
      setIsCompletingVisit(true);

      const formData = new FormData();
      formData.append("visitId", actionableVisit.id);

      const result = await completeVisitAsSitter(formData);

      if (!result?.ok) {
        console.error(result?.error || "Failed to complete visit.");
        return;
      }

      if (nextStop?.id) {
        onSelectBooking?.(nextStop.id);
      }
    } catch (err) {
      console.error("Failed to complete visit:", err);
    } finally {
      setIsCompletingVisit(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-blue-300 bg-gradient-to-r from-blue-50 via-white to-white p-5 shadow-sm ring-1 ring-blue-100">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Selected Stop
        </div>
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          Active
        </span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
            </span>

            <h2 className="text-xl font-semibold text-zinc-900">
              {selectedBooking.clientName || "—"}
            </h2>
          </div>

          <div className="mt-1 text-sm text-zinc-700">
            {selectedBooking.serviceSummary || "Drop-in visit"}
          </div>

          <div className="mt-2 text-sm font-medium text-blue-700">
            {visitDayLabel} · {visitTimeLabel}
          </div>

          {selectedBooking.address && (
            <div className="mt-1 text-xs text-zinc-500">
              {selectedBooking.address}
            </div>
          )}
        </div>

        <div className="text-left md:text-right">
          <div className="text-xs text-zinc-500">Payout</div>
          <div className="text-lg font-semibold text-zinc-900">
            {formatMoney(selectedBooking.sitterPayoutCents)}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleCompleteVisit}
              disabled={!canComplete || isCompletingVisit}
              className={
                canComplete && !isCompletingVisit
                  ? "rounded-md border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-600 hover:text-white"
                  : "cursor-not-allowed rounded-md border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-400"
              }
            >
              {isCompletingVisit ? "Completing..." : "Mark visit complete"}
            </button>
          </div>

          {!canComplete && actionableVisit && (
            <p className="mt-2 text-xs text-amber-600">
              This visit starts at {formatDateTime(actionableVisit.startTime)}.
            </p>
          )}

          <div className="mt-4">
            <RouteNavigator
              currentIndex={currentIndex}
              totalStops={bookings.length}
              previousStop={previousStop}
              nextStop={nextStop}
              lastGraceStop={lastGraceStop}
              showLastStop={showLastStop}
              onSelectBooking={onSelectBooking}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
        <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">
          Route Timeline
        </p>
        <p className="mb-3 text-[11px] text-zinc-400">
          Now = current visit · Up next = upcoming · Completed = finished
        </p>

        <div className="space-y-2">
          {bookings.map((booking, index) => {
            const state = getStopState(booking);
            const isSelected = booking.id === selectedBooking.id;
            const isTrulyActive = state === "active";
            const isSelectedAndActive = isSelected && isTrulyActive;

            return (
              <div
                key={booking.id}
                ref={(el) => {
                  if (el) rowRefs.current[booking.id] = el;
                }}
                onClick={() => onSelectBooking?.(booking.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all duration-200
                  ${
                    isSelectedAndActive
                      ? "bg-green-100 border border-green-300 scale-[1.01]"
                      : isSelected
                      ? "bg-blue-50 border border-blue-200 scale-[1.01]"
                      : isTrulyActive
                      ? "bg-green-50 border border-green-200"
                      : "hover:bg-zinc-50"
                  }
                `}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={`h-3 w-3 rounded-full
                      ${
                        state === "active"
                          ? "bg-green-500 animate-pulse"
                          : state === "past"
                          ? "bg-zinc-400"
                          : "bg-zinc-200"
                      }
                    `}
                  />

                  {index < bookings.length - 1 && (
                    <div
                      className={`w-[2px] flex-1 ${
                        state === "past" ? "bg-zinc-300" : "bg-zinc-200"
                      }`}
                    />
                  )}
                </div>

                <div className="flex-1 text-sm">
                  <div className="font-medium text-zinc-900">
                    {booking.clientName}
                  </div>

                  <div className="text-xs text-zinc-500">
                    {booking.serviceSummary}
                  </div>
                </div>

                <div className="text-[10px] font-semibold uppercase text-zinc-400">
                  {state === "active"
                    ? "Now"
                    : state === "past"
                    ? "Completed"
                    : "Up next"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SitterMap
        bookings={bookings}
        selectedBookingId={selectedBooking?.id || null}
        onSelectBooking={onSelectBooking}
      />
    </section>
  );
}
