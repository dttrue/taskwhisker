// src/app/dashboard/sitter/_components/StatCard.jsx

export default function StatCard({ title, label, value, helper, subtext }) {
  const displayTitle = title || label;
  const displayHelper = helper || subtext;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {displayTitle ? (
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {displayTitle}
        </div>
      ) : null}

      <div className="mt-2 text-2xl font-semibold text-zinc-900">{value}</div>

      {displayHelper ? (
        <div className="mt-1 text-xs text-zinc-500">{displayHelper}</div>
      ) : null}
    </div>
  );
}
