// src/app/dashboard/sitter/messages/page.jsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSitterConversations } from "@/lib/messaging/getSitterConversations";
import { countUnreadMessagesForParticipant } from "@/lib/messaging/readState";
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

function formatShortDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getMessagePreview(message) {
  if (!message) return "No messages yet.";

  const body = message.body?.trim() || "(empty message)";

  if (message.senderType === "SYSTEM") {
    return body;
  }

  if (message.senderType === "CLIENT") {
    return `Client: ${body}`;
  }

  if (message.senderType === "SITTER") {
    return `You: ${body}`;
  }

  if (message.senderType === "OPERATOR") {
    return `Operator: ${body}`;
  }

  return body;
}

export default async function SitterMessagesInboxPage() {
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

  const conversations = await getSitterConversations({
    sitterId: sitter.id,
  });

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 pb-24">
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
            Sitter inbox
          </p>

          <h1 className="mt-1 text-2xl font-bold text-zinc-950">Messages</h1>

          <p className="mt-2 text-sm text-zinc-500">
            Conversations for bookings assigned to{" "}
            {sitter.name || "this sitter"}.
          </p>
        </section>

        <section className="space-y-3">
          {conversations.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 shadow-sm">
              No assigned booking conversations yet.
            </div>
          ) : (
            conversations.map((conversation) => {
              const booking = conversation.booking;
              const latestMessage = conversation.messages?.[0] ?? null;
              const participant = conversation.participants?.[0] ?? null;

              const unreadCount = countUnreadMessagesForParticipant({
                messages: conversation.messages ?? [],
                lastReadAt: participant?.lastReadAt ?? null,
                unreadSenderTypes: ["CLIENT"],
              });

              const hasUnread = unreadCount > 0;

              return (
                <Link
                  key={conversation.id}
                  href={`/dashboard/sitter/messages/${booking.id}`}
                  className={`block rounded-2xl border bg-white p-4 shadow-sm transition hover:border-zinc-400 hover:shadow-md ${
                    hasUnread
                      ? "border-emerald-400 ring-2 ring-emerald-100"
                      : "border-zinc-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-zinc-950">
                        {booking.client?.name || "Client"}
                      </h2>

                      <p className="mt-1 text-sm text-zinc-600">
                        {booking.serviceSummary ||
                          booking.service?.name ||
                          booking.serviceType ||
                          "Booking"}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {hasUnread && (
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-1 text-xs font-black leading-none text-white shadow-md ring-2 ring-white">
                          {unreadCount}
                        </span>
                      )}

                      <p className="text-xs text-zinc-500">
                        {formatShortDate(
                          latestMessage?.createdAt || booking.updatedAt
                        )}
                      </p>
                    </div>
                  </div>

                  <p
                    className={`mt-3 line-clamp-2 text-sm ${
                      hasUnread
                        ? "font-semibold text-zinc-950"
                        : "text-zinc-700"
                    }`}
                  >
                    {getMessagePreview(latestMessage)}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>{booking.status}</span>
                    <span>{formatDateTime(booking.startTime)}</span>
                  </div>
                </Link>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
