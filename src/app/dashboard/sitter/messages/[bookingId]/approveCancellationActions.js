// src/app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CLIENT_CANCELLATION_FEE_RATE_BPS,
  calculateCancellationFeeCents,
  cancelBookingTransaction,
} from "@/lib/bookings/cancelBookingTransaction";

function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function approveClientCancellationRequestAsSitter({
  bookingId,
  waiveCancellationFee = false,
}) {
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
      clientTotalCents: true,
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

  const cancellationRequest = await prisma.message.findFirst({
    where: {
      conversation: { bookingId: booking.id },
      senderType: "CLIENT",
      body: {
        startsWith: "Cancellation request:",
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (!cancellationRequest) {
    return {
      ok: false,
      error: "No client cancellation request was found for this booking.",
    };
  }

  const cancellationFeeWaived = Boolean(waiveCancellationFee);

  const cancellationFeeCents = cancellationFeeWaived
    ? 0
    : calculateCancellationFeeCents(booking.clientTotalCents);

  const cancellationFeeRateBps = cancellationFeeWaived
    ? 0
    : CLIENT_CANCELLATION_FEE_RATE_BPS;

  const cancellationFeeMessage = cancellationFeeWaived
    ? "Cancellation approved. This booking has been canceled. The cancellation fee was waived."
    : `Cancellation approved. This booking has been canceled. A ${formatMoney(
        cancellationFeeCents
      )} cancellation fee applies.`;

  const historyNote = cancellationFeeWaived
    ? "Assigned sitter approved client cancellation request and waived the cancellation fee."
    : `Assigned sitter approved client cancellation request with a ${formatMoney(
        cancellationFeeCents
      )} cancellation fee.`;

  const result = await prisma.$transaction((tx) =>
    cancelBookingTransaction({
      tx,
      bookingId: booking.id,
      actorId: sitter.id,
      cancellationFeeCents,
      cancellationFeeWaived,
      cancellationFeeRateBps,
      historyNote,
      systemMessage: cancellationFeeMessage,
    })
  );

  if (!result.ok) {
    const error =
      result.reason === "NOT_FOUND"
        ? "Booking not found."
        : result.reason === "COMPLETED"
        ? "Completed bookings cannot be canceled."
        : "This booking is already canceled.";
    return { ok: false, error };
  }

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
    cancellationFeeCents,
    cancellationFeeWaived,
  };
}
