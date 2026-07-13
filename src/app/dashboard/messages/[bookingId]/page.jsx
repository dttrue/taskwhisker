// src/app/dashboard/messages/[bookingId]/page.jsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getBookingConversation } from "@/lib/messaging/getBookingConversation";
import MessageForm from "./MessageForm";
function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSenderLabel(message) {
  if (message.senderType === "SYSTEM") return "System";
  if (message.senderType === "OPERATOR") return "Operator";
  if (message.senderType === "SITTER") return "Sitter";
  if (message.senderType === "CLIENT") return "Client";
  return "Unknown";
}

export default async function BookingMessagesPage({ params }) {
  const { bookingId } = await params;

  const conversation = await getBookingConversation(bookingId);

  if (!conversation) {
    notFound();
  }

  const { booking, messages } = conversation;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/operator"
            className="text-sm text-zinc-600 underline hover:text-zinc-900"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Booking conversation
          </p>

          <h1 className="mt-1 text-2xl font-bold text-zinc-950">
            {booking.client?.name || "Client"}
          </h1>

          <p className="mt-1 text-sm text-zinc-500">
            {booking.sitter?.name
              ? `Assigned sitter: ${booking.sitter.name}`
              : "No sitter assigned yet"}
          </p>

          <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
            <p>
              <span className="font-medium text-zinc-900">Sitter:</span>{" "}
              {booking.sitter?.name || "Unassigned"}
            </p>
            <p>
              <span className="font-medium text-zinc-900">Service:</span>{" "}
              {booking.serviceSummary || booking.serviceType || "—"}
            </p>

            <p>
              <span className="font-medium text-zinc-900">Status:</span>{" "}
              {booking.status}
            </p>

            <p>
              <span className="font-medium text-zinc-900">Start:</span>{" "}
              {formatDateTime(booking.startTime)}
            </p>

            <p>
              <span className="font-medium text-zinc-900">End:</span>{" "}
              {formatDateTime(booking.endTime)}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Messages</h2>

          <div className="mt-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-zinc-500">No messages yet.</p>
            ) : (
              messages.map((message) => {
                const isSystem = message.senderType === "SYSTEM";

                return (
                  <div
                    key={message.id}
                    className={`rounded-xl border p-3 ${
                      isSystem
                        ? "border-amber-200 bg-amber-50"
                        : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-900">
                        {getSenderLabel(message)}
                      </p>

                      <p className="text-xs text-zinc-500">
                        {formatDateTime(message.createdAt)}
                      </p>
                    </div>

                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-700">
                      {message.body}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <MessageForm bookingId={booking.id} />
        </section>
      </div>
    </main>
  );
}
