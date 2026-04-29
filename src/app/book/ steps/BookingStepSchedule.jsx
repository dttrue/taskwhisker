// src/app/book/steps/BookingStepSchedule.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdaptiveCalendar from "@/components/calendar/AdaptiveCalendar";
import TimeSlotPicker from "@/components/calendar/TimeSlotPicker";
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
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-2 text-sm font-medium text-zinc-900">
            Time options
          </div>

          <div className="join w-full join-vertical sm:join-horizontal">
            <button
              type="button"
              className={`btn btn-sm join-item ${
                scheduleMode === "SAME" ? "btn-primary" : "btn-ghost"
              }`}
              onClick={handleSameMode}
            >
              Same time for all dates
            </button>

            <button
              type="button"
              className={`btn btn-sm join-item ${
                scheduleMode === "CUSTOM" ? "btn-primary" : "btn-ghost"
              }`}
              onClick={handleCustomMode}
            >
              Different times per date
            </button>
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            Use “Different times per date” for two walks in one day.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-white p-4">
        <p className="mb-3 text-sm font-medium text-zinc-900">Select dates</p>

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
      </div>

      {isRange && (
        <div className="rounded-xl border bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Start time
              </label>
              <input
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
                className="mt-1 block w-full rounded-lg border px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900">
                End time
              </label>
              <input
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
                className="mt-1 block w-full rounded-lg border px-3 py-2"
              />
            </div>
          </div>
        </div>
      )}

      {!isRange && usesSlotPicker && (
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-zinc-900">Available Times</p>
            <p className="text-xs text-zinc-500">
              Select a time slot for this visit.
            </p>
          </div>

          {!selectedDate ? (
            <p className="text-sm text-zinc-600">
              Select a date to see available times.
            </p>
          ) : showLoading ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              Loading available times...
            </div>
          ) : slotError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {slotError}
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              No available times for this date.
            </div>
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
            <p className="mt-2 text-xs text-zinc-500">
              Showing only available time slots.
            </p>
          )}
        </div>
      )}

      {!isRange && scheduleMode === "CUSTOM" && (
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 text-sm font-medium text-zinc-900">
            Time slots per date
          </div>

          {!selectedDateStrs.length ? (
            <p className="text-xs text-zinc-500">
              Select dates to add time slots.
            </p>
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
                    className="rounded-xl border bg-zinc-50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-zinc-900">
                        {label}
                      </div>

                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={() => {
                          clearError?.();
                          addSlot(dateStr);
                        }}
                      >
                        + Add time
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {dateSlots.map((slot, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                        >
                          <div>
                            <label className="block text-xs text-zinc-600">
                              Start
                            </label>
                            <input
                              type="time"
                              min={BOOKING_WINDOW_START}
                              max={BOOKING_WINDOW_END}
                              value={slot.startTime}
                              onChange={(e) => {
                                clearError?.();
                                updateSlot(dateStr, idx, {
                                  startTime: e.target.value,
                                });
                              }}
                              className="mt-1 block w-full rounded-lg border px-3 py-2"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-zinc-600">
                              End
                            </label>
                            <input
                              type="time"
                              min={BOOKING_WINDOW_START}
                              max={BOOKING_WINDOW_END}
                              value={slot.endTime}
                              onChange={(e) => {
                                clearError?.();
                                updateSlot(dateStr, idx, {
                                  endTime: e.target.value,
                                });
                              }}
                              className="mt-1 block w-full rounded-lg border px-3 py-2"
                            />
                          </div>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              clearError?.();
                              removeSlot(dateStr, idx);
                            }}
                            disabled={dateSlots.length <= 1}
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <p className="mt-2 text-xs text-zinc-500">
                      Booking window: 7:00 AM to 10:00 PM.
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
