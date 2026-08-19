"use client";

import VisitCard from "./VisitCard";
import { Notice, SectionHeader, StatusBadge } from "@/components/ui/Foundation";

export default function UpcomingVisitsSection({
  visits = [],
  now = new Date(),
}) {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Upcoming"
        meta={<StatusBadge>{visits.length} scheduled</StatusBadge>}
        description={
          visits.length === 0
            ? "Nothing is scheduled after today."
            : visits.length === 1
            ? "1 upcoming visit scheduled."
            : `${visits.length} upcoming visits scheduled.`
        }
      />

      {visits.length === 0 ? (
        <Notice>No upcoming visits scheduled.</Notice>
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
