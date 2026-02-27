// src/app/dashboard/operator/bookings/actions.js
"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";

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

function revalidateOperator(bookingId) {
  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${bookingId}`);
}

// ✅ Supports (bookingId) OR (formData) OR (bookingId, formData)
function resolveBookingId(arg1, arg2) {
  // confirmBooking(formData) / cancelBooking(formData)
  if (arg1 instanceof FormData) {
    return arg1.get("bookingId")?.toString() || null;
  }

  // confirmBooking(bookingId) / completeBooking(bookingId) / cancelBooking(bookingId)
  if (typeof arg1 === "string") return arg1;

  // confirmBooking(_, formData) OR cancelBooking(prevState, formData)
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

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      sitterId: true,
      startTime: true,
      endTime: true,
    },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

  // Block terminal states
  if (booking.status === "CANCELED" || booking.status === "COMPLETED") {
    return {
      ok: false,
      error: `Cannot confirm a ${booking.status.toLowerCase()} booking.`,
    };
  }

  if (booking.status !== "REQUESTED") {
    return {
      ok: false,
      error: `Only REQUESTED bookings can be confirmed (current: ${booking.status}).`,
    };
  }

  // Optional: basic sitter conflict check if a sitter is already assigned
  if (booking.sitterId) {
    const conflict = await prisma.booking.findFirst({
      where: {
        id: { not: booking.id },
        sitterId: booking.sitterId,
        status: "CONFIRMED",
        startTime: { lt: booking.endTime },
        endTime: { gt: booking.startTime },
      },
    });

    if (conflict) {
      return {
        ok: false,
        error:
          "This sitter already has a confirmed booking that overlaps this time.",
      };
    }
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    }),
    prisma.bookingHistory.create({
      data: {
        bookingId,
        fromStatus: booking.status,
        toStatus: "CONFIRMED",
        note: "Operator confirmed booking",
        changedByUserId: actorId,
      },
    }),
  ]);

  revalidateOperator(bookingId);
  return { ok: true };
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
    select: { id: true, status: true },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

  // Already terminal
  if (booking.status === "CANCELED" || booking.status === "COMPLETED") {
    return {
      ok: false,
      error: `Booking is already ${booking.status.toLowerCase()}.`,
    };
  }

  // If booking was already confirmed, require reason
  if (booking.status === "CONFIRMED" && !reason) {
    return {
      ok: false,
      error: "Cancel reason required for confirmed bookings.",
    };
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELED", canceledAt: new Date() },
    }),
    prisma.bookingHistory.create({
      data: {
        bookingId,
        fromStatus: booking.status,
        toStatus: "CANCELED",
        note: reason
          ? `Operator canceled booking · ${reason}`
          : "Operator canceled booking",
        changedByUserId: actorId,
      },
    }),
  ]);

  revalidateOperator(bookingId);
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

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientTotalCents: true,
      platformFeeCents: true,
      sitterPayoutCents: true,
    },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

  // Terminal states: no further transitions
  if (booking.status === "CANCELED") {
    return { ok: false, error: "Cannot complete a canceled booking." };
  }

  if (booking.status === "COMPLETED") {
    return { ok: false, error: "Booking is already completed." };
  }

  // Only confirmed bookings can be completed
  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Only CONFIRMED bookings can be completed (current: ${booking.status}).`,
    };
  }

  // Sanity check: fee + payout must equal total
  const expected = booking.platformFeeCents + booking.sitterPayoutCents;
  if (expected !== booking.clientTotalCents) {
    return {
      ok: false,
      error:
        "Payment breakdown is inconsistent (total != fee + payout). Please review this booking.",
    };
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
    prisma.bookingHistory.create({
      data: {
        bookingId,
        fromStatus: booking.status,
        toStatus: "COMPLETED",
        note: "Operator marked booking complete",
        changedByUserId: actorId,
      },
    }),
  ]);

  revalidateOperator(bookingId);
  return { ok: true };
}

// ---- ASSIGN SITTER ----
export async function assignSitter(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const formData = arg2 ?? arg1;
  const bookingId =
    (arg2 ? arg1 : null) ?? formData.get("bookingId")?.toString();

  const nextSitterIdRaw = formData.get("sitterId")?.toString();
  if (!bookingId) {
    return { ok: false, error: "Missing booking id." };
  }

  const nextSitterId = nextSitterIdRaw ? nextSitterIdRaw : null;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      sitterId: true,
      status: true,
      startTime: true,
      endTime: true,
    },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

  // No sitter edits on terminal bookings
  if (booking.status === "CANCELED" || booking.status === "COMPLETED") {
    return {
      ok: false,
      error: `Cannot change sitter for a ${booking.status.toLowerCase()} booking.`,
    };
  }

  const fromSitterId = booking.sitterId ?? null;
  const toSitterId = nextSitterId;

  if (fromSitterId === toSitterId) {
    return { ok: true };
  }

  // Optional: sitter conflict check when assigning
  if (toSitterId) {
    const conflict = await prisma.booking.findFirst({
      where: {
        id: { not: booking.id },
        sitterId: toSitterId,
        status: "CONFIRMED",
        startTime: { lt: booking.endTime },
        endTime: { gt: booking.startTime },
      },
    });

    if (conflict) {
      return {
        ok: false,
        error:
          "This sitter already has a confirmed booking that overlaps this time.",
      };
    }
  }

  const note =
    !fromSitterId && toSitterId
      ? "Operator assigned sitter"
      : fromSitterId && !toSitterId
      ? "Operator unassigned sitter"
      : "Operator reassigned sitter";

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { sitterId: toSitterId },
    }),
    prisma.bookingHistory.create({
      data: {
        bookingId,
        fromSitterId,
        toSitterId,
        note,
        changedByUserId: actorId,
      },
    }),
  ]);

  revalidateOperator(bookingId);
  return { ok: true };
}
