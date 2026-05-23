// src/lib/messaging/createSystemMessage.js
import { prisma } from "@/lib/db";

export async function createSystemMessage({
  bookingId,
  body,
  messageType = "SYSTEM",
  tx = prisma,
}) {
  if (!bookingId) {
    throw new Error("createSystemMessage requires bookingId.");
  }

  if (!body) {
    throw new Error("createSystemMessage requires body.");
  }

  const conversation = await tx.conversation.upsert({
    where: {
      bookingId,
    },
    update: {},
    create: {
      bookingId,
    },
  });

  return tx.message.create({
    data: {
      conversationId: conversation.id,
      senderType: "SYSTEM",
      messageType,
      body,
    },
  });
}
