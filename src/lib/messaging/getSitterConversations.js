// src/lib/messaging/getSitterConversations.js
import { prisma } from "@/lib/db";

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
