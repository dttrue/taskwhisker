// app/actions/completeBooking.js
"use server";

import prisma from "@/lib/prisma";
import { getActorId, requireRole } from "@/lib/auth";

export async function completeBooking(bookingId) {
  await requireRole(["OPERATOR"]);
  const actorId = await getActorId();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: "Only confirmed bookings can be completed.",
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    await tx.bookingHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: "COMPLETED",
        fromSitterId: booking.sitterId,
        toSitterId: booking.sitterId,
        note: "Operator marked booking as completed",
        changedByUserId: actorId,
      },
    });

    return updatedBooking;
  });

  return { ok: true, booking: updated };
}
