import { prisma } from "@/lib/db";

export function getParticipantKey({ participantType, userId, clientId }) {
  if (participantType === "SITTER") {
    if (!userId) throw new Error("Missing userId for sitter participant");
    return `sitter:${userId}`;
  }

  if (participantType === "OPERATOR") {
    if (!userId) throw new Error("Missing userId for operator participant");
    return `operator:${userId}`;
  }

  if (participantType === "CLIENT") {
    if (!clientId) throw new Error("Missing clientId for client participant");
    return `client:${clientId}`;
  }

  throw new Error(`Unsupported participant type: ${participantType}`);
}

export async function ensureConversationParticipant({
  conversationId,
  userId = null,
  clientId = null,
  participantType,
  tx = prisma,
}) {
  if (!conversationId || !participantType) {
    throw new Error("Missing conversationId or participantType");
  }

  const participantKey = getParticipantKey({
    participantType,
    userId,
    clientId,
  });

  return tx.conversationParticipant.upsert({
    where: {
      conversationId_participantKey: {
        conversationId,
        participantKey,
      },
    },
    update: {},
    create: {
      conversationId,
      userId,
      participantType,
      participantKey,
    },
  });
}

export async function markConversationRead({
  conversationId,
  userId = null,
  clientId = null,
  participantType,
  tx = prisma,
}) {
  if (!conversationId || !participantType) {
    throw new Error("Missing conversationId or participantType");
  }

  const participantKey = getParticipantKey({
    participantType,
    userId,
    clientId,
  });

  return tx.conversationParticipant.upsert({
    where: {
      conversationId_participantKey: {
        conversationId,
        participantKey,
      },
    },
    update: {
      lastReadAt: new Date(),
    },
    create: {
      conversationId,
      userId,
      participantType,
      participantKey,
      lastReadAt: new Date(),
    },
  });
}

export function countUnreadMessagesForParticipant({
  messages = [],
  lastReadAt = null,
  unreadSenderTypes = [],
}) {
  return messages.filter((message) => {
    if (!unreadSenderTypes.includes(message.senderType)) {
      return false;
    }

    if (!lastReadAt) {
      return true;
    }

    return new Date(message.createdAt) > new Date(lastReadAt);
  }).length;
}
