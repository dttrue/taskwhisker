// src/app/client/bookings/[clientLinkToken]/page.jsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import CancelBookingRequestForm from "./CancelBookingRequestForm";

function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(cents) {
  if (typeof cents !== "number") return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getStatusLabel(status) {
  if (status === "REQUESTED") return "Requested";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELED") return "Canceled";
  return status || "Unknown";
}

function getStatusClasses(status) {
  if (status === "CONFIRMED") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "REQUESTED") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  if (status === "COMPLETED") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  if (status === "CANCELED") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  return "bg-zinc-50 text-zinc-700 border-zinc-200";
}

export default async function ClientBookingPortalPage({ params }) {
  const { clientLinkToken } = await params;

  const booking = await prisma.booking.findUnique({
    where: {
      clientLinkToken,
    },
    include: {
      client: true,
      sitter: true,
      visits: {
        orderBy: {
          startTime: "asc",
        },
      },
      lineItems: true,
      service: true,
    },
  });

  if (!booking) {
    notFound();
  }

  const messageHref = `/client/bookings/${booking.clientLinkToken}/messages`;

  const isCanceledBooking = booking.status === "CANCELED";

  const hasCancellationFeeDecision =
    isCanceledBooking && booking.cancellationFeeReviewedAt;

  const cancellationFeeDisplay = !isCanceledBooking
    ? null
    : booking.cancellationFeeWaived
    ? "Waived"
    : formatMoney(booking.cancellationFeeCents || 0);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Booking portal
          </p>

          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-zinc-950">
                {booking.serviceSummary ||
                  booking.service?.name ||
                  booking.serviceType ||
                  "Booking"}
              </h1>

              <p className="mt-1 text-sm text-zinc-500">
                Hi {booking.client?.name || "there"}, here are your booking
                details.
              </p>
            </div>

            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${getStatusClasses(
                booking.status
              )}`}
            >
              {getStatusLabel(booking.status)}
            </span>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-zinc-700">
            <p>
              <span className="font-semibold text-zinc-950">Sitter:</span>{" "}
              {booking.sitter?.name || "Not assigned yet"}
            </p>

            <p>
              <span className="font-semibold text-zinc-950">Start:</span>{" "}
              {formatDateTime(booking.startTime)}
            </p>

            <p>
              <span className="font-semibold text-zinc-950">End:</span>{" "}
              {formatDateTime(booking.endTime)}
            </p>

            <p>
              <span className="font-semibold text-zinc-950">Total:</span>{" "}
              {formatMoney(booking.clientTotalCents)}
            </p>

            {isCanceledBooking ? (
              <p>
                <span className="font-semibold text-zinc-950">
                  Cancellation fee:
                </span>{" "}
                <span
                  className={
                    booking.cancellationFeeWaived
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-zinc-800"
                  }
                >
                  {hasCancellationFeeDecision
                    ? cancellationFeeDisplay
                    : "Pending review"}
                </span>
              </p>
            ) : null}
          </div>

          {isCanceledBooking ? (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-bold text-red-950">Booking canceled</p>

              <p className="mt-1">
                This booking has been canceled. Your message thread remains
                visible for reference, but new messages are closed.
              </p>

              {hasCancellationFeeDecision ? (
                <p className="mt-2">
                  {booking.cancellationFeeWaived
                    ? "The cancellation fee was waived."
                    : `A ${cancellationFeeDisplay} cancellation fee applies.`}
                </p>
              ) : (
                <p className="mt-2">
                  The cancellation fee is still pending review.
                </p>
              )}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-950">Schedule</h2>

          <div className="mt-3 space-y-2">
            {booking.visits.length === 0 ? (
              <p className="text-sm text-zinc-500">No visits found.</p>
            ) : (
              booking.visits.map((visit) => (
                <div
                  key={visit.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm"
                >
                  <p className="font-semibold text-zinc-950">
                    {formatDateTime(visit.startTime)}
                  </p>

                  <p className="mt-1 text-zinc-600">
                    Ends {formatDateTime(visit.endTime)}
                  </p>

                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {visit.status}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {booking.lineItems.length > 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-zinc-950">Price summary</h2>

            <div className="mt-3 space-y-2">
              {booking.lineItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{item.label}</p>
                    <p className="text-xs text-zinc-500">
                      Qty {item.quantity} × {formatMoney(item.unitPriceCents)}
                    </p>
                  </div>

                  <p className="font-semibold text-zinc-950">
                    {formatMoney(item.totalPriceCents)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-zinc-200 pt-3 text-sm">
              <div className="flex items-center justify-between font-bold">
                <span>Total</span>
                <span>{formatMoney(booking.clientTotalCents)}</span>
              </div>

              {isCanceledBooking ? (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Cancellation fee</span>
                  <span
                    className={`font-semibold ${
                      booking.cancellationFeeWaived
                        ? "text-emerald-700"
                        : "text-zinc-950"
                    }`}
                  >
                    {hasCancellationFeeDecision
                      ? cancellationFeeDisplay
                      : "Pending review"}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-950">
            Need to contact your sitter?
          </h2>

          <p className="mt-2 text-sm text-zinc-600">
            Use the message thread for questions, updates, or anything related
            to this booking.
          </p>

          <Link
            href={messageHref}
            className="mt-4 flex w-full items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
            style={{
              backgroundColor: "#18181b",
            }}
          >
            View messages
          </Link>
        </section>

        {!isCanceledBooking && booking.status !== "COMPLETED" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-zinc-950">Need to cancel?</h2>

            <p className="mt-2 text-sm text-zinc-600">
              Submit a cancellation request so the booking can be reviewed.
            </p>

            <CancelBookingRequestForm
              clientLinkToken={booking.clientLinkToken}
              disabled={false}
            />
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
          <p>
            Save this page so you can return to your booking later. You can also
            use the message link from your confirmation email.
          </p>
        </section>
      </div>
    </main>
  );
}
