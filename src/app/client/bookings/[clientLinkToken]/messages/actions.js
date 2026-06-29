// src/app/client/bookings/[clientLinkToken]/messages/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const CLOSED_MESSAGE_STATUSES = ["CANCELED", "COMPLETED"];

function getClosedMessagingError(status) {
  if (status === "CANCELED") {
    return "This booking has been canceled. Messaging for this booking is now closed.";
  }

  if (status === "COMPLETED") {
    return "This booking is complete. Messaging for this booking is now closed.";
  }

  return "Messaging is closed for this booking.";
}

export async function sendClientBookingMessage(formData) {
  const clientLinkToken = String(formData.get("clientLinkToken") || "");
  const body = String(formData.get("body") || "").trim();

  if (!clientLinkToken) {
    return {
      ok: false,
      error: "Missing booking link.",
    };
  }

  if (!body) {
    return {
      ok: false,
      error: "Message cannot be empty.",
    };
  }

  if (body.length > 2000) {
    return {
      ok: false,
      error: "Message is too long. Please keep it under 2,000 characters.",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: {
      clientLinkToken,
    },
    select: {
      id: true,
      status: true,
      conversation: true,
    },
  });

  if (!booking) {
    return {
      ok: false,
      error: "Booking not found.",
    };
  }

  if (CLOSED_MESSAGE_STATUSES.includes(booking.status)) {
    return {
      ok: false,
      error: getClosedMessagingError(booking.status),
    };
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
  revalidatePath(`/client/bookings/${clientLinkToken}`);
  revalidatePath(`/dashboard/sitter/messages/${booking.id}`);
  revalidatePath("/dashboard/sitter/messages");

  return {
    ok: true,
  };
}
