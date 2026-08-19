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
import { FormFeedback, StatusBadge } from "@/components/ui/Foundation";

export default function SitterRoutePanel({
  bookings = [],
  defaultBooking = null,
  lastGraceStop = null,
  selectedBookingId = null,
  onSelectBooking,
}) {
  const [isCompletingVisit, setIsCompletingVisit] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const rowRefs = useRef({});

  useEffect(() => {
    setCompletionError("");
  }, [selectedBookingId]);

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
    !!lastGraceStop &&
    lastGraceStop.id !== selectedBooking.id &&
    bookings.some((b) => b.id === lastGraceStop.id);

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
      setCompletionError("");
      setIsCompletingVisit(true);

      const formData = new FormData();
      formData.append("visitId", actionableVisit.id);

      const result = await completeVisitAsSitter(formData);

      if (!result?.ok) {
        setCompletionError(result?.error || "Failed to complete visit.");
        return;
      }

      if (nextStop?.id) {
        onSelectBooking?.(nextStop.id);
      }
    } catch (err) {
      console.error("Failed to complete visit:", err);
      setCompletionError("Failed to complete visit.");
    } finally {
      setIsCompletingVisit(false);
    }
  }

  return (
    <section className="space-y-5 rounded-[var(--task-radius-card)] border border-[#b8d3c7] bg-white p-4 shadow-[var(--task-shadow-card)] sm:p-6">
      <div className="flex items-center gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]">
          Selected Stop
        </div>
        <StatusBadge tone="success">Active</StatusBadge>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--task-primary)] opacity-30" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--task-primary)]" />
            </span>

            <h2 className="break-words text-xl font-bold tracking-[-0.02em] text-[var(--task-text)]">
              {selectedBooking.clientName || "—"}
            </h2>
          </div>

          <div className="mt-1 text-sm text-[var(--task-text-muted)]">
            {selectedBooking.serviceSummary || "Drop-in visit"}
          </div>

          <div className="mt-2 text-sm font-semibold text-[var(--task-primary)]">
            {visitDayLabel} · {visitTimeLabel}
          </div>

          {selectedBooking.address && (
            <div className="mt-2 break-words text-sm leading-5 text-[var(--task-text-muted)]">
              {selectedBooking.address}
            </div>
          )}
        </div>

        <div className="text-left md:text-right">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-text-muted)]">Payout</div>
          <div className="mt-1 text-lg font-bold text-[var(--task-text)]">
            {formatMoney(selectedBooking.sitterPayoutCents)}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleCompleteVisit}
              disabled={!canComplete || isCompletingVisit}
              className={
                canComplete && !isCompletingVisit
                  ? "min-h-11 rounded-[var(--task-radius-control)] border border-[var(--task-primary)] bg-[var(--task-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--task-primary-hover)]"
                  : "min-h-11 cursor-not-allowed rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--task-text-muted)]"
              }
            >
              {isCompletingVisit ? "Completing..." : "Mark visit complete"}
            </button>
          </div>

          {!canComplete && actionableVisit && (
            <p className="mt-2 text-sm leading-5 text-[#704c16]">
              This visit starts at {formatDateTime(actionableVisit.startTime)}.
            </p>
          )}

          {completionError ? (
            <FormFeedback className="mt-3 text-left">{completionError}</FormFeedback>
          ) : null}

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

      <div className="mt-4 rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]">
          Route Timeline
        </p>
        <p className="mb-3 text-sm text-[var(--task-text-muted)]">
          Now = current visit · Up next = upcoming · Completed = finished
        </p>

        <div className="space-y-2">
          {bookings.map((booking, index) => {
            const state = getStopState(booking);
            const isSelected = booking.id === selectedBooking.id;
            const isTrulyActive = state === "active";
            const isSelectedAndActive = isSelected && isTrulyActive;

            return (
              <button
                type="button"
                key={booking.id}
                ref={(el) => {
                  if (el) rowRefs.current[booking.id] = el;
                }}
                onClick={() => onSelectBooking?.(booking.id)}
                aria-pressed={isSelected}
                className={`flex min-h-12 w-full items-center gap-3 rounded-[var(--task-radius-control)] border px-3 py-2 text-left transition-all duration-200
                  ${
                    isSelectedAndActive
                      ? "border-[#8db9a6] bg-[var(--task-success-soft)]"
                      : isSelected
                      ? "border-[#8db9a6] bg-white"
                      : isTrulyActive
                      ? "border-[#c9dfd4] bg-white"
                      : "border-transparent hover:border-[var(--task-border)] hover:bg-white"
                  }
                `}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={`h-3 w-3 rounded-full
                      ${
                        state === "active"
                          ? "bg-[var(--task-primary)] animate-pulse"
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
                  <div className="break-words font-semibold text-[var(--task-text)]">
                    {booking.clientName}
                  </div>

                  <div className="mt-0.5 break-words text-sm text-[var(--task-text-muted)]">
                    {booking.serviceSummary}
                  </div>
                </div>

                <div className="shrink-0 text-xs font-bold uppercase tracking-[0.08em] text-[var(--task-text-muted)]">
                  {state === "active"
                    ? "Now"
                    : state === "past"
                    ? "Completed"
                    : "Up next"}
                </div>
              </button>
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
