// src/components/AdaptiveCalendar.jsx
"use client";

import { DayPicker } from "react-day-picker";

export default function AdaptiveCalendar({
  serviceType,
  range,
  setRange,
  dates,
  setDates,
}) {
  const isRange = serviceType === "OVERNIGHT";

  return (
    <div className="p-3 border rounded-xl bg-base-100">
      <DayPicker
        mode={isRange ? "range" : "multiple"}
        selected={isRange ? range : dates}
        onSelect={isRange ? setRange : setDates}
        numberOfMonths={1}
        showOutsideDays
        captionLayout="dropdown"
        disabled={{ before: new Date() }}
        fixedWeeks
        className="text-base"
        classNames={{
          months: "flex justify-center",
          month: "space-y-3",
          caption: "flex justify-between items-center px-2",
          caption_label: "text-sm font-semibold",
          nav: "flex gap-2",
          nav_button: "btn btn-ghost btn-xs",
          table: "w-full border-separate border-spacing-y-1",
          head_row: "text-xs opacity-70",
          row: "",
          cell: "text-center",
          day: "h-10 w-10 rounded-full hover:bg-base-200 transition",
          day_selected: "bg-black text-white hover:bg-black",
          day_today: "ring-2 ring-base-300",
          day_range_middle: "bg-base-200 rounded-full",
          day_range_start: "bg-black text-white rounded-full",
          day_range_end: "bg-black text-white rounded-full",
        }}
      />
    </div>
  );
}
