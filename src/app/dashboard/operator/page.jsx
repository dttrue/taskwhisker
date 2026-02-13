// src/app/dashboard/operator/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import CreateTestBookingButton from "./CreateTestBookingButton";

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
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                          {b.status}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        ${(b.clientTotalCents / 100).toFixed(2)}
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
