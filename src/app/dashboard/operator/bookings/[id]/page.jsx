// src/app/dashboard/operator/bookings/[id]/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelBooking } from "../actions";

import CancelBookingDetailForm from "@/app/dashboard/operator/_components/CancelBookingDetailForm";
import {
  ConfirmBookingForm,
  CompleteBookingForm,
} from "@/app/dashboard/operator/_components/BookingStatusActions";
import AssignSitterForm from "@/app/dashboard/operator/_components/AssignSitterForm";
import {
  STATUS_LABELS,
  STATUS_DOT_CLASSES,
  STATUS_PILL_CLASSES,
  STATUS_CARD_BORDER_CLASSES,
} from "@/lib/statusStyles";

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function formatDateOnly(value) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeOnly(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupVisitsByDate(visits = []) {
  const grouped = new Map();

  for (const visit of visits) {
    const key = new Date(visit.date).toISOString().slice(0, 10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(visit);
  }

  return Array.from(grouped.entries())
    .map(([dateKey, dayVisits]) => ({
      dateKey,
      label: formatDateOnly(`${dateKey}T00:00:00`),
      visits: dayVisits.sort(
        (a, b) => new Date(a.startTime) - new Date(b.startTime)
      ),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function getScheduleSummary(visits = [], booking) {
  if (!visits.length) {
    return `${formatDateTime(booking.startTime)} → ${formatDateTime(
      booking.endTime
    )}`;
  }

  const grouped = groupVisitsByDate(visits);

  if (grouped.length === 1 && grouped[0].visits.length === 1) {
    const visit = grouped[0].visits[0];
    return `${grouped[0].label} · ${formatTimeOnly(
      visit.startTime
    )} → ${formatTimeOnly(visit.endTime)}`;
  }

  return `${grouped.length} day${grouped.length === 1 ? "" : "s"} · ${
    visits.length
  } visit${visits.length === 1 ? "" : "s"}`;
}

export default async function OperatorBookingDetailPage({
  params,
  searchParams,
}) {
  await requireRole(["OPERATOR"]);

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
      visits: {
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
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

  const groupedVisits = groupVisitsByDate(booking.visits);
  const scheduleSummary = getScheduleSummary(booking.visits, booking);

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Operator · Booking
            </div>

            <h1 className="text-2xl font-semibold text-zinc-900">
              {booking.client?.name || "Client"}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span>ID: {booking.id.slice(0, 8)}</span>
              <span>{scheduleSummary}</span>
              <span>Total: {formatMoney(booking.clientTotalCents)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-zinc-500">Status</span>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                  STATUS_PILL_CLASSES[booking.status] ||
                  "bg-zinc-100 text-zinc-700 border-zinc-200"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    STATUS_DOT_CLASSES[booking.status] || "bg-zinc-400"
                  }`}
                />
                <span>{STATUS_LABELS[booking.status] || booking.status}</span>
              </span>
            </div>
          </div>

          <div className="flex items-start justify-end">
            <Link
              className="text-xs sm:text-sm underline text-zinc-600 hover:text-zinc-900"
              href={backHref}
            >
              Back to list
            </Link>
          </div>
        </header>

        {/* Details + actions */}
        <section
          className={`rounded-xl border bg-white shadow-sm ${
            STATUS_CARD_BORDER_CLASSES[booking.status] || "border-zinc-200"
          }`}
        >
          <div className="p-4 border-b border-zinc-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-zinc-900">Details</h2>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <ConfirmBookingForm
                bookingId={booking.id}
                canConfirm={canConfirm}
              />

              <CompleteBookingForm
                bookingId={booking.id}
                canComplete={canComplete}
              />

              <CancelBookingDetailForm
                bookingId={booking.id}
                canCancel={canCancel}
                cancelBooking={cancelBooking}
              />
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
                  {booking.client?.email || "—"}
                </div>
                {booking.client?.phone ? (
                  <div className="text-zinc-600">{booking.client.phone}</div>
                ) : null}
              </div>

              <div>
                <div className="text-xs text-zinc-500">Sitter</div>
                <div className="text-zinc-900">
                  {booking.sitter?.name ||
                    booking.sitter?.email ||
                    "Unassigned"}
                </div>

                <AssignSitterForm
                  bookingId={booking.id}
                  currentSitterId={booking.sitterId}
                  sitters={sitters}
                  bookingStatus={booking.status}
                />
              </div>

              <div>
                <div className="text-xs text-zinc-500">Service</div>
                <div className="text-zinc-900">
                  {booking.serviceSummary || "—"}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Schedule</div>
                <div className="text-zinc-900">{scheduleSummary}</div>
                <div className="text-zinc-600">
                  Parent window: {formatDateTime(booking.startTime)} →{" "}
                  {formatDateTime(booking.endTime)}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Visits</div>
                <div className="text-zinc-900">
                  {booking.visits.length} visit
                  {booking.visits.length === 1 ? "" : "s"}
                </div>
                <div className="text-zinc-600">
                  {groupedVisits.length} day
                  {groupedVisits.length === 1 ? "" : "s"}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Total</div>
                <div className="text-zinc-900">
                  {formatMoney(booking.clientTotalCents)}
                </div>
                <div className="text-zinc-600">
                  Fee: {formatMoney(booking.platformFeeCents)} · Payout:{" "}
                  {formatMoney(booking.sitterPayoutCents)}
                </div>
              </div>
            </div>

            {booking.notes && (
              <div>
                <div className="text-xs text-zinc-500">Notes / Add-ons</div>
                <div className="whitespace-pre-wrap text-zinc-900">
                  {booking.notes}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Visit schedule */}
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">Visit schedule</h2>
          </div>

          {booking.visits.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No visits found.</div>
          ) : (
            <div className="p-4 space-y-4">
              {groupedVisits.map((group) => (
                <div
                  key={group.dateKey}
                  className="rounded-lg border border-zinc-200"
                >
                  <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900">
                    {group.label}
                  </div>

                  <div className="divide-y divide-zinc-100">
                    {group.visits.map((visit, idx) => (
                      <div
                        key={visit.id}
                        className="px-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium text-zinc-900">
                            Visit {idx + 1}
                          </div>
                          <div className="text-sm text-zinc-600">
                            {formatTimeOnly(visit.startTime)} →{" "}
                            {formatTimeOnly(visit.endTime)}
                          </div>
                        </div>

                        <div className="text-xs text-zinc-500">
                          Status: {visit.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Line items */}
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">Line items</h2>
          </div>

          {booking.lineItems.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No line items.</div>
          ) : (
            <div className="hidden sm:block overflow-x-auto">
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
                      <td className="p-3">{formatMoney(li.unitPriceCents)}</td>
                      <td className="p-3">{formatMoney(li.totalPriceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {booking.lineItems.length > 0 && (
            <div className="sm:hidden p-4 space-y-3">
              {booking.lineItems.map((li) => (
                <div
                  key={li.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-zinc-900">{li.label}</div>
                    <div className="text-xs text-zinc-500">
                      Qty: {li.quantity}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Unit: {formatMoney(li.unitPriceCents)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">Total</div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {formatMoney(li.totalPriceCents)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History */}
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

                    {h.changedBy?.email && (
                      <span className="text-zinc-500">
                        {" "}
                        · by {h.changedBy.email}
                      </span>
                    )}
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
