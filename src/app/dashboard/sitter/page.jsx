// src/app/dashboard/sitter/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import { completeBookingAsSitter } from "./actions";

import {
  STATUS_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_PILL_CLASSES,
  STATUS_CARD_BORDER_CLASSES,
} from "@/lib/statusStyles";

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function SitterDashboardPage() {
  // 1. Enforce SITTER role
  const session = await requireRole(["SITTER"]);

  // 2. Resolve sitter user id
  const userId = session.user?.id;
  if (!userId) {
    throw new Error("Missing user id in session for sitter.");
  }

  // 3. Pull sitter's bookings
  const bookings = await prisma.booking.findMany({
    where: {
      sitterId: userId,
    },
    orderBy: { startTime: "asc" },
    include: {
      client: true,
    },
  });

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Internal MVP
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Sitter Dashboard
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            See your assigned bookings and mark visits complete.
          </p>
        </header>

        {/* Empty state */}
        {bookings.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="p-6 text-sm text-zinc-600">
              No bookings assigned yet.
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            {/* Mobile: card layout */}
            <div className="md:hidden space-y-3 p-4">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className={`rounded-lg border bg-white p-3 shadow-sm transition ${
                    STATUS_CARD_BORDER_CLASSES[b.status] || "border-zinc-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: client + time + service */}
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {b.client?.name || "—"}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {new Date(b.startTime).toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {b.serviceSummary || "Drop-in visit"}
                      </div>
                    </div>

                    {/* Right: status + payout */}
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            STATUS_DOT_CLASSES[b.status] || "bg-zinc-400"
                          }`}
                        />
                        <span className="text-xs font-semibold text-zinc-800">
                          {STATUS_LABELS[b.status] || b.status}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-zinc-500">Payout</div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {formatMoney(b.sitterPayoutCents)}
                      </div>
                    </div>
                  </div>

                  {/* Actions placeholder for now */}
                  <div className="mt-3 flex justify-end">
                    <form action={completeBookingAsSitter}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <button
                        type="submit"
                        disabled={b.status !== "CONFIRMED"}
                        className={
                          b.status === "CONFIRMED"
                            ? "text-xs font-semibold px-3 py-1.5 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition"
                            : "text-xs font-semibold px-3 py-1.5 rounded-md border border-zinc-200 text-zinc-400 cursor-not-allowed"
                        }
                      >
                        Mark complete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr className="border-b border-zinc-200">
                    <th className="p-3">When</th>
                    <th className="p-3">Client</th>
                    <th className="p-3">Service</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Payout</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-zinc-100">
                      <td className="p-3 whitespace-nowrap">
                        {new Date(b.startTime).toLocaleString()}
                      </td>
                      <td className="p-3">{b.client?.name || "—"}</td>
                      <td className="p-3">
                        {b.serviceSummary || "Drop-in visit"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                            STATUS_PILL_CLASSES[b.status] ||
                            "bg-zinc-100 text-zinc-700 border-zinc-200"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              STATUS_DOT_CLASSES[b.status] || "bg-zinc-400"
                            }`}
                          />
                          <span>{STATUS_LABELS[b.status] || b.status}</span>
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap font-medium text-zinc-900">
                        {formatMoney(b.sitterPayoutCents)}
                      </td>
                      <td className="p-3 text-right">
                        <form action={completeBookingAsSitter}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <button
                            type="submit"
                            disabled={b.status !== "CONFIRMED"}
                            className={
                              b.status === "CONFIRMED"
                                ? "text-xs font-semibold px-3 py-1.5 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition"
                                : "text-xs font-semibold px-3 py-1.5 rounded-md border border-zinc-200 text-zinc-400 cursor-not-allowed"
                            }
                          >
                            Mark complete
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
