// src/app/dashboard/operator/_components/MetricsBar.jsx
import Link from "next/link";
import { formatMoney } from "../lib/format";

export default function MetricsBar({ metrics, active, hrefForStatus }) {
  const items = ["ALL", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELED"];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => {
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
            <div className="uppercase">{s}</div>
            <div className={isActive ? "text-white/90" : "text-zinc-500"}>
              {m.count} · {formatMoney(m.revenueCents)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
