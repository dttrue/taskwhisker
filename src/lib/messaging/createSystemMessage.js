import { ensureBookingConversation } from "./bookingThread.js";
// src/lib/messaging/createSystemMessage.js
import { prisma } from "../db.js";

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

  const conversation = await ensureBookingConversation(tx, bookingId);

  return tx.message.create({
    data: {
      conversationId: conversation.id,
      senderType: "SYSTEM",
      messageType,
      body,
    },
  });
}
