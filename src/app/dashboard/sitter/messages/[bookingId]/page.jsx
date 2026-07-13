// src/app/dashboard/sitter/messages/[bookingId]/page.jsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getBookingConversation } from "@/lib/messaging/getBookingConversation";
import { markConversationRead } from "@/lib/messaging/readState";
import SitterMessageForm from "./SitterMessageForm";
import ApproveCancellationRequestButton from "./ApproveCancellationRequestButton";
import MessageAutoRefresh from "@/components/messaging/MessageAutoRefresh";

const CLOSED_MESSAGE_STATUSES = ["CANCELED", "COMPLETED"];

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
  if (message.senderType === "CLIENT") return "Client";
  if (message.senderType === "SITTER") return "You";
  if (message.senderType === "OPERATOR") return "Operator";
  return "Unknown";
}

function isCancellationRequestMessage(message) {
  return (
    message.senderType === "CLIENT" &&
    String(message.body || "")
      .trim()
      .toLowerCase()
      .startsWith("cancellation request:")
  );
}

function getClosedMessagingCopy(status) {
  if (status === "CANCELED") {
    return "This booking has been canceled. Messaging for this booking is now closed.";
  }

  if (status === "COMPLETED") {
    return "This booking is complete. Messaging for this booking is now closed.";
  }

  return null;
}

export default async function SitterBookingMessagesPage({ params }) {
  const { bookingId } = await params;

  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const sitter = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!sitter) {
    redirect("/login");
  }

  if (sitter.role !== "SITTER") {
    redirect("/dashboard/operator");
  }

  const conversation = await getBookingConversation(bookingId);

  if (!conversation) {
    notFound();
  }

  const { booking, messages } = conversation;

  if (booking.sitterId !== sitter.id) {
    notFound();
  }

  await markConversationRead({
    conversationId: conversation.id,
    userId: sitter.id,
    participantType: "SITTER",
  });

  const messagingClosed = CLOSED_MESSAGE_STATUSES.includes(booking.status);
  const closedMessagingCopy = getClosedMessagingCopy(booking.status);

  const cancellationRequest = [...messages]
    .reverse()
    .find(isCancellationRequestMessage);

  const hasOpenCancellationRequest =
    Boolean(cancellationRequest) && !messagingClosed;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <MessageAutoRefresh intervalMs={10000} />

      <div className="mx-auto max-w-xl space-y-4">
        <Link
          href="/dashboard/sitter"
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Back to sitter dashboard
        </Link>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sitter messages
          </p>

          <h1 className="mt-1 text-2xl font-bold text-zinc-950">
            {booking.client?.name || "Client"}
          </h1>

          <p className="mt-1 text-sm text-zinc-500">
            Assigned sitter: {booking.sitter?.name || "Unassigned"}
          </p>

          <div className="mt-3 grid gap-2 text-sm text-zinc-600">
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

          {hasOpenCancellationRequest && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-950">
                Cancellation requested
              </p>

              <p className="mt-1 text-sm text-red-800">
                The client requested to cancel this booking. Approving will mark
                the booking and its unfinished visits as canceled.
              </p>

              {cancellationRequest?.body && (
                <div className="mt-3 whitespace-pre-line rounded-xl border border-red-100 bg-white p-3 text-sm leading-6 text-zinc-700">
                  {cancellationRequest.body}
                </div>
              )}

              <ApproveCancellationRequestButton bookingId={booking.id} />
            </div>
          )}

          {messagingClosed && closedMessagingCopy && (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <p className="font-semibold text-zinc-950">Messaging closed</p>
              <p className="mt-1">{closedMessagingCopy}</p>
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
                const isSitter = message.senderType === "SITTER";

                const bubbleClass = isSystem
                  ? "border-amber-200 bg-amber-50 text-zinc-900"
                  : isSitter
                  ? "border-blue-200 bg-blue-50 text-zinc-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-900";

                return (
                  <div
                    key={message.id}
                    className={`rounded-xl border p-3 ${bubbleClass}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {getSenderLabel(message)}
                      </p>

                      <p className="text-xs text-zinc-500">
                        {formatDateTime(message.createdAt)}
                      </p>
                    </div>

                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-700">
                      {message.body?.trim() || "(empty message)"}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {messagingClosed ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              {closedMessagingCopy}
            </div>
          ) : (
            <SitterMessageForm bookingId={booking.id} />
          )}
        </section>
      </div>
    </main>
  );
}
