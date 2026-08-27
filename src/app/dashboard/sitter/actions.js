// src/app/dashboard/sitter/actions.js
"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";
import {
  SITTER_COMPLETION_OUTCOME,
  buildSitterCompletionData,
  isBookingReadyForAutoCompletion,
  resolveSitterCompletionOutcome,
} from "@/lib/visits/visitPerformerAttribution";

function sitterCompletionError(outcome) {
  if (outcome === SITTER_COMPLETION_OUTCOME.NOT_AUTHORIZED) {
    return "Not authorized for this visit.";
  }
  if (outcome === SITTER_COMPLETION_OUTCOME.PERFORMER_CONFLICT) {
    return "This visit was already completed by another sitter.";
  }
  if (outcome === SITTER_COMPLETION_OUTCOME.CANCELED) {
    return "Canceled visits cannot be marked complete.";
  }
  return "Only confirmed visits can be marked complete.";
}

export async function completeVisitAsSitter(formData) {
  const session = await requireRole(["SITTER"]);

  const visitId = formData.get("visitId");
  const lateReason = formData.get("lateReason")?.toString().trim() || "";

  if (!visitId) {
    return { ok: false, error: "Missing visit id." };
  }

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      status: true,
      sitterId: true,
      performedBySitterId: true,
      bookingId: true,
      startTime: true,
      endTime: true,
    },
  });

  if (!visit) {
    return { ok: false, error: "Visit not found." };
  }

  const initialOutcome = resolveSitterCompletionOutcome(
    visit,
    session.user.id
  );

  if (initialOutcome === SITTER_COMPLETION_OUTCOME.ALREADY_COMPLETED) {
    return { ok: true, alreadyCompleted: true };
  }
  if (initialOutcome !== SITTER_COMPLETION_OUTCOME.COMPLETE) {
    return { ok: false, error: sitterCompletionError(initialOutcome) };
  }

  const now = new Date();

  const visitStart = visit.startTime ? new Date(visit.startTime) : null;
  const visitEnd = visit.endTime ? new Date(visit.endTime) : null;

  const isMissedVisit =
    visitEnd && !Number.isNaN(visitEnd.getTime()) && visitEnd < now;

  if (visitStart && visitStart > now) {
    return {
      ok: false,
      error: "This visit cannot be completed before it starts.",
    };
  }

  if (isMissedVisit && lateReason.length < 10) {
    return {
      ok: false,
      error: "Please explain why this missed visit is being completed late.",
    };
  }

  const completionResult = await prisma.$transaction(async (tx) => {
    const transition = await tx.visit.updateMany({
      where: {
        id: visit.id,
        sitterId: session.user.id,
        status: "CONFIRMED",
        performedBySitterId: null,
      },
      data: buildSitterCompletionData(session.user.id, now),
    });

    if (transition.count !== 1) {
      const currentVisit = await tx.visit.findUnique({
        where: { id: visit.id },
        select: {
          status: true,
          sitterId: true,
          performedBySitterId: true,
        },
      });
      const outcome = currentVisit
        ? resolveSitterCompletionOutcome(currentVisit, session.user.id)
        : SITTER_COMPLETION_OUTCOME.INVALID_STATUS;

      if (outcome === SITTER_COMPLETION_OUTCOME.ALREADY_COMPLETED) {
        return { ok: true, alreadyCompleted: true };
      }

      return { ok: false, error: sitterCompletionError(outcome) };
    }

    await tx.bookingHistory.create({
      data: {
        bookingId: visit.bookingId,
        fromStatus: null,
        toStatus: null,
        changedByUserId: session.user.id,
        note: isMissedVisit
          ? `Sitter completed missed visit late. Reason: ${lateReason}`
          : "Sitter completed visit.",
      },
    });

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

    const allDone = isBookingReadyForAutoCompletion(remainingVisits.length);

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
          data: {
            status: "COMPLETED",
            completedAt: now,
          },
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

    return { ok: true };
  });

  if (!completionResult.ok || completionResult.alreadyCompleted) {
    return completionResult;
  }

  revalidatePath("/dashboard/sitter");
  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${visit.bookingId}`);
  revalidatePath(`/dashboard/sitter/bookings/${visit.bookingId}`);

  return { ok: true };
}
