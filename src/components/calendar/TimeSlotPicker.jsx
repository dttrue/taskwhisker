// src/components/calendar/TimeSlotPicker.jsx
"use client";

import { formatTime12h } from "@/utils/formatTime";
import { Notice } from "@/components/ui/Foundation";

export default function TimeSlotPicker({
  slots = [],
  selectedSlot = null,
  onSelectSlot,
  emptyMessage = "No time slots available for this date.",
}) {
  const availableSlots = slots.filter((slot) => slot.available);

  if (!availableSlots.length) {
    return (
      <Notice>{emptyMessage}</Notice>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
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
                "min-h-14 rounded-[var(--task-radius-control)] border p-3 text-left transition-colors",
                isSelected
                  ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white"
                  : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]",
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
    </div>
  );
}
