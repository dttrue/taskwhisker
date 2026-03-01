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
    <div className="p-4">
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
          day: "h-10 w-10 rounded-md hover:bg-gray-200",
          day_selected: "bg-black text-white",
          day_range_middle: "bg-gray-200",
          day_range_start: "bg-black text-white",
          day_range_end: "bg-black text-white",
        }}
      />
    </div>
  );
}
