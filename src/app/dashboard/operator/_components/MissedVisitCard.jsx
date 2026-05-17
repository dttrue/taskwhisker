// src/app/dashboard/operator/_components/MissedVisitCard.jsx
"use client";

import { useState } from "react";
import ReviewSubmitButton from "./ReviewSubmitButton";

function formatDateOnly(value) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeOnly(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MissedVisitCard({
  visit,
  reviewMissedVisit,
  isTriageMode,
  nextBookingId,
}) {
  const [isFading, setIsFading] = useState(false);

  const handleSubmit = () => {
    setIsFading(true);
  };

  return (
    <div
      className={`rounded-lg border border-red-200 bg-white p-3 text-sm transition-all duration-300 ${
        isFading ? "scale-95 opacity-0" : "scale-100 opacity-100"
      }`}
    >
      <div className="text-zinc-900 font-medium">
        Missed visit: {formatDateOnly(visit.startTime)} ·{" "}
        {formatTimeOnly(visit.startTime)}
      </div>

      <div className="text-xs text-zinc-500 mt-1">
        Ended at {formatTimeOnly(visit.endTime)}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <form
          onSubmit={handleSubmit}
          action={reviewMissedVisit.bind(null, {
            visitId: visit.id,
            status: "EXCUSED",
            note: "Operator marked as excused",
            isTriageMode,
            nextBookingId,
          })}
        >
          <ReviewSubmitButton
            pendingText="Excusing..."
            className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white"
          >
            Excuse
          </ReviewSubmitButton>
        </form>

        <form
          onSubmit={handleSubmit}
          action={reviewMissedVisit.bind(null, {
            visitId: visit.id,
            status: "SITTER_FAULT",
            note: "Operator marked sitter fault",
            isTriageMode,
            nextBookingId,
          })}
        >
          <ReviewSubmitButton
            pendingText="Saving..."
            className="rounded-md border border-red-600 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-600 hover:text-white"
          >
            Sitter fault
          </ReviewSubmitButton>
        </form>

        <form
          onSubmit={handleSubmit}
          action={reviewMissedVisit.bind(null, {
            visitId: visit.id,
            status: "NEEDS_FOLLOW_UP",
            note: "Operator marked follow-up",
            isTriageMode,
            nextBookingId,
          })}
        >
          <ReviewSubmitButton
            pendingText="Saving..."
            className="rounded-md border border-amber-600 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-600 hover:text-white"
          >
            Follow up
          </ReviewSubmitButton>
        </form>
      </div>
    </div>
  );
}