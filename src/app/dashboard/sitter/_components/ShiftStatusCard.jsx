// src/app/dashboard/sitter/_components/ShiftStatusCard.jsx
"use client";

import { formatDateTime } from "../lib/sitterDashboardUtils";

export default function ShiftStatusCard({
  overdueVisitCount = 0,
  todayVisitCount = 0,
  nextUp = null,
}) {
  const hasMissedVisits = overdueVisitCount > 0;
  const hasNextStop = Boolean(nextUp);

  let title = "You’re caught up";
  let description = "No urgent visits need attention right now.";
  let cardClass = "border-zinc-200 bg-white";
  let badgeClass = "bg-emerald-50 text-emerald-700";
  let badgeText = "On track";

  if (hasMissedVisits) {
    title = `${overdueVisitCount} missed visit${
      overdueVisitCount === 1 ? "" : "s"
    } need attention`;
    description =
      "Complete missed visits before continuing through the rest of your route.";
    cardClass = "border-amber-200 bg-amber-50";
    badgeClass = "bg-amber-100 text-amber-800";
    badgeText = "Action needed";
  } else if (hasNextStop) {
    title = `Next stop: ${nextUp.clientName || "Client"}`;
    description = nextUp.todayVisitStart
      ? `Scheduled for ${formatDateTime(nextUp.todayVisitStart)}.`
      : "Your next stop is ready in the route panel.";
    cardClass = "border-emerald-200 bg-emerald-50/50";
    badgeClass = "bg-emerald-100 text-emerald-800";
    badgeText = "Next up";
  } else if (todayVisitCount === 0) {
    title = "No remaining stops today";
    description = "You’re all caught up for today.";
  }

  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${cardClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Shift Status
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
        >
          {badgeText}
        </span>
      </div>
    </section>
  );
}
