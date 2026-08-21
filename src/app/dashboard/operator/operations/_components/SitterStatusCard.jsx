import { Button, Card, StatusBadge } from "@/components/ui/Foundation";

function StopSummary({ label, visit, emptyText, formatTime }) {
  return (
    <div className="min-w-0 rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--task-primary)]">
        {label}
      </p>
      {visit ? (
        <div className="mt-1.5 min-w-0">
          <p className="break-words font-bold text-[var(--task-text)]">
            {visit.petDisplayName}
          </p>
          {visit.showServiceContext ? (
            <p className="mt-0.5 break-words text-sm text-[var(--task-text-muted)]">
              {visit.serviceSummary}
            </p>
          ) : null}
          <p className="mt-1 text-sm font-medium text-[var(--task-text-muted)]">
            {formatTime(visit.startTime)}–{formatTime(visit.endTime)}
          </p>
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-[var(--task-text-muted)]">
          {emptyText}
        </p>
      )}
    </div>
  );
}

export default function SitterStatusCard({
  sitter,
  formatTime,
  isScheduleFiltered = false,
}) {
  const hasCurrentVisit = Boolean(sitter.currentVisit);
  const hasMissedVisits = sitter.missed > 0;
  const dayIsComplete = sitter.remaining === 0;

  return (
    <Card as="article" className="flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-bold tracking-[-0.02em] text-[var(--task-text)]">
            {sitter.name}
          </h3>
          <p className="mt-1 text-sm text-[var(--task-text-muted)]">
            {sitter.total} visit{sitter.total === 1 ? "" : "s"} today
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {hasCurrentVisit ? (
            <StatusBadge tone="success">Scheduled current</StatusBadge>
          ) : null}
          {hasMissedVisits ? (
            <StatusBadge tone="warning">
              {sitter.missed} missed
            </StatusBadge>
          ) : null}
          {dayIsComplete ? (
            <StatusBadge tone="info">Day complete</StatusBadge>
          ) : null}
          {isScheduleFiltered ? (
            <StatusBadge tone="neutral">Schedule filtered</StatusBadge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StopSummary
          label="Current"
          visit={sitter.currentVisit}
          emptyText="No scheduled-current visit"
          formatTime={formatTime}
        />
        <StopSummary
          label="Next"
          visit={sitter.nextVisit}
          emptyText="No upcoming stops"
          formatTime={formatTime}
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-[var(--task-radius-control)] bg-[var(--task-surface-soft)] px-2 py-3">
          <dt className="text-xs font-semibold text-[var(--task-text-muted)]">
            Completed
          </dt>
          <dd className="mt-1 text-lg font-bold text-[var(--task-text)]">
            {sitter.completed}
          </dd>
        </div>
        <div className="rounded-[var(--task-radius-control)] bg-[var(--task-surface-soft)] px-2 py-3">
          <dt className="text-xs font-semibold text-[var(--task-text-muted)]">
            Remaining
          </dt>
          <dd className="mt-1 text-lg font-bold text-[var(--task-text)]">
            {sitter.remaining}
          </dd>
        </div>
        <div className="rounded-[var(--task-radius-control)] bg-[var(--task-surface-soft)] px-2 py-3">
          <dt className="text-xs font-semibold text-[var(--task-text-muted)]">
            Missed
          </dt>
          <dd className="mt-1 text-lg font-bold text-[var(--task-text)]">
            {sitter.missed}
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-4">
        <Button
          href={`/dashboard/operator/operations?sitter=${encodeURIComponent(
            sitter.id
          )}`}
          variant={isScheduleFiltered ? "primary" : "secondary"}
          className="w-full"
        >
          {isScheduleFiltered ? "Viewing schedule" : `View ${sitter.name}'s schedule`}
        </Button>
      </div>
    </Card>
  );
}
