// src/components/calendar/TimeSlotPicker.jsx
"use client";

import { formatTime12h } from "@/utils/formatTime";

function formatSlotLabel(slot) {
  return `${slot.start} – ${slot.end}`;
}

export default function TimeSlotPicker({
  slots = [],
  selectedSlot = null,
  onSelectSlot,
  showBlockedReasons = true,
  emptyMessage = "No time slots available for this date.",
}) {
  if (!slots.length) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
        {emptyMessage}
      </div>
    );
  }

  if (!slots.available) {
    // disable click
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Available Times</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Select a time slot for this visit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map((slot) => {
          const isSelected =
            selectedSlot &&
            selectedSlot.startTime === slot.startTime &&
            selectedSlot.endTime === slot.endTime;

          const isBlocked = !slot.available;

          return (
            <button
              key={slot.startTime}
              type="button"
              disabled={isBlocked}
              onClick={() => {
                if (isBlocked) return;
                onSelectSlot?.(slot);
              }}
              className={[
                "rounded-xl border p-3 text-left transition",
                "focus:outline-none focus:ring-2 focus:ring-black/20",
                isBlocked
                  ? "cursor-not-allowed border-red-200 bg-red-50 text-red-700 opacity-80"
                  : isSelected
                  ? "border-black bg-black text-white"
                  : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400 hover:bg-zinc-50",
              ].join(" ")}
              aria-pressed={isSelected}
            >
              <div>
                {formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}
              </div>

              <div className="mt-1 text-xs opacity-75">
                {isBlocked
                  ? showBlockedReasons
                    ? slot.reason || "Unavailable"
                    : "Unavailable"
                  : isSelected
                  ? "Selected"
                  : "Available"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}