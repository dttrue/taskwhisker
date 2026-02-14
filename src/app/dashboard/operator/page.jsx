// src/app/dashboard/operator/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import CreateTestBookingButton from "./CreateTestBookingButton";
import { confirmBooking, cancelBooking } from "./actions";
import Link from "next/link";
function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function StatusBadge({ status }) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border";

  const map = {
    REQUESTED: "bg-yellow-50 text-yellow-700 border-yellow-200",
    CONFIRMED: "bg-green-50 text-green-700 border-green-200",
    CANCELED: "bg-red-50 text-red-700 border-red-200",
    COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <span className={`${base} ${map[status] || "bg-zinc-100 text-zinc-700"}`}>
      {status}
    </span>
  );
}

export default async function OperatorDashboard() {
  const session = await requireRole(["OPERATOR"]);

  const bookings = await prisma.booking.findMany({
    where: { startTime: { gte: new Date() } },
    include: { client: true, sitter: true, lineItems: true },
    orderBy: { startTime: "asc" },
    take: 20,
  });

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
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900">Upcoming bookings</h2>

            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">
                {bookings.length} shown
              </span>
              <CreateTestBookingButton />
            </div>
          </div>

          {bookings.length === 0 ? (
            <div className="p-6 text-sm text-zinc-600">
              No upcoming bookings yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr className="border-b border-zinc-200">
                    <th className="p-3">Start</th>
                    <th className="p-3">Client</th>
                    <th className="p-3">Sitter</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Total</th>
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
                        {b.sitter?.name || b.sitter?.email || "Unassigned"}
                      </td>

                      <td className="p-3">
                        <StatusBadge status={b.status} />
                      </td>

                      <td className="p-3 whitespace-nowrap font-medium text-zinc-900">
                        {formatMoney(b.clientTotalCents)}
                      </td>

                      <td className="p-3 text-right">
                        {b.status === "REQUESTED" && (
                          <div className="flex items-center gap-2">
                            <form action={confirmBooking.bind(null, b.id)}>
                              <button
                                type="submit"
                                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-transparent
               border border-green-600 text-green-600
               hover:bg-green-600 hover:text-white transition-colors"
                              >
                                Confirm
                              </button>
                            </form>

                            <form action={cancelBooking.bind(null, b.id)}>
                              <button
                                type="submit"
                                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-transparent
               border border-red-600 text-red-600
               hover:bg-red-600 hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </form>
                          </div>
                        )}

                        {(b.status === "CONFIRMED" ||
                          b.status === "CANCELED") && (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/dashboard/operator/bookings/${b.id}`}
                            className="text-xs underline text-zinc-600 hover:text-zinc-900"
                          >
                            View
                          </a>

                          {/* keep your confirm/cancel forms here too if you want */}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
