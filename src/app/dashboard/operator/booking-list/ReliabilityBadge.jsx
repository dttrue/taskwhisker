// src/app/dashboard/operator/booking-list/ReliabilityBadge.jsx

export function ReliabilityBadge({ reliability }) {
  if (!reliability || reliability.level === "excellent") return null;

  const classes =
    reliability.tone === "red"
      ? "bg-red-100 text-red-900"
      : reliability.tone === "amber"
      ? "bg-amber-100 text-amber-900"
      : "bg-zinc-100 text-zinc-700";

  const dotClass =
    reliability.tone === "red"
      ? "bg-red-500"
      : reliability.tone === "amber"
      ? "bg-amber-500"
      : "bg-zinc-400";

  return (
    <div
      className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {reliability.label} ({reliability.score})
    </div>
  );
}


