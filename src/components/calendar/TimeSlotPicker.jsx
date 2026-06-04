// src/components/calendar/TimeSlotPicker.jsx
"use client";

import { formatTime12h } from "@/utils/formatTime";

export default function TimeSlotPicker({
  slots = [],
  selectedSlot = null,
  onSelectSlot,
  emptyMessage = "No time slots available for this date.",
}) {
  const availableSlots = slots.filter((slot) => slot.available);

  if (!availableSlots.length) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">
          Available Times
        </h2>

        <p className="mt-1 text-sm text-zinc-600">
          Select a time slot for this visit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {availableSlots.map((slot) => {
          const isSelected =
            selectedSlot &&
            selectedSlot.startTime === slot.startTime &&
            selectedSlot.endTime === slot.endTime;

          return (
            <button
              key={`${slot.startTime}-${slot.endTime}`}
              type="button"
              onClick={() => onSelectSlot?.(slot)}
              className={[
                "rounded-xl border p-3 text-left transition",
                "focus:outline-none focus:ring-2 focus:ring-black/20",
                isSelected
                  ? "border-black bg-black text-white"
                  : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400 hover:bg-zinc-50",
              ].join(" ")}
              aria-pressed={isSelected}
            >
              <div className="font-medium">
                {formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}
              </div>

              <div className="mt-1 text-xs opacity-75">
                {isSelected ? "Selected" : "Available"}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        Showing only available time slots.
      </p>
    </div>
  );
}
