// src/app/dashboard/operator/bookings/[id]/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { confirmBooking, cancelBooking } from "../../actions";

export default async function OperatorBookingDetailPage({ params }) {
  await requireRole(["OPERATOR"]);

  // ✅ Works whether params is an object or a Promise
  const { id } = await Promise.resolve(params);

  if (!id) notFound();

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      client: true,
      sitter: true,
      lineItems: true,
      history: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: true },      },
    },
  });

  if (!booking) {
    return (
      <main className="min-h-screen bg-zinc-50 p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-zinc-600">Booking not found.</p>
          <Link className="text-sm underline" href="/dashboard/operator">
            Back
          </Link>
        </div>
      </main>
    );
  }
  const canConfirm = booking.status === "REQUESTED";
  const canCancel = !["CANCELED", "COMPLETED"].includes(booking.status);

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Operator · Booking
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {booking.client?.name || "Client"} ·{" "}
              {new Date(booking.startTime).toLocaleString()}
            </h1>
            <p className="text-sm text-zinc-600">
              Status:{" "}
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                {booking.status}
              </span>
            </p>
          </div>

          <Link className="text-sm underline" href="/dashboard/operator">
            Back to list
          </Link>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900">Details</h2>

            <div className="flex items-center gap-2">
              <form action={confirmBooking.bind(null, booking.id)}>
                <button
                  type="submit"
                  disabled={!canConfirm}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition
                    ${
                      canConfirm
                        ? "border border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
                        : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
                    }`}
                >
                  Confirm
                </button>
              </form>

              <form action={cancelBooking.bind(null, booking.id)}>
                <button
                  type="submit"
                  disabled={!canCancel}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition
                    ${
                      canCancel
                        ? "border border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
                        : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
                    }`}
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>

          <div className="p-4 grid gap-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500">Client</div>
                <div className="text-zinc-900">
                  {booking.client?.name || "—"}
                </div>
                <div className="text-zinc-600">
                  {booking.client?.email || ""}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Sitter</div>
                <div className="text-zinc-900">
                  {booking.sitter?.name ||
                    booking.sitter?.email ||
                    "Unassigned"}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Service</div>
                <div className="text-zinc-900">
                  {booking.serviceSummary || "—"}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Total</div>
                <div className="text-zinc-900">
                  ${(booking.clientTotalCents / 100).toFixed(2)}
                </div>
                <div className="text-zinc-600">
                  Fee: ${(booking.platformFeeCents / 100).toFixed(2)} · Payout:
                  ${(booking.sitterPayoutCents / 100).toFixed(2)}
                </div>
              </div>
            </div>

            {booking.notes ? (
              <div>
                <div className="text-xs text-zinc-500">Notes</div>
                <div className="text-zinc-900">{booking.notes}</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">Line items</h2>
          </div>

          {booking.lineItems.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No line items.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr className="border-b border-zinc-200">
                    <th className="p-3">Label</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-zinc-100">
                      <td className="p-3">{li.label}</td>
                      <td className="p-3">{li.quantity}</td>
                      <td className="p-3">
                        ${(li.unitPriceCents / 100).toFixed(2)}
                      </td>
                      <td className="p-3">
                        ${(li.totalPriceCents / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">History</h2>
          </div>

          {booking.history.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No history yet.</div>
          ) : (
            <div className="p-4 space-y-3">
              {booking.history.map((h) => (
                <div key={h.id} className="text-sm">
                  <div className="text-zinc-900">
                    <span className="font-medium">{h.fromStatus || "—"}</span> →{" "}
                    <span className="font-medium">{h.toStatus}</span>
                    {h.changedBy?.email ? (
                      <span className="text-zinc-500">
                        {" "}
                        · by {h.changedBy.email}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-xs text-zinc-500">
                    {new Date(h.createdAt).toLocaleString()}
                    {h.note ? ` · ${h.note}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
