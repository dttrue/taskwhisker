// src/app/dashboard/sitter/_components/TodayVisitsSection.jsx
"use client";

import { useState } from "react";

import { ParticipantVisitCard } from './ParticipantVisit';
import VisitCard from "./VisitCard";
import { Notice, SectionHeader, StatusBadge } from "@/components/ui/Foundation";

export default function TodayVisitsSection({
  visits = [],
  coverageVisits = [],
  now = new Date(),
  onCompleteVisit,
}) {
  const [isOpen, setIsOpen] = useState(true);

  const count = visits.length + coverageVisits.length;
  const entries = [...visits.map(entry => ({ entry, coverage: false })), ...coverageVisits.map(entry => ({ entry, coverage: true }))].sort((a, b) => new Date(a.entry.visit.startTime) - new Date(b.entry.visit.startTime));

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Today"
        meta={<StatusBadge tone={count ? "success" : "neutral"}>{count} remaining</StatusBadge>}
        description={
          count === 0
            ? "You're all caught up for today."
            : count === 1
            ? "1 stop remaining today."
            : `${count} stops remaining today.`
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
          {count === 0 ? (
            <Notice>No remaining stops for today.</Notice>
          ) : (
            <div className="grid gap-3">
              {entries.map(({ entry, coverage }) => coverage ? <ParticipantVisitCard key={entry.id} entry={entry} /> : (
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
