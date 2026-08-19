// src/app/dashboard/sitter/_components/RouteNavigator.jsx

"use client";

export default function RouteNavigator({
  currentIndex = 0,
  totalStops = 0,
  previousStop = null,
  nextStop = null,
  lastGraceStop = null,
  showLastStop = false,
  onSelectBooking,
  compact = false,
}) {
  return (
    <div
      className={
        compact
          ? "rounded-[var(--task-radius-control)] border border-[#b8d3c7] bg-white/95 p-3 shadow-sm backdrop-blur"
          : "rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-4 shadow-sm"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className={
              compact
                ? "text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]"
                : "text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]"
            }
          >
            Route Controls
          </p>

          {!compact ? (
            <p className="mt-1 text-sm text-[var(--task-text-muted)]">
              Move through your remaining stops.
            </p>
          ) : null}
        </div>

        <div className="text-xs font-medium text-[var(--task-text-muted)]">
          Stop {totalStops > 0 ? currentIndex + 1 : 0} of {totalStops}
        </div>
      </div>

      <div className="mt-3 grid gap-2 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
        <button
          type="button"
          aria-label="Select previous route stop"
          onClick={() => previousStop && onSelectBooking?.(previousStop.id)}
          disabled={!previousStop}
          className="min-h-11 rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 py-2 text-sm font-semibold text-[var(--task-text)] hover:bg-[var(--task-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <button
          type="button"
          aria-label="Select next route stop"
          onClick={() => nextStop && onSelectBooking?.(nextStop.id)}
          disabled={!nextStop}
          className="min-h-11 rounded-[var(--task-radius-control)] border border-[var(--task-primary)] bg-[var(--task-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--task-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {compact ? "Jump to Next" : "Next Stop"}
        </button>

        {showLastStop && lastGraceStop ? (
          <button
            type="button"
            aria-label="Return to the current route stop"
            onClick={() => onSelectBooking?.(lastGraceStop.id)}
            className="min-h-11 rounded-[var(--task-radius-control)] border border-[#d5a38f] bg-white px-3 py-2 text-sm font-semibold text-[var(--task-accent)] hover:bg-[#fbf1ed]"
          >
            Return to Current
          </button>
        ) : null}
      </div>
    </div>
  );
}
