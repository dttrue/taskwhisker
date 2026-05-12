// src/app/dashboard/operator/booking-list/RiskySitterSummary.jsx
export default function RiskySitterSummary({ riskySitters = [] }) {
  if (!riskySitters.length) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <p className="text-sm font-semibold text-amber-900">
        ⚠️ Sitter reliability alerts ({riskySitters.length})
      </p>

      <p className="text-xs text-amber-800 mt-1">
        Based on missed visits, late arrivals, and follow-ups
      </p>

      <div className="mt-3 space-y-2">
        {riskySitters.slice(0, 3).map((sitter) => (
          <div
            key={sitter.sitterId}
            className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium text-zinc-900">
                {sitter.sitterName}
              </div>
              <div className="text-xs text-amber-800">
                {sitter.unresolvedMissedCount} unresolved missed ·{" "}
                {sitter.sitterFaultCount} sitter fault · {sitter.followUpCount}{" "}
                follow-up · {sitter.lateCount} late
              </div>
            </div>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                sitter.reliability.tone === "red"
                  ? "bg-red-100 text-red-900"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {sitter.reliability.label} · Score {sitter.reliability.score}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
