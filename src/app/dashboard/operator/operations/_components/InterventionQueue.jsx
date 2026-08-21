import {
  Button,
  Card,
  SectionHeader,
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

export default function InterventionQueue({ issues = [] }) {
  return (
    <section aria-labelledby="interventions-heading" className="space-y-3">
      <SectionHeader
        title="Needs Attention"
        description="Operational issues that require operator review or assignment."
        meta={
          <span className="text-sm font-semibold text-[var(--task-text-muted)]">
            {issues.length} open issue{issues.length === 1 ? "" : "s"}
          </span>
        }
      />

      {issues.length === 0 ? (
        <Card className="border-[#c9dfd4] bg-[#f5faf7] p-5 text-sm text-[var(--task-text-muted)]">
          No operational issues require attention right now.
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {issues.map((issue) => {
            const priority =
              PRIORITY_PRESENTATION[issue.priority] ||
              PRIORITY_PRESENTATION.NORMAL;
            const showServiceContext =
              Boolean(issue.serviceSummary) &&
              issue.serviceSummary !== issue.petDisplayName;

            return (
              <Card as="article" key={issue.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--task-primary)]">
                      {issue.title}
                    </p>
                    <h3 className="mt-1 break-words text-lg font-bold text-[var(--task-text)]">
                      {issue.petDisplayName}
                    </h3>
                    {showServiceContext ? (
                      <p className="mt-1 break-words text-sm text-[var(--task-text-muted)]">
                        {issue.serviceSummary}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
                </div>

                <p className="mt-3 text-sm leading-6 text-[var(--task-text-muted)]">
                  {issue.description}
                </p>
                <dl className="mt-3 grid gap-1 text-sm text-[var(--task-text-muted)] sm:grid-cols-2">
                  <div className="break-words">
                    <dt className="sr-only">Owner</dt>
                    <dd>Owner: {issue.ownerName}</dd>
                  </div>
                  <div className="break-words">
                    <dt className="sr-only">Sitter</dt>
                    <dd>Sitter: {issue.sitterName || "Unassigned"}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
                  <p className="text-xs font-semibold text-[var(--task-text-muted)]">
                    {formatIssueTime(issue.timestamp)} · New Jersey time
                  </p>
                  <Button href={issue.actionHref} variant="secondary">
                    {issue.actionLabel}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
