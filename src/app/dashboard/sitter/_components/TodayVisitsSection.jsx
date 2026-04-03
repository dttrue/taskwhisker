"use client";

import VisitCard from "./VisitCard";

export default function TodayVisitsSection({
  visits = [],
  now = new Date(),
  onCompleteVisit,
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Today</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {visits.length === 0
            ? "You're all caught up for today."
            : visits.length === 1
            ? "1 stop remaining today."
            : `${visits.length} stops remaining today.`}
        </p>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          No remaining stops for today.
        </div>
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
