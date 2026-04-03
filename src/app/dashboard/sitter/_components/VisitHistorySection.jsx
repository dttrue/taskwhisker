// src/app/dashboard/sitter/_components/VisitHistorySection.jsx
"use client";

import VisitCard from "./VisitCard";

export default function VisitHistorySection({
  title,
  description,
  visits = [],
  now = new Date(),
  emptyMessage = "No visits found.",
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          {emptyMessage}
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