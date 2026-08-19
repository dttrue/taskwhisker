// src/app/dashboard/sitter/_components/StatCard.jsx

export default function StatCard({ title, label, value, helper, subtext }) {
  const displayTitle = title || label;
  const displayHelper = helper || subtext;

  return (
    <div className="rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-4 shadow-[var(--task-shadow-card)] sm:p-5">
      {displayTitle ? (
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]">
          {displayTitle}
        </div>
      ) : null}

      <div className="mt-2 break-words text-2xl font-bold tracking-[-0.025em] text-[var(--task-text)]">{value}</div>

      {displayHelper ? (
        <div className="mt-1 text-sm leading-5 text-[var(--task-text-muted)]">{displayHelper}</div>
      ) : null}
    </div>
  );
}
