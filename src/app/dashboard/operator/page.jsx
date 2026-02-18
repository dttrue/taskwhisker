// src/app/dashboard/operator/page.jsx
import { requireRole } from "@/auth";
import {
  confirmBooking,
  cancelBooking,
  completeBooking,
} from "./bookings/actions";

import MetricsBar from "./_components/MetricsBar";
import DateRangeFilter from "./_components/DateRangeFilter";
import BookingsTable from "./_components/BookingsTable";

import { resolveStatus, resolveDateRange } from "./lib/dashboardQuery";
import { getOperatorDashboardData } from "./lib/dashboardData";

function formatDateOnly(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function OperatorDashboard({ searchParams }) {
  const session = await requireRole(["OPERATOR"]);

  // normalize: object OR Promise
  const sp = await Promise.resolve(searchParams);

  const { from, to, isDefault } = resolveDateRange(sp);
  const hasRange = !isDefault; // or: Boolean(sp.from || sp.to)

  const status = resolveStatus(sp);

  const { bookings, metrics } = await getOperatorDashboardData({
    status,
    from,
    to,
  });

  const fromStr = formatDateOnly(from);
  const toStr = formatDateOnly(to);

  const hrefForStatus = (s) => {
    const u = new URLSearchParams();
    if (s !== "ALL") u.set("status", s);
    if (fromStr) u.set("from", fromStr);
    if (toStr) u.set("to", toStr);
    const qs = u.toString();
    return qs ? `/dashboard/operator?${qs}` : "/dashboard/operator";
  };

  const u = new URLSearchParams();
  if (status !== "ALL") u.set("status", status);
  if (fromStr) u.set("from", fromStr);
  if (toStr) u.set("to", toStr);
  const listQs = u.toString();

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Internal MVP
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Operator Dashboard
          </h1>
          <p className="text-sm text-zinc-600">
            Signed in as{" "}
            <span className="font-medium">{session.user.email}</span> ·{" "}
            <span className="uppercase text-xs tracking-wide">
              {session.user.role}
            </span>
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-4 border-b border-zinc-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-zinc-900">
              {hasRange ? "Bookings" : "Upcoming bookings"}
            </h2>

            <DateRangeFilter from={fromStr} to={toStr} />
          </div>

          <div className="p-4 border-b border-zinc-200">
            <MetricsBar
              metrics={metrics}
              active={status}
              hrefForStatus={hrefForStatus}
            />
          </div>

          <BookingsTable
            bookings={bookings}
            confirmBooking={confirmBooking}
            cancelBooking={cancelBooking}
            completeBooking={completeBooking}
            listQs={listQs}
          />
        </section>
      </div>
    </main>
  );
}
