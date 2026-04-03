"use client";

import VisitCard from "./VisitCard";

export default function UpcomingVisitsSection({
  visits = [],
  now = new Date(),
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Upcoming</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {visits.length === 0
            ? "Nothing is scheduled after today."
            : visits.length === 1
            ? "1 upcoming visit scheduled."
            : `${visits.length} upcoming visits scheduled.`}
        </p>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          No upcoming visits scheduled.
        </div>
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
