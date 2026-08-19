// src/app/dashboard/sitter/_components/TodayVisitsSection.jsx
"use client";

import VisitCard from "./VisitCard";
import { Notice, SectionHeader, StatusBadge } from "@/components/ui/Foundation";

export default function TodayVisitsSection({
  visits = [],
  now = new Date(),
  onCompleteVisit,
}) {
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
    </section>
  );
}
