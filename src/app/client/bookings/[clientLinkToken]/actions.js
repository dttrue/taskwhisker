// src/app/client/bookings/[clientLinkToken]/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createSystemMessage } from "@/lib/messaging/createSystemMessage";

export async function requestClientBookingCancellation(formData) {
  const clientLinkToken = String(formData.get("clientLinkToken") || "");
  const reason = String(formData.get("reason") || "").trim();

  if (!clientLinkToken) {
    return {
      ok: false,
      error: "Missing booking token.",
    };
  }

  if (!reason) {
    return {
      ok: false,
      error: "Please include a cancellation reason.",
    };
  }

  if (reason.length > 1000) {
    return {
      ok: false,
      error: "Cancellation reason must be under 1000 characters.",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: {
      clientLinkToken,
    },
    include: {
      client: true,
      sitter: true,
    },
  });

  if (!booking) {
    return {
      ok: false,
      error: "Booking not found.",
    };
  }

  if (booking.status === "CANCELED") {
    return {
      ok: false,
      error: "This booking is already canceled.",
    };
  }

  if (booking.status === "COMPLETED") {
    return {
      ok: false,
      error: "Completed bookings cannot be canceled from this page.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookingHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: booking.status,
        changedByUserId: null,
        note: `Client requested cancellation. Reason: ${reason}`,
      },
    });

    const conversation = await tx.conversation.findFirst({
      where: {
        bookingId: booking.id,
      },
      select: {
        id: true,
      },
    });

    if (conversation) {
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderType: "CLIENT",
          messageType: "TEXT",
          body: `Cancellation request:\n\n${reason}`,
        },
      });
    } else {
      await createSystemMessage({
        tx,
        bookingId: booking.id,
        body: `Client requested cancellation.\n\nReason: ${reason}`,
      });
    }
  });

  revalidatePath(`/client/bookings/${clientLinkToken}`);
  revalidatePath(`/client/bookings/${clientLinkToken}/messages`);
  revalidatePath(`/dashboard/sitter/messages/${booking.id}`);
  revalidatePath("/dashboard/sitter/messages");

  return {
    ok: true,
  };
}
