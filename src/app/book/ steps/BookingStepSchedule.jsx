"use client";

import AdaptiveCalendar from "@/components/AdaptiveCalendar";
import { BOOKING_WINDOW_START, BOOKING_WINDOW_END } from "../bookingTimeUtils";

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
}) {
  function handleSameMode() {
    setScheduleMode("SAME");
  }

  function handleCustomMode() {
    setScheduleMode("CUSTOM");
    syncSlotsForDates(selectedDateStrs);
  }

  function updateSharedTime(field, value) {
    setTimes((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

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
              isRange={isRange}
              range={range}
              onRangeChange={handleRangeChange}
              dates={dates}
              onDatesChange={handleDatesChange}
            />
          </div>
        </div>
      </div>

      {(isRange || scheduleMode === "SAME") && (
        <div className="rounded-xl border bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Start time
              </label>
              <input
                name="startTime"
                type="time"
                min={BOOKING_WINDOW_START}
                max={BOOKING_WINDOW_END}
                value={times.startTime}
                onChange={(e) => updateSharedTime("startTime", e.target.value)}
                className="mt-1 block w-full rounded-lg border px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900">
                End time
              </label>
              <input
                name="endTime"
                type="time"
                min={BOOKING_WINDOW_START}
                max={BOOKING_WINDOW_END}
                value={times.endTime}
                onChange={(e) => updateSharedTime("endTime", e.target.value)}
                className="mt-1 block w-full rounded-lg border px-3 py-2"
              />
            </div>
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            Booking window: 7:00 AM to 10:00 PM.
          </p>
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
                const slots = slotsByDate[dateStr] || [
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
                        onClick={() => addSlot(dateStr)}
                      >
                        + Add time
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {slots.map((slot, idx) => (
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
                              onChange={(e) =>
                                updateSlot(dateStr, idx, {
                                  startTime: e.target.value,
                                })
                              }
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
                              onChange={(e) =>
                                updateSlot(dateStr, idx, {
                                  endTime: e.target.value,
                                })
                              }
                              className="mt-1 block w-full rounded-lg border px-3 py-2"
                            />
                          </div>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeSlot(dateStr, idx)}
                            disabled={slots.length <= 1}
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
