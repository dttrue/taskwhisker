import {
  Button,
  Card,
  StatusBadge,
} from "@/components/ui/Foundation";
import { BUSINESS_TIME_ZONE } from "@/lib/visits/visitOperations";

const PRIORITY_PRESENTATION = {
  URGENT: { label: "Urgent", tone: "danger" },
  HIGH: { label: "Needs attention", tone: "warning" },
  NORMAL: { label: "Review", tone: "info" },
};

function formatIssueTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function InterventionPreview({ issues = [], limit = 3 }) {
  const visibleIssues = issues.slice(0, limit);

  return (
    <Card as="section" className="flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]">
            Needs Attention
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
            {issues.length} open issue{issues.length === 1 ? "" : "s"}
          </h2>
        </div>
        <Button href="/dashboard/operator/operations" variant="secondary">
          View all in Operations
        </Button>
      </div>

      {visibleIssues.length === 0 ? (
        <p className="mt-5 rounded-[var(--task-radius-control)] bg-[var(--task-surface-soft)] px-4 py-3 text-sm text-[var(--task-text-muted)]">
          Nothing needs attention right now.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-[var(--task-border)] border-y border-[var(--task-border)]">
          {visibleIssues.map((issue) => {
            const priority =
              PRIORITY_PRESENTATION[issue.priority] ||
              PRIORITY_PRESENTATION.NORMAL;
            const showServiceContext =
              Boolean(issue.serviceSummary) &&
              issue.serviceSummary !== issue.petDisplayName;

            return (
              <article key={issue.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-[var(--task-text)]">
                      {issue.petDisplayName}
                    </p>
                    <p className="mt-0.5 break-words text-xs font-semibold text-[var(--task-primary)]">
                      {issue.title}
                    </p>
                  </div>
                  <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
                </div>
                {showServiceContext ? (
                  <p className="mt-1 break-words text-xs text-[var(--task-text-muted)]">
                    {issue.serviceSummary}
                  </p>
                ) : null}
                <p className="mt-1 break-words text-xs text-[var(--task-text-muted)]">
                  {issue.sitterName ? `Sitter: ${issue.sitterName}` : "Unassigned"}
                  {" · "}
                  {formatIssueTime(issue.timestamp)}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
