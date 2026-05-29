// src/lib/messaging/getUnreadMessageCountForSitter.js
import { prisma } from "@/lib/db";
import { countUnreadMessagesForParticipant } from "@/lib/messaging/readState";

export async function getUnreadMessageCountForSitter({ sitterId }) {
  if (!sitterId) {
    throw new Error("getUnreadMessageCountForSitter requires sitterId.");
  }

  const conversations = await prisma.conversation.findMany({
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
    },
  });

  return conversations.reduce((total, conversation) => {
    const participant = conversation.participants?.[0] ?? null;

    const unreadCount = countUnreadMessagesForParticipant({
      messages: conversation.messages ?? [],
      lastReadAt: participant?.lastReadAt ?? null,
      unreadSenderTypes: ["CLIENT"],
    });

    return total + unreadCount;
  }, 0);
}
