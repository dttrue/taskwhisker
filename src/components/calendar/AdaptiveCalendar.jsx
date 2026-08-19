// src/components/AdaptiveCalendar.jsx
"use client";

import { DayPicker } from "react-day-picker";

export default function AdaptiveCalendar({
  serviceType,
  range,
  onRangeChange,
  dates,
  onDatesChange,
}) {
  const isRange = serviceType === "OVERNIGHT";

  return (
    <div className="mx-auto flex w-full justify-center overflow-x-auto pb-1">
      <div className="w-fit rounded-[var(--task-radius-control)]">
        <DayPicker
          mode={isRange ? "range" : "multiple"}
          selected={
            isRange
              ? range
              : (dates || []).map((dateStr) => new Date(`${dateStr}T00:00:00`))
          }
          onSelect={(value) => {
            if (isRange) {
              onRangeChange?.(value);
              return;
            }

            const formattedDates = (value || []).map((d) =>
              d.toISOString().slice(0, 10)
            );

            onDatesChange?.(formattedDates);
          }}
          numberOfMonths={1}
          showOutsideDays
          captionLayout="dropdown"
          disabled={{ before: new Date() }}
          fixedWeeks
          className="rdp-root mx-auto"
          classNames={{
            months: "flex justify-center",
            month: "mx-auto space-y-3",
            caption: "relative flex items-center justify-center pt-1",
            caption_label: "text-sm font-semibold text-[var(--task-text)]",
            nav: "absolute right-1 top-1 flex items-center gap-1",
            nav_button: "min-h-10 min-w-10 rounded-full text-[var(--task-primary)] transition-colors hover:bg-[var(--task-surface-soft)]",
            table: "mx-auto border-collapse",
            head_row: "flex",
            head_cell: "w-10 text-center text-xs font-medium text-[var(--task-text-muted)]",
            row: "mt-1 flex w-full justify-center",
            cell: "h-10 w-10 p-0 text-center text-sm relative",
            day: "h-10 w-10 rounded-full p-0 font-normal text-[var(--task-text)] transition-colors hover:bg-[var(--task-surface-soft)]",
            day_selected: "bg-[var(--task-primary)] text-white hover:bg-[var(--task-primary-hover)]",
            day_today: "ring-2 ring-[var(--task-accent)] ring-offset-1",
            day_outside: "text-[#aaa69e]",
            day_disabled: "text-[#aaa69e] opacity-45",
            day_range_middle: "rounded-none text-[var(--task-text)]",
            day_range_start: "rounded-l-full bg-[var(--task-primary)] text-white",
            day_range_end: "rounded-r-full bg-[var(--task-primary)] text-white",
          }}
        />
      </div>
    </div>
  );
}
