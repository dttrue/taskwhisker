// src/app/dashboard/sitter/_components/ShiftStatusCard.jsx
"use client";

import { formatDateTime } from "../lib/sitterDashboardUtils";
import { StatusBadge } from "@/components/ui/Foundation";

export default function ShiftStatusCard({
  overdueVisitCount = 0,
  todayVisitCount = 0,
  currentStop = null,
  nextStop = null,
}) {
  const hasMissedVisits = overdueVisitCount > 0;
  const hasCurrentStop = Boolean(currentStop);
  const hasNextStop = Boolean(nextStop);

  let title = "You’re caught up";
  let description = "No urgent visits need attention right now.";
  let cardClass = "border-[var(--task-border)]";
  let badgeTone = "success";
  let badgeText = "On track";

  if (hasMissedVisits) {
    title = `${overdueVisitCount} missed visit${
      overdueVisitCount === 1 ? "" : "s"
    } need attention`;
    description =
      "Complete missed visits before continuing through the rest of your route.";
    cardClass = "border-[#dfbd77] border-l-4";
    badgeTone = "warning";
    badgeText = "Action needed";
  } else if (hasCurrentStop) {
    title = `Current stop: ${currentStop.clientName || "Client"}`;
    description = currentStop.todayVisitEnd
      ? `In progress until ${formatDateTime(currentStop.todayVisitEnd)}.`
      : "This visit is currently in progress.";
    cardClass = "border-[#b8d3c7] border-l-4";
    badgeText = "In progress";
  } else if (hasNextStop) {
    title = `Next stop: ${nextStop.clientName || "Client"}`;
    description = nextStop.todayVisitStart
      ? `Scheduled for ${formatDateTime(nextStop.todayVisitStart)}.`
      : "Your next stop is ready in the route panel.";
    cardClass = "border-[#b8d3c7] border-l-4";
    badgeText = "Next up";
  } else if (todayVisitCount === 0) {
    title = "No remaining stops today";
    description = "You’re all caught up for today.";
  }

  return (
    <section className={`rounded-[var(--task-radius-card)] border bg-white p-4 shadow-[var(--task-shadow-card)] sm:p-5 ${cardClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]">
            Shift Status
          </p>
          <h2 className="mt-2 text-lg font-bold tracking-[-0.02em] text-[var(--task-text)]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--task-text-muted)]">{description}</p>
        </div>

        <StatusBadge tone={badgeTone}>
          {badgeText}
        </StatusBadge>
      </div>
    </section>
  );
}
