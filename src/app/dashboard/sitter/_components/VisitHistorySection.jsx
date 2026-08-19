// src/app/dashboard/sitter/_components/VisitHistorySection.jsx
"use client";

import VisitCard from "./VisitCard";
import { Notice, SectionHeader, StatusBadge } from "@/components/ui/Foundation";

export default function VisitHistorySection({
  title,
  description,
  visits = [],
  now = new Date(),
  emptyMessage = "No visits found.",
}) {
  return (
    <section className="space-y-4">
      <SectionHeader
        title={title}
        description={description}
        meta={<StatusBadge tone={title === "Missed Visits" ? "warning" : "neutral"}>{visits.length}</StatusBadge>}
      />

      {visits.length === 0 ? (
        <Notice>{emptyMessage}</Notice>
      ) : (
        <div className="grid gap-3">
          {visits.map((entry) => (
            <VisitCard key={entry.id} entry={entry} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
