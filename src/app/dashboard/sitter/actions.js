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

export async function completeVisitAsSitter(formData) {
  const session = await requireRole(["SITTER"]);

  const visitId = formData.get("visitId");

  if (!visitId) {
    return { ok: false, error: "Missing visit id." };
  }

  // 1. Load visit + booking relationship
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      status: true,
      sitterId: true,
      bookingId: true,
    },
  });

  if (!visit) {
    return { ok: false, error: "Visit not found." };
  }

  // 🔒 sitter can only act on their own visits
  if (visit.sitterId !== session.user.id) {
    return { ok: false, error: "Not authorized for this visit." };
  }

  // Only CONFIRMED visits can be completed
  if (visit.status !== "CONFIRMED") {
    return {
      ok: false,
      error: "Only confirmed visits can be marked complete.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // 2. Mark visit completed
    await tx.visit.update({
      where: { id: visitId },
      data: { status: "COMPLETED" },
    });

    // 3. Get all visits for this booking
    const visits = await tx.visit.findMany({
      where: { bookingId: visit.bookingId },
      select: { status: true },
    });

    const allDone = visits.every(
      (v) => v.status === "COMPLETED" || v.status === "CANCELED"
    );

    // 4. Auto-complete booking if needed
    if (allDone) {
      await tx.booking.update({
        where: { id: visit.bookingId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await tx.bookingHistory.create({
        data: {
          bookingId: visit.bookingId,
          fromStatus: "CONFIRMED",
          toStatus: "COMPLETED",
          changedByUserId: session.user.id,
          note: "Auto-completed after all visits finished.",
        },
      });
    }
  });

  // Refresh UI
  revalidatePath("/dashboard/sitter");
  revalidatePath("/dashboard/operator");

  return { ok: true };
}
