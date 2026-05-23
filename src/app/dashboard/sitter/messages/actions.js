// src/app/dashboard/sitter/messages/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function sendSitterBookingMessage(formData) {
  const bookingId = String(formData.get("bookingId") || "");
  const body = String(formData.get("body") || "").trim();

  if (!bookingId) {
    throw new Error("bookingId is required.");
  }

  if (!body) {
    throw new Error("Message cannot be empty.");
  }

  const conversation = await prisma.conversation.upsert({
    where: {
      bookingId,
    },
    update: {},
    create: {
      bookingId,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: "SITTER",
      messageType: "TEXT",
      body,
    },
  });

  revalidatePath(`/dashboard/sitter/messages/${bookingId}`);
  revalidatePath(`/dashboard/messages/${bookingId}`);
}
