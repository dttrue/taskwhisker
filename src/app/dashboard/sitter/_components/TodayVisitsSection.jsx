// src/app/dashboard/sitter/_components/TodayVisitsSection.jsx
"use client";

import { useState } from "react";

import VisitCard from "./VisitCard";
import { Notice, SectionHeader, StatusBadge } from "@/components/ui/Foundation";

export default function TodayVisitsSection({
  visits = [],
  now = new Date(),
  onCompleteVisit,
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Today"
        meta={<StatusBadge tone={visits.length ? "success" : "neutral"}>{visits.length} remaining</StatusBadge>}
        description={
          visits.length === 0
            ? "You're all caught up for today."
            : visits.length === 1
            ? "1 stop remaining today."
            : `${visits.length} stops remaining today.`
        }
      />

      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="today-visits-content"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--task-text)] transition hover:bg-[var(--task-surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-3"
      >
        {isOpen ? "Hide today" : "Show today"}
      </button>

      {isOpen ? (
        <div id="today-visits-content">
          {visits.length === 0 ? (
            <Notice>No remaining stops for today.</Notice>
          ) : (
            <div className="grid gap-3">
              {visits.map((entry) => (
                <VisitCard
                  key={entry.id}
                  entry={entry}
                  now={now}
                  onComplete={onCompleteVisit}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
