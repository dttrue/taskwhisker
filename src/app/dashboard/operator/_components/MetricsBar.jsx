// src/app/dashboard/operator/_components/MetricsBar.jsx
import Link from "next/link";
import { formatMoney } from "../lib/format";

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
    <div className="flex flex-wrap gap-2">
      {ITEMS.map((s) => {
        const isActive = active === s;
        const m = metrics?.[s] || { count: 0, revenueCents: 0 };

        return (
          <Link
            key={s}
            href={hrefForStatus(s)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              isActive
                ? "bg-zinc-900 text-white border-zinc-900"
                : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
            }`}
          >
            <div className="flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  STATUS_DOT_CLASSES[s] || "bg-zinc-400"
                }`}
              />
              <span className="uppercase tracking-wide">
                {STATUS_LABELS[s] || s}
              </span>
            </div>

            <div className={isActive ? "text-white/90" : "text-zinc-500"}>
              {m.count} · {formatMoney(m.revenueCents)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
