// src/app/dashboard/messages/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";

export async function sendBookingMessage(formData) {
  await requireRole(["OPERATOR"]);
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
      senderType: "OPERATOR",
      messageType: "TEXT",
      body,
    },
  });

  revalidatePath(`/dashboard/messages/${bookingId}`);
}
