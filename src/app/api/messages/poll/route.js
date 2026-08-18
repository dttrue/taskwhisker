import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSitterInboxPollingConversations } from "@/lib/messaging/getSitterConversations";
import {
  createInboxPollingFingerprint,
  createThreadPollingFingerprintFromMetadata,
} from "@/lib/messaging/pollingFingerprint";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function getAuthenticatedUser(requiredRole) {
  const session = await auth();
  if (!session?.user?.email) return null;

  return prisma.user.findFirst({
    where: { email: session.user.email, role: requiredRole },
    select: { id: true },
  });
}

function threadFingerprint(booking) {
  return createThreadPollingFingerprintFromMetadata({
    status: booking.status,
    messageCount: booking.conversation?._count?.messages || 0,
    latestMessage: booking.conversation?.messages?.[0] ?? null,
  });
}

const THREAD_SELECT = {
  status: true,
  conversation: {
    select: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
  },
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");

  if (scope === "client-thread") {
    const clientLinkToken = searchParams.get("clientLinkToken");
    if (!clientLinkToken) return response({ error: "Unauthorized" }, 401);

    const booking = await prisma.booking.findUnique({
      where: { clientLinkToken },
      select: THREAD_SELECT,
    });

    if (!booking) return response({ error: "Unauthorized" }, 401);
    return response({ fingerprint: threadFingerprint(booking) });
  }

  if (scope === "sitter-thread") {
    const bookingId = searchParams.get("bookingId");
    const sitter = await getAuthenticatedUser("SITTER");
    if (!bookingId || !sitter) return response({ error: "Unauthorized" }, 401);

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, sitterId: sitter.id },
      select: THREAD_SELECT,
    });

    if (!booking) return response({ error: "Forbidden" }, 403);
    return response({ fingerprint: threadFingerprint(booking) });
  }

  if (scope === "operator-thread") {
    const bookingId = searchParams.get("bookingId");
    const operator = await getAuthenticatedUser("OPERATOR");
    if (!bookingId || !operator) {
      return response({ error: "Unauthorized" }, 401);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: THREAD_SELECT,
    });

    if (!booking) return response({ error: "Not found" }, 404);
    return response({ fingerprint: threadFingerprint(booking) });
  }

  if (scope === "sitter-inbox") {
    const sitter = await getAuthenticatedUser("SITTER");
    if (!sitter) return response({ error: "Unauthorized" }, 401);

    const conversations = await getSitterInboxPollingConversations({
      sitterId: sitter.id,
    });

    return response({
      fingerprint: createInboxPollingFingerprint(conversations),
    });
  }

  return response({ error: "Invalid scope" }, 400);
}
