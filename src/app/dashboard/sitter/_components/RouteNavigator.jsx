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
          ? "rounded-xl border border-blue-200 bg-white/95 p-3 shadow-sm backdrop-blur"
          : "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className={
              compact
                ? "text-[11px] font-semibold uppercase tracking-wide text-blue-700"
                : "text-xs font-semibold uppercase text-zinc-500"
            }
          >
            Route Controls
          </p>

          {!compact ? (
            <p className="mt-1 text-xs text-zinc-600">
              Move through your remaining stops.
            </p>
          ) : null}
        </div>

        <div className="text-[11px] text-zinc-500">
          Stop {totalStops > 0 ? currentIndex + 1 : 0} of {totalStops}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => previousStop && onSelectBooking?.(previousStop.id)}
          disabled={!previousStop}
          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <button
          type="button"
          onClick={() => nextStop && onSelectBooking?.(nextStop.id)}
          disabled={!nextStop}
          className="rounded-md border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {compact ? "Jump to Next" : "Next Stop"}
        </button>

        {showLastStop && lastGraceStop ? (
          <button
            type="button"
            onClick={() => onSelectBooking?.(lastGraceStop.id)}
            className="rounded-md border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            Return to Current
          </button>
        ) : null}
      </div>
    </div>
  );
}
