// src/app/client/bookings/[clientLinkToken]/messages/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function sendClientBookingMessage(formData) {
  const clientLinkToken = String(formData.get("clientLinkToken") || "");
  const body = String(formData.get("body") || "").trim();

  if (!clientLinkToken) {
    throw new Error("clientLinkToken is required.");
  }

  if (!body) {
    throw new Error("Message cannot be empty.");
  }

  const booking = await prisma.booking.findUnique({
    where: {
      clientLinkToken,
    },
    include: {
      conversation: true,
    },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  const conversation =
    booking.conversation ||
    (await prisma.conversation.create({
      data: {
        bookingId: booking.id,
      },
    }));

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: "CLIENT",
      messageType: "TEXT",
      body,
    },
  });

  revalidatePath(`/client/bookings/${clientLinkToken}/messages`);
}
