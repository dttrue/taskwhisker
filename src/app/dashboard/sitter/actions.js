// src/app/dashboard/sitter/actions.js
"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";

export async function completeVisitAsSitter(formData) {
  const session = await requireRole(["SITTER"]);
  const visitId = formData.get("visitId");
  const lateReason = String(formData.get("lateReason") || "").trim();

  if (!visitId) {
    return { ok: false, error: "Missing visit id." };
  }

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      status: true,
      sitterId: true,
      bookingId: true,
      startTime: true,
      endTime: true,
    },
  });

  if (!visit) {
    return { ok: false, error: "Visit not found." };
  }

  if (visit.sitterId !== session.user.id) {
    return { ok: false, error: "Not authorized for this visit." };
  }

  if (visit.status === "COMPLETED") {
    return { ok: true, alreadyCompleted: true };
  }

  if (visit.status === "CANCELED") {
    return { ok: false, error: "Canceled visits cannot be marked complete." };
  }

  if (visit.status !== "CONFIRMED") {
    return {
      ok: false,
      error: "Only confirmed visits can be marked complete.",
    };
  }

  const now = new Date();
  const startTime = visit.startTime ? new Date(visit.startTime) : null;
  const endTime = visit.endTime ? new Date(visit.endTime) : null;

  if (startTime && startTime > now) {
    return {
      ok: false,
      error: "This visit cannot be completed before it starts.",
    };
  }

  const isMissedVisit =
    endTime && !Number.isNaN(endTime.getTime()) && endTime < now;

  if (isMissedVisit && lateReason.length < 10) {
    return {
      ok: false,
      error:
        "Please explain why this missed visit is being completed late. Minimum 10 characters.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.visit.update({
      where: { id: visitId },
      data: {
        status: "COMPLETED",
        completedAt: now,
      },
    });

    if (isMissedVisit) {
      await tx.bookingHistory.create({
        data: {
          bookingId: visit.bookingId,
          fromStatus: null,
          toStatus: null,
          changedByUserId: session.user.id,
          note: `Missed visit completed late by sitter. Reason: ${lateReason}`,
        },
      });
    }

    const remainingVisits = await tx.visit.findMany({
      where: {
        bookingId: visit.bookingId,
        NOT: {
          status: {
            in: ["COMPLETED", "CANCELED"],
          },
        },
      },
      select: { id: true },
    });

    const allDone = remainingVisits.length === 0;

    if (allDone) {
      const booking = await tx.booking.findUnique({
        where: { id: visit.bookingId },
        select: { status: true },
      });

      if (
        booking &&
        booking.status !== "COMPLETED" &&
        booking.status !== "CANCELED"
      ) {
        await tx.booking.update({
          where: { id: visit.bookingId },
          data: { status: "COMPLETED", completedAt: now },
        });

        await tx.bookingHistory.create({
          data: {
            bookingId: visit.bookingId,
            fromStatus: booking.status,
            toStatus: "COMPLETED",
            changedByUserId: session.user.id,
            note: "Auto-completed after all visits finished.",
          },
        });
      }
    }
  });

  revalidatePath("/dashboard/sitter");
  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${visit.bookingId}`);
  revalidatePath(`/dashboard/sitter/bookings/${visit.bookingId}`);

  return { ok: true };
}
