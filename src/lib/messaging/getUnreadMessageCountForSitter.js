// src/lib/messaging/getUnreadMessageCountForSitter.js
import { prisma } from "@/lib/db";
import {
  countUnreadMessagesForParticipant,
  getParticipantKey,
} from "@/lib/messaging/readState";

export async function getUnreadMessageCountForSitter({ sitterId }) {
  if (!sitterId) {
    throw new Error("getUnreadMessageCountForSitter requires sitterId.");
  }

  const participantKey = getParticipantKey({
    participantType: "SITTER",
    userId: sitterId,
  });

  const conversations = await prisma.conversation.findMany({
    where: {
      booking: {
        sitterId,
      },
    },
    include: {
      participants: {
        where: {
          participantKey,
        },
        take: 1,
      },
      messages: {
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
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
