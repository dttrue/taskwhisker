// src/app/dashboard/operator/_components/MetricsBar.jsx
import Link from "next/link";

const ITEMS = ["ALL", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELED"];

const STATUS_LABELS = {
  ALL: "All",
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const STATUS_DOT_CLASSES = {
  ALL: "bg-zinc-400",
  REQUESTED: "bg-yellow-500",
  CONFIRMED: "bg-green-600",
  COMPLETED: "bg-blue-600",
  CANCELED: "bg-red-600",
};

export default function MetricsBar({ metrics, active, hrefForStatus }) {
  return (
    <nav aria-label="Booking status" className="overflow-x-auto">
      <div className="flex min-w-max gap-1 rounded-[var(--task-radius-control)] bg-[var(--task-surface-soft)] p-1">
        {ITEMS.map((s) => {
          const isActive = active === s;
          const m = metrics?.[s] || { count: 0 };

          return (
            <Link
              key={s}
              href={hrefForStatus(s)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-[calc(var(--task-radius-control)-0.2rem)] px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isActive
                  ? "bg-[var(--task-primary)] text-white shadow-sm"
                  : "text-[var(--task-text-muted)] hover:bg-white hover:text-[var(--task-text)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  STATUS_DOT_CLASSES[s] || "bg-zinc-400"
                }`}
              />
              <span>{STATUS_LABELS[s] || s}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-white text-[var(--task-text-muted)]"
                }`}
              >
                {m.count}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
