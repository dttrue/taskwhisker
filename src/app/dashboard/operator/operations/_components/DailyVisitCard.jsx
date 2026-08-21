import { Button, Card, StatusBadge } from "@/components/ui/Foundation";

const STATUS_PRESENTATION = {
  UPCOMING: { label: "Upcoming", tone: "neutral" },
  CURRENT: { label: "Current", tone: "success" },
  MISSED: { label: "Missed", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
  CANCELED: { label: "Canceled", tone: "danger" },
  SCHEDULED: { label: "Scheduled", tone: "neutral" },
};

function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function DailyVisitCard({ visit, formatTime }) {
  const presentation =
    STATUS_PRESENTATION[visit.operationalStatus] ||
    STATUS_PRESENTATION.SCHEDULED;

  return (
    <Card as="article" className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[8rem_minmax(0,1fr)_auto] lg:items-start">
        <div className="flex items-center justify-between gap-3 lg:block">
          <p className="text-lg font-bold text-[var(--task-primary)]">
            {formatTime(visit.startTime)}
          </p>
          <p className="text-sm font-medium text-[var(--task-text-muted)] lg:mt-1">
            until {formatTime(visit.endTime)}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-lg font-bold tracking-[-0.02em] text-[var(--task-text)]">
              {visit.petDisplayName}
            </h2>
            <StatusBadge tone={presentation.tone}>
              {presentation.label}
            </StatusBadge>
            {!visit.sitterId ? (
              <StatusBadge tone="warning">Unassigned</StatusBadge>
            ) : null}
          </div>

          {visit.showServiceContext ? (
            <p className="mt-1 break-words text-sm font-medium text-[var(--task-text)]">
              {visit.serviceSummary}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--task-text-muted)]">
            <span className="break-words">Owner: {visit.ownerName}</span>
            <span className="break-words">
              Sitter: {visit.sitterName || "Unassigned"}
            </span>
            <span>Payout: {formatMoney(visit.payoutPerVisitCents)}</span>
          </div>

          {visit.address ? (
            <p className="mt-2 break-words text-sm leading-6 text-[var(--task-text-muted)]">
              {visit.address}
            </p>
          ) : null}

          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--task-text-muted)]">
            Visit status: {visit.status.toLowerCase()}
          </p>
        </div>

        <div className="grid gap-2 min-[380px]:grid-cols-2 lg:flex lg:flex-col">
          <Button
            href={`/dashboard/operator/bookings/${visit.bookingId}`}
            variant="secondary"
          >
            View booking
          </Button>
          {visit.hasConversation ? (
            <Button
              href={`/dashboard/messages/${visit.bookingId}`}
              variant="quiet"
            >
              Message
            </Button>
          ) : (
            <span className="inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-medium text-[var(--task-text-muted)]">
              No message thread
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
