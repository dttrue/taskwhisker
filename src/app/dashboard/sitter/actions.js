// src/app/dashboard/sitter/actions.js
"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";

export async function completeBookingAsSitter(formData) {
  const session = await requireRole(["SITTER"]);

  const bookingId = formData.get("bookingId");

  if (!bookingId) {
    return { ok: false, error: "Missing booking id." };
  }

  // Fetch minimal data we need for safety checks
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      sitterId: true,
      status: true,
    },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

  // 🔒 Hard role boundary: sitter can only touch their own bookings
  if (booking.sitterId !== session.user.id) {
    return { ok: false, error: "Not authorized for this booking." };
  }

  // Only allow CONFIRMED → COMPLETED from sitter side
  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: "Only confirmed bookings can be marked complete.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED" },
    });

    await tx.bookingHistory.create({
      data: {
        bookingId,
        fromStatus: "CONFIRMED",
        toStatus: "COMPLETED",
        changedByUserId: session.user.id,
        note: "Marked complete by sitter.",
      },
    });
  });

  // Refresh both dashboards so operator sees the update too
  revalidatePath("/dashboard/sitter");
  revalidatePath("/dashboard/operator");

  return { ok: true };
}
