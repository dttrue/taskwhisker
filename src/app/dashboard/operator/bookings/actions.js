// src/app/dashboard/operator/bookings/actions.js
"use server";
import { cancelCanonicalBookingWithDb } from "@/lib/bookings/cancellation/canonicalCancellation";
import { economicsSelect, cancellationGuard, isCanonicalBooking } from "@/lib/bookings/economics/bookingEconomics";


import { reviewMissedVisitWithDb } from "@/lib/visits/reviewMissedVisit";
import { prisma } from "@/lib/db";
import { resolveBusinessOwnerSelfAssignment } from "@/lib/bookings/businessOwnerIdentity";
import { BusinessOwnerIdentityError } from "@/lib/bookings/businessOwnerIdentityContract";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CLIENT_CANCELLATION_FEE_RATE_BPS,
  calculateCancellationFeeCents,
  cancelBookingTransaction,
} from "@/lib/bookings/cancelBookingTransaction";
import { completeWholeBookingWithDb, completeVisitWithDb } from "@/lib/bookings/economics/completionService";
import { confirmBookingWithDb, assignBookingSitterWithDb } from "@/lib/bookings/confirmation/confirmationService";

async function getActorId(session) {
  if (session?.user?.id) {
    const byId = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });
    if (byId?.id) return byId.id;
  }

  if (session?.user?.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (byEmail?.id) return byEmail.id;
  }

  throw new Error("Stale session: user not found. Sign out and sign back in.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reviewMissedVisit({
  visitId,
  status,
  note,
  isTriageMode = false,
  nextBookingId = null,
}) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  if (!visitId) {
    return { ok: false, error: "Missing visitId." };
  }

  if (!["EXCUSED", "SITTER_FAULT", "NEEDS_FOLLOW_UP"].includes(status)) {
    return { ok: false, error: "Invalid review status." };
  }

  const result = await reviewMissedVisitWithDb({ db: prisma, visitId, actorId, status, note });
  if (!result.ok) return result;
  const visit = { bookingId: result.bookingId };

  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${visit.bookingId}`);
  revalidatePath("/dashboard/sitter");

  if (isTriageMode && nextBookingId) {
    // Let the UI show "Saving..." before navigating
    await sleep(400); // 300–500ms is ideal

    redirect(`/dashboard/operator/bookings/${nextBookingId}?mode=triage`);
  }
  return { ok: true };
}
function revalidateOperator(bookingId) {
  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${bookingId}`);
}

function revalidateCancellationViews(bookingId, clientLinkToken) {
  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${bookingId}`);
  revalidatePath("/dashboard/sitter");
  revalidatePath("/dashboard/sitter/messages");
  revalidatePath(`/dashboard/sitter/messages/${bookingId}`);

  if (clientLinkToken) {
    revalidatePath(`/client/bookings/${clientLinkToken}`);
    revalidatePath(`/client/bookings/${clientLinkToken}/messages`);
  }
}

async function hasClientCancellationRequest(bookingId) {
  const message = await prisma.message.findFirst({
    where: {
      conversation: { bookingId },
      senderType: "CLIENT",
      body: {
        startsWith: "Cancellation request:",
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  return Boolean(message);
}

// ✅ Supports (bookingId) OR (formData) OR (bookingId, formData)
function resolveBookingId(arg1, arg2) {
  if (arg1 instanceof FormData) {
    return arg1.get("bookingId")?.toString() || null;
  }

  if (typeof arg1 === "string") return arg1;

  if (arg2 instanceof FormData) {
    return arg2.get("bookingId")?.toString() || null;
  }

  return null;
}

// ---- CONFIRM ----
export async function confirmBooking(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) {
    return { ok: false, error: "Missing booking id." };
  }

  const result = await confirmBookingWithDb({ db: prisma, bookingId, actorId });
  if (result.ok) revalidateOperator(bookingId);
  return result;
}

// ---- CANCEL ----
export async function cancelBooking(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) {
    return { error: "Missing booking id." };
  }

  const fd =
    arg1 instanceof FormData ? arg1 : arg2 instanceof FormData ? arg2 : null;

  let reason = "";

  if (fd) {
    const preset = (fd.get("cancelReason") || "").toString().trim();
    const other = (fd.get("cancelReasonOther") || "").toString().trim();

    const raw = preset === "OTHER" ? other : preset;
    reason = raw.slice(0, 140);
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, ...economicsSelect },
  });

  if (!booking) return { ok: false, error: "Booking not found." };

  if (booking.status === "CONFIRMED" && !reason) {
    return {
      ok: false,
      error: "Cancel reason required for confirmed bookings.",
    };
  }

  if (isCanonicalBooking(booking)) {
    const result = await cancelCanonicalBookingWithDb({ db: prisma, bookingId, actorId,
      reason: reason || "Operator canceled requested booking." });
    if (result.ok) revalidateCancellationViews(bookingId, result.clientLinkToken);
    return result;
  }

  const historyNote = reason
    ? `Operator canceled booking · ${reason}`
    : "Operator canceled booking";

  const result = await prisma.$transaction((tx) =>
    cancelBookingTransaction({
      tx,
      bookingId,
      actorId,
      cancellationFeeCents: 0,
      cancellationFeeWaived: true,
      cancellationFeeRateBps: 0,
      historyNote,
      systemMessage:
        "This booking was canceled by the operator. The cancellation fee was waived.",
    })
  );

  if (!result.ok) {
    const error = result.error || (
      result.reason === "NOT_FOUND"
        ? "Booking not found."
        : result.reason === "COMPLETED"
        ? "Completed bookings cannot be canceled."
        : "Booking is already canceled.");
    return { ok: false, error, reason: result.reason };
  }

  revalidateCancellationViews(bookingId, result.clientLinkToken);
  return { ok: true };
}

// ---- APPROVE CLIENT CANCELLATION REQUEST ----
export async function approveClientCancellationRequest(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);

  if (!bookingId) {
    return { ok: false, error: "Missing booking id." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientLinkToken: true,
      ...economicsSelect,
    },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

  if (!(await hasClientCancellationRequest(bookingId))) {
    return { ok: false, error: "No client cancellation request was found." };
  }

  if (isCanonicalBooking(booking)) {
    const result = await cancelCanonicalBookingWithDb({ db: prisma, bookingId, actorId, requireClientRequest: true });
    if (result.ok) revalidateCancellationViews(bookingId, result.clientLinkToken);
    return result;
  }

  const guard = cancellationGuard(booking);
  if (!guard.ok) return guard;

  const cancellationFeeCents = calculateCancellationFeeCents(
    booking.clientTotalCents
  );
  const result = await prisma.$transaction((tx) =>
    cancelBookingTransaction({
      tx,
      bookingId,
      actorId,
      cancellationFeeCents,
      cancellationFeeWaived: false,
      cancellationFeeRateBps: CLIENT_CANCELLATION_FEE_RATE_BPS,
      historyNote: `Operator approved client cancellation request with a $${(
        cancellationFeeCents / 100
      ).toFixed(2)} cancellation fee.`,
      systemMessage: `Cancellation approved. This booking has been canceled. A $${(
        cancellationFeeCents / 100
      ).toFixed(2)} cancellation fee applies.`,
    })
  );

  if (!result.ok) {
    const error = result.error || (
      result.reason === "NOT_FOUND"
        ? "Booking not found."
        : result.reason === "COMPLETED"
        ? "Cannot cancel a completed booking."
        : "Booking is already canceled.");
    return { ok: false, error, reason: result.reason };
  }

  revalidateCancellationViews(bookingId, result.clientLinkToken);
  return { ok: true };
}

// ---- COMPLETE ----
export async function completeBooking(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) {
    return { ok: false, error: "Missing booking id." };
  }
  
  const result = await completeWholeBookingWithDb({ db: prisma, bookingId, actorId });
  if (result.ok) revalidateOperator(bookingId);
  return result;
}

export async function completeVisitAsOperator(visitId) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);
  const result = await completeVisitWithDb({ db: prisma, visitId, actorId, actorRole: "OPERATOR" });
  if (result.ok) {
    revalidateOperator(result.bookingId);
    revalidatePath("/dashboard/sitter");
  }
  return result;
}

// ---- ASSIGN SITTER ----
export async function assignSitter(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) {
    return { ok: false, error: "Missing booking id." };
  }

  const formData =
    arg1 instanceof FormData ? arg1 : arg2 instanceof FormData ? arg2 : null;

  const assignToMe = formData?.get("assignToMe")?.toString() === "true";

  let nextSitterId = null;

  if (assignToMe) {
    try {
      nextSitterId = await resolveBusinessOwnerSelfAssignment(actorId);
    } catch (error) {
      if (error instanceof BusinessOwnerIdentityError) return { ok: false, code: error.code, error: error.message };
      throw error;
    }
  } else {
    const nextSitterIdRaw = formData?.get("sitterId")?.toString() || "";
    nextSitterId = nextSitterIdRaw || null;
  }

  const result = await assignBookingSitterWithDb({
    db: prisma, bookingId, actorId, sitterId: nextSitterId, assignToMe,
  });
  if (result.ok) revalidateOperator(bookingId);
  return result;
}

// ---- REVIEW MISSED VISIT ----
export async function reviewMissedVisitHistory({
  historyId,
  status, // "EXCUSED" | "SITTER_FAULT" | "NEEDS_FOLLOW_UP"
  note,
}) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  if (!historyId) {
    return { ok: false, error: "Missing historyId." };
  }

  if (!["EXCUSED", "SITTER_FAULT", "NEEDS_FOLLOW_UP"].includes(status)) {
    return { ok: false, error: "Invalid review status." };
  }

  const history = await prisma.bookingHistory.findUnique({
    where: { id: historyId },
    select: {
      id: true,
      bookingId: true,
      missedVisitReviewStatus: true,
    },
  });

  if (!history) {
    return { ok: false, error: "History entry not found." };
  }
  
  if (history.missedVisitReviewStatus) {
    return { ok: false, error: "Already reviewed." };
  }

  await prisma.bookingHistory.update({
    where: { id: historyId },
    data: {
      missedVisitReviewStatus: status,
      missedVisitReviewedAt: new Date(),
      missedVisitReviewedById: actorId,
      missedVisitReviewNote: note || null,
    },
  });

  revalidatePath(`/dashboard/operator/bookings/${history.bookingId}`);
  return { ok: true };
}
