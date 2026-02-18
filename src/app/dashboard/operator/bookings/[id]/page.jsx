// src/app/dashboard/operator/bookings/[id]/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  confirmBooking,
  cancelBooking,
  completeBooking,
  assignSitter,
} from "../actions";

export default async function OperatorBookingDetailPage({
  params,
  searchParams,
}) {
  await requireRole(["OPERATOR"]);

  // ✅ unwrap (your Next build is passing Promises here)
  const { id } = await Promise.resolve(params);
  const sp = await Promise.resolve(searchParams);

  if (!id) notFound();

  const qs = new URLSearchParams(sp || {}).toString();
  const backHref = qs ? `/dashboard/operator?${qs}` : "/dashboard/operator";

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      client: true,
      sitter: true,
      lineItems: true,
      history: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: true, fromSitter: true, toSitter: true },
      },
    },
  });

  if (!booking) {
    return (
      <main className="min-h-screen bg-zinc-50 p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-zinc-600">Booking not found.</p>
          <Link className="text-sm underline" href={backHref}>
            Back to list
          </Link>
        </div>
      </main>
    );
  }
  const sitters = await prisma.user.findMany({
    where: { role: "SITTER" },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  const canConfirm = booking.status === "REQUESTED";
  const canCancel = !["CANCELED", "COMPLETED"].includes(booking.status);
  const canComplete = booking.status === "CONFIRMED";

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Operator · Booking
            </div>

            <h1 className="text-2xl font-semibold text-zinc-900">
              {booking.client?.name || "Client"}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
              <span>ID: {booking.id.slice(0, 8)}</span>
              <span>
                {new Date(booking.startTime).toLocaleString()} →{" "}
                {new Date(booking.endTime).toLocaleString()}
              </span>
              <span>Total: ${(booking.clientTotalCents / 100).toFixed(2)}</span>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-sm text-zinc-500">Status</span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                  {
                    REQUESTED: "bg-yellow-50 text-yellow-700 border-yellow-200",
                    CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
                    COMPLETED: "bg-green-50 text-green-700 border-green-200",
                    CANCELED: "bg-red-50 text-red-700 border-red-200",
                  }[booking.status] ||
                  "bg-zinc-100 text-zinc-700 border-zinc-200"
                }`}
              >
                {booking.status}
              </span>
            </div>
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

              <form action={completeBooking.bind(null, booking.id)}>
                <button
                  type="submit"
                  disabled={!canComplete}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition
      ${
        canComplete
          ? "border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
          : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
      }`}
                >
                  Complete
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

                <form
                  action={assignSitter}
                  className="mt-2 flex items-center gap-2"
                >
                  <input type="hidden" name="bookingId" value={booking.id} />

                  <select
                    name="sitterId"
                    defaultValue={booking.sitterId || ""}
                    className="text-xs rounded-md border border-zinc-200 bg-white px-2 py-1.5"
                  >
                    <option value="">Unassigned</option>
                    {sitters.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.email}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    disabled={booking.status === "COMPLETED"}
                    className="text-xs font-semibold px-3 py-1.5 rounded-md border border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </form>
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
                    {h.toStatus ? (
                      <>
                        <span className="font-medium">
                          {h.fromStatus || "—"}
                        </span>{" "}
                        → <span className="font-medium">{h.toStatus}</span>
                      </>
                    ) : h.fromSitterId || h.toSitterId ? (
                      <>
                        <span className="font-medium">
                          {h.fromSitter?.name || h.fromSitter?.email || "—"}
                        </span>{" "}
                        →{" "}
                        <span className="font-medium">
                          {h.toSitter?.name ||
                            h.toSitter?.email ||
                            "Unassigned"}
                        </span>
                        <span className="text-zinc-500"> · sitter</span>
                      </>
                    ) : (
                      <span className="text-zinc-500">Unknown change</span>
                    )}

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
