// src/app/client/bookings/[clientLinkToken]/messages/page.jsx
import { notFound } from "next/navigation";
import { getClientBookingConversation } from "@/lib/messaging/getClientBookingConversation";
import ClientMessageForm from "./ClientMessageForm";
import MessageAutoRefresh from "@/components/messaging/MessageAutoRefresh";

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
  if (message.senderType === "OPERATOR") return "Sitter";
  if (message.senderType === "SITTER") return "Sitter";
  if (message.senderType === "CLIENT") return "You";
  return "Unknown";
}

function getClosedMessagingCopy(status) {
  if (status === "CANCELED") {
    return {
      title: "Messaging closed",
      body: "This booking has been canceled. Messaging for this booking is now closed.",
    };
  }

  if (status === "COMPLETED") {
    return {
      title: "Messaging closed",
      body: "This booking is complete. Messaging for this booking is now closed.",
    };
  }

  return null;
}

export default async function ClientBookingMessagesPage({ params }) {
  const { clientLinkToken } = await params;

  const booking = await getClientBookingConversation(clientLinkToken);

  if (!booking) {
    notFound();
  }

  const messages = booking.conversation?.messages || [];
  const closedMessagingCopy = getClosedMessagingCopy(booking.status);
  const messagingClosed = Boolean(closedMessagingCopy);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <MessageAutoRefresh intervalMs={10000} />

      <div className="mx-auto max-w-xl space-y-4">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Booking messages
          </p>

          <h1 className="mt-1 text-2xl font-bold text-zinc-950">
            {booking.serviceSummary || booking.serviceType || "Booking"}
          </h1>

          <div className="mt-3 grid gap-2 text-sm text-zinc-600">
            <p>
              <span className="font-medium text-zinc-900">Status:</span>{" "}
              {booking.status}
            </p>

            <p>
              <span className="font-medium text-zinc-900">Sitter:</span>{" "}
              {booking.sitter?.name || "Not assigned yet"}
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

          {messagingClosed && (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <p className="font-semibold text-zinc-950">
                {closedMessagingCopy.title}
              </p>

              <p className="mt-1">{closedMessagingCopy.body}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Messages</h2>

          <div className="mt-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-zinc-500">No messages yet.</p>
            ) : (
              messages.map((message) => {
                const isSystem = message.senderType === "SYSTEM";
                const isClient = message.senderType === "CLIENT";

                const bubbleClass = isSystem
                  ? "border-amber-200 bg-amber-50 text-zinc-900"
                  : isClient
                  ? "border-blue-200 bg-blue-50 text-zinc-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-900";

                const mutedTextClass = "text-zinc-500";
                const bodyTextClass = "text-zinc-700";

                return (
                  <div
                    key={message.id}
                    className={`rounded-xl border p-3 ${bubbleClass}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {getSenderLabel(message)}
                      </p>

                      <p className={`text-xs ${mutedTextClass}`}>
                        {formatDateTime(message.createdAt)}
                      </p>
                    </div>

                    <p className={`mt-2 text-sm ${bodyTextClass}`}>
                      {message.body?.trim() || "(empty message)"}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4">
            {messagingClosed ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                <p className="font-semibold text-zinc-950">
                  {closedMessagingCopy.title}
                </p>

                <p className="mt-1">{closedMessagingCopy.body}</p>
              </div>
            ) : (
              <ClientMessageForm clientLinkToken={clientLinkToken} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
