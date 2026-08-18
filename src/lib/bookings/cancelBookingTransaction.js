import { createSystemMessage } from "@/lib/messaging/createSystemMessage";

export const CLIENT_CANCELLATION_FEE_RATE_BPS = 1500;

export function calculateCancellationFeeCents(
  clientTotalCents,
  rateBps = CLIENT_CANCELLATION_FEE_RATE_BPS
) {
  return Math.round(((clientTotalCents || 0) * rateBps) / 10000);
}

export async function cancelBookingTransaction({
  tx,
  bookingId,
  actorId,
  cancellationFeeCents,
  cancellationFeeWaived,
  cancellationFeeRateBps,
  historyNote,
  systemMessage,
}) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientLinkToken: true,
    },
  });

  if (!booking) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (booking.status === "CANCELED") {
    return { ok: false, reason: "ALREADY_CANCELED" };
  }

  if (booking.status === "COMPLETED") {
    return { ok: false, reason: "COMPLETED" };
  }

  const now = new Date();
  const transition = await tx.booking.updateMany({
    where: {
      id: bookingId,
      status: { notIn: ["CANCELED", "COMPLETED"] },
    },
    data: {
      status: "CANCELED",
      canceledAt: now,
      cancellationFeeCents,
      cancellationFeeWaived,
      cancellationFeeRateBps,
      cancellationFeeReviewedAt: now,
      cancellationFeeReviewedById: actorId,
    },
  });

  if (transition.count !== 1) {
    const current = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!current) return { ok: false, reason: "NOT_FOUND" };
    if (current.status === "COMPLETED") {
      return { ok: false, reason: "COMPLETED" };
    }
    return { ok: false, reason: "ALREADY_CANCELED" };
  }

  await tx.visit.updateMany({
    where: {
      bookingId,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    data: { status: "CANCELED" },
  });

  await tx.bookingHistory.create({
    data: {
      bookingId,
      fromStatus: booking.status,
      toStatus: "CANCELED",
      changedByUserId: actorId,
      note: historyNote,
    },
  });

  await createSystemMessage({
    tx,
    bookingId,
    body: systemMessage,
  });

  return {
    ok: true,
    clientLinkToken: booking.clientLinkToken,
    cancellationFeeCents,
    cancellationFeeWaived,
  };
}
