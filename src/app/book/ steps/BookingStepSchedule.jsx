// src/app/book/steps/BookingStepSchedule.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdaptiveCalendar from "@/components/calendar/AdaptiveCalendar";
import TimeSlotPicker from "@/components/calendar/TimeSlotPicker";
import { FieldGroup, Notice } from "@/components/ui/Foundation";
import { BOOKING_WINDOW_START, BOOKING_WINDOW_END } from "../bookingTimeUtils";

function isoToTimeInputValue(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function BookingStepSchedule({
  isRange,
  scheduleMode,
  setScheduleMode,
  selectedDateStrs,
  syncSlotsForDates,
  serviceType,
  range,
  handleRangeChange,
  dates,
  handleDatesChange,
  times,
  setTimes,
  slotsByDate,
  addSlot,
  updateSlot,
  removeSlot,
  sitterId,
  durationMinutes = 30,
  bufferMinutes = 15,
  clearError,
}) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [slotError, setSlotError] = useState("");

  const lastFetchKeyRef = useRef("");

  const usesSlotPicker = useMemo(() => {
    return (
      !isRange &&
      scheduleMode === "SAME" &&
      (serviceType === "DROP_IN" || serviceType === "WALK")
    );
  }, [isRange, scheduleMode, serviceType]);

  const availableSlots = useMemo(() => {
    return slots.filter((slot) => slot.available);
  }, [slots]);

  const clearSlotSelection = useCallback(() => {
    setSelectedSlot(null);
    setTimes((prev) => ({
      ...prev,
      startTime: "",
      endTime: "",
    }));
  }, [setTimes]);

  function handleSameMode() {
    clearError?.();
    setScheduleMode("SAME");
  }

  function handleCustomMode() {
    clearError?.();
    setScheduleMode("CUSTOM");
    clearSlotSelection();
    syncSlotsForDates(selectedDateStrs);
  }

  useEffect(() => {
    if (!loadingSlots) {
      setShowLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowLoading(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [loadingSlots]);

  useEffect(() => {
    if (!usesSlotPicker || !selectedDate || !sitterId) {
      setSlots([]);
      setSlotError("");
      setLoadingSlots(false);
      lastFetchKeyRef.current = "";
      clearSlotSelection();
      return;
    }

    const fetchKey = `${sitterId}-${selectedDate}-${durationMinutes}-${bufferMinutes}`;

    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }

    lastFetchKeyRef.current = fetchKey;

    let cancelled = false;
    const controller = new AbortController();

    async function loadSlots() {
      try {
        setLoadingSlots(true);
        setSlotError("");
        clearSlotSelection();

        const params = new URLSearchParams({
          sitterId,
          date: selectedDate,
          durationMinutes: String(durationMinutes),
          bufferMinutes: String(bufferMinutes),
        });

        const res = await fetch(
          `/api/availability/slots?${params.toString()}`,
          {
            signal: controller.signal,
          }
        );

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to load available times.");
        }

        if (!cancelled) {
          setSlots(data.slots || []);
        }
      } catch (error) {
        if (error.name === "AbortError") return;

        if (!cancelled) {
          setSlots([]);
          setSlotError(error.message || "Failed to load available times.");
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    }

    loadSlots();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    usesSlotPicker,
    selectedDate,
    sitterId,
    durationMinutes,
    bufferMinutes,
    clearSlotSelection,
  ]);

  return (
    <div className="space-y-4">
      {!isRange && (
        <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4 sm:p-5">
          <FieldGroup
            legend="Time options"
            hint="Use different times per date when you need more than one visit in a day."
          >
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={scheduleMode === "SAME"}
              className={`min-h-11 rounded-[var(--task-radius-control)] border px-3 py-2.5 text-sm font-semibold transition-colors ${
                scheduleMode === "SAME" ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white" : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
              }`}
              onClick={handleSameMode}
            >
              Same time for all dates
            </button>

            <button
              type="button"
              aria-pressed={scheduleMode === "CUSTOM"}
              className={`min-h-11 rounded-[var(--task-radius-control)] border px-3 py-2.5 text-sm font-semibold transition-colors ${
                scheduleMode === "CUSTOM" ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white" : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
              }`}
              onClick={handleCustomMode}
            >
              Different times per date
            </button>
          </div>
          </FieldGroup>
        </section>
      )}

      <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--task-text)]">Select dates</h2>

        <div className="flex justify-center">
          <div className="w-full max-w-[320px]">
            <AdaptiveCalendar
              serviceType={serviceType}
              range={range}
              onRangeChange={(newRange) => {
                clearError?.();
                handleRangeChange(newRange);
              }}
              dates={dates}
              onDatesChange={(newDates) => {
                clearError?.();
                handleDatesChange(newDates);

                if (!isRange) {
                  const lastDate = newDates?.[newDates.length - 1] || null;
                  setSelectedDate(lastDate);
                }
              }}
            />
          </div>
        </div>
      </section>

      {isRange && (
        <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="overnight-start-time" className="block text-sm font-semibold text-[var(--task-text)]">
                Start time
              </label>
              <input
                id="overnight-start-time"
                type="time"
                min={BOOKING_WINDOW_START}
                max={BOOKING_WINDOW_END}
                value={times.startTime}
                onChange={(e) => {
                  clearError?.();
                  setTimes((prev) => ({
                    ...prev,
                    startTime: e.target.value,
                  }));
                }}
                className="mt-2 block min-h-11 w-full rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3.5 py-2.5 text-sm shadow-sm"
              />
            </div>

            <div>
              <label htmlFor="overnight-end-time" className="block text-sm font-semibold text-[var(--task-text)]">
                End time
              </label>
              <input
                id="overnight-end-time"
                type="time"
                min={BOOKING_WINDOW_START}
                max={BOOKING_WINDOW_END}
                value={times.endTime}
                onChange={(e) => {
                  clearError?.();
                  setTimes((prev) => ({
                    ...prev,
                    endTime: e.target.value,
                  }));
                }}
                className="mt-2 block min-h-11 w-full rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3.5 py-2.5 text-sm shadow-sm"
              />
            </div>
          </div>
        </section>
      )}

      {!isRange && usesSlotPicker && (
        <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[var(--task-text)]">Available times</h2>
            <p className="mt-1 text-xs text-[var(--task-text-muted)]">
              Select a time slot for this visit.
            </p>
          </div>

          {!selectedDate ? (
            <p className="text-sm text-[var(--task-text-muted)]">
              Select a date to see available times.
            </p>
          ) : showLoading ? (
            <Notice role="status">Loading available times...</Notice>
          ) : slotError ? (
            <Notice tone="danger" role="alert">{slotError}</Notice>
          ) : availableSlots.length === 0 ? (
            <Notice>No available times for this date.</Notice>
          ) : (
            <TimeSlotPicker
              slots={availableSlots}
              selectedSlot={selectedSlot}
              onSelectSlot={(slot) => {
                const startTime = isoToTimeInputValue(slot.startTime);
                const endTime = isoToTimeInputValue(slot.endTime);

                clearError?.();
                setSlotError("");
                setSelectedSlot(slot);

                setTimes((prev) => ({
                  ...prev,
                  startTime,
                  endTime,
                }));
              }}
            />
          )}

          {selectedDate && !showLoading && !slotError && (
            <p className="mt-3 text-xs text-[var(--task-text-muted)]">
              Showing only available time slots.
            </p>
          )}
        </section>
      )}

      {!isRange && scheduleMode === "CUSTOM" && (
        <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--task-text)]">
            Time slots per date
          </h2>

          {!selectedDateStrs.length ? (
            <Notice>Select dates to add time slots.</Notice>
          ) : (
            <div className="space-y-3">
              {selectedDateStrs.map((dateStr) => {
                const label = new Date(`${dateStr}T00:00:00`).toDateString();
                const dateSlots = slotsByDate[dateStr] || [
                  { startTime: "", endTime: "" },
                ];

                return (
                  <div
                    key={dateStr}
                    className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-3 sm:p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-[var(--task-text)]">
                        {label}
                      </div>

                      <button
                        type="button"
                        className="min-h-10 rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 py-2 text-xs font-semibold text-[var(--task-primary)] hover:bg-[var(--task-surface-soft)]"
                        onClick={() => {
                          clearError?.();
                          addSlot(dateStr);
                        }}
                      >
                        Add time
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {dateSlots.map((slot, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-1 gap-3 rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                        >
                          <div>
                            <label htmlFor={`${dateStr}-${idx}-start`} className="block text-xs font-medium text-[var(--task-text-muted)]">
                              Start
                            </label>
                            <input
                              type="time"
                              id={`${dateStr}-${idx}-start`}
                              min={BOOKING_WINDOW_START}
                              max={BOOKING_WINDOW_END}
                              value={slot.startTime}
                              onChange={(e) => {
                                clearError?.();
                                updateSlot(dateStr, idx, {
                                  startTime: e.target.value,
                                });
                              }}
                              className="mt-1 block min-h-11 w-full rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] px-3 py-2"
                            />
                          </div>

                          <div>
                            <label htmlFor={`${dateStr}-${idx}-end`} className="block text-xs font-medium text-[var(--task-text-muted)]">
                              End
                            </label>
                            <input
                              type="time"
                              id={`${dateStr}-${idx}-end`}
                              min={BOOKING_WINDOW_START}
                              max={BOOKING_WINDOW_END}
                              value={slot.endTime}
                              onChange={(e) => {
                                clearError?.();
                                updateSlot(dateStr, idx, {
                                  endTime: e.target.value,
                                });
                              }}
                              className="mt-1 block min-h-11 w-full rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] px-3 py-2"
                            />
                          </div>

                          <button
                            type="button"
                            className="min-h-11 rounded-[var(--task-radius-control)] px-3 py-2 text-sm font-semibold text-[var(--task-danger)] hover:bg-[var(--task-danger-soft)]"
                            onClick={() => {
                              clearError?.();
                              removeSlot(dateStr, idx);
                            }}
                            disabled={dateSlots.length <= 1}
                          >
                            Remove time
                          </button>
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 text-xs text-[var(--task-text-muted)]">
                      Booking window: 7:00 AM to 10:00 PM.
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
