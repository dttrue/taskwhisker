// src/app/dashboard/sitter/_components/StatCard.jsx
export default function StatCard({ label, value, subtext }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900">{value}</div>
      {subtext ? (
        <div className="mt-1 text-xs text-zinc-500">{subtext}</div>
      ) : null}
    </div>
  );
}
