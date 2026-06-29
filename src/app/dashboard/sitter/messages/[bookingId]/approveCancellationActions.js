// src/app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createSystemMessage } from "@/lib/messaging/createSystemMessage";

function isCancellationRequestMessage(message) {
  return (
    message.senderType === "CLIENT" &&
    String(message.body || "")
      .trim()
      .toLowerCase()
      .startsWith("cancellation request:")
  );
}

export async function approveClientCancellationRequestAsSitter({ bookingId }) {
  const session = await auth();

  if (!session?.user?.email) {
    return {
      ok: false,
      error: "You must be signed in.",
    };
  }

  const sitter = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!sitter || sitter.role !== "SITTER") {
    return {
      ok: false,
      error: "Only the assigned sitter can approve this cancellation.",
    };
  }

  if (!bookingId) {
    return {
      ok: false,
      error: "Missing booking id.",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: {
      id: true,
      status: true,
      sitterId: true,
      clientLinkToken: true,
      conversation: {
        select: {
          messages: {
            orderBy: {
              createdAt: "desc",
            },
            take: 20,
            select: {
              senderType: true,
              body: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    return {
      ok: false,
      error: "Booking not found.",
    };
  }

  if (booking.sitterId !== sitter.id) {
    return {
      ok: false,
      error: "You can only approve cancellations for your own bookings.",
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
      error: "Completed bookings cannot be canceled.",
    };
  }

  const hasCancellationRequest = booking.conversation?.messages?.some(
    isCancellationRequestMessage
  );

  if (!hasCancellationRequest) {
    return {
      ok: false,
      error: "No client cancellation request was found for this booking.",
    };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: {
        id: booking.id,
      },
      data: {
        status: "CANCELED",
        canceledAt: now,
      },
    });

    await tx.visit.updateMany({
      where: {
        bookingId: booking.id,
        status: {
          notIn: ["COMPLETED", "CANCELED"],
        },
      },
      data: {
        status: "CANCELED",
      },
    });

    await tx.bookingHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: "CANCELED",
        changedByUserId: sitter.id,
        note: "Assigned sitter approved client cancellation request.",
      },
    });

    await createSystemMessage({
      tx,
      bookingId: booking.id,
      body: "Cancellation approved. This booking has been canceled.",
    });
  });

  revalidatePath("/dashboard/sitter");
  revalidatePath("/dashboard/sitter/messages");
  revalidatePath(`/dashboard/sitter/messages/${booking.id}`);

  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${booking.id}`);

  if (booking.clientLinkToken) {
    revalidatePath(`/client/bookings/${booking.clientLinkToken}`);
    revalidatePath(`/client/bookings/${booking.clientLinkToken}/messages`);
  }

  return {
    ok: true,
  };
}
