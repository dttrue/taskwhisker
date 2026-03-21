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
    <div className="mx-auto flex w-full justify-center">
      <div className="w-fit rounded-xl">
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
            caption_label: "text-sm font-semibold",
            nav: "absolute right-1 top-1 flex items-center gap-1",
            nav_button: "btn btn-circle btn-ghost btn-xs",
            table: "mx-auto border-collapse",
            head_row: "flex",
            head_cell: "w-10 text-center text-xs font-medium text-zinc-500",
            row: "mt-1 flex w-full justify-center",
            cell: "h-10 w-10 p-0 text-center text-sm relative",
            day: "h-10 w-10 rounded-full p-0 font-normal transition-all duration-150 hover:bg-base-200",
            day_selected: "bg-black text-white hover:bg-black",
            day_today: "ring-2 ring-base-300",
            day_outside: "text-zinc-300",
            day_disabled: "text-zinc-300 opacity-40",
            day_range_middle: "text-zinc-900 rounded-none",
            day_range_start: "bg-black text-white rounded-l-full",
            day_range_end: "bg-black text-white rounded-r-full",
          }}
        />
      </div>
    </div>
  );
}
