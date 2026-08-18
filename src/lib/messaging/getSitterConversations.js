// src/lib/messaging/getSitterConversations.js
import { prisma } from "@/lib/db";
import { countUnreadMessagesForParticipant } from "@/lib/messaging/readState";

export async function getSitterConversations({ sitterId }) {
  if (!sitterId) {
    throw new Error("getSitterConversations requires sitterId.");
  }

  return prisma.conversation.findMany({
    where: {
      booking: {
        sitterId,
      },
    },
    include: {
      participants: {
        where: {
          userId: sitterId,
          participantType: "SITTER",
        },
      },
      messages: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      },
      booking: {
        include: {
          client: true,
          sitter: true,
          service: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

}

export async function getSitterInboxPollingConversations({ sitterId }) {
  if (!sitterId) {
    throw new Error("getSitterInboxPollingConversations requires sitterId.");
  }

  const conversations = await prisma.conversation.findMany({
    where: { booking: { sitterId } },
    select: {
      id: true,
      participants: {
        where: {
          userId: sitterId,
          participantType: "SITTER",
        },
        select: { lastReadAt: true },
        take: 1,
      },
      messages: {
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, senderType: true },
        take: 20,
      },
      booking: { select: { status: true } },
    },
  });

  return conversations.map((conversation) => {
    const participant = conversation.participants?.[0] ?? null;
    const unreadCount = countUnreadMessagesForParticipant({
      messages: conversation.messages,
      lastReadAt: participant?.lastReadAt ?? null,
      unreadSenderTypes: ["CLIENT"],
    });

    return { ...conversation, unreadCount };
  });
}
