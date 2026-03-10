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

async function resolveAssignableSitterIdForOperator(session) {
  const operatorEmail = session?.user?.email;
  if (!operatorEmail) return null;

  let sitterEmail = null;

  if (operatorEmail === "therainbowniche@gmail.com") {
    sitterEmail = "lunajobs13@gmail.com";
  }

  if (!sitterEmail) return null;

  const sitter = await prisma.user.findFirst({
    where: {
      role: "SITTER",
      email: sitterEmail,
    },
    select: { id: true },
  });

  return sitter?.id ?? null;
}

function revalidateOperator(bookingId) {
  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${bookingId}`);
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

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      sitterId: true,
      startTime: true,
      endTime: true,
      visits: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
        orderBy: { startTime: "asc" },
      },
    },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

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

  if (booking.sitterId) {
    for (const visit of booking.visits) {
      const conflict = await prisma.visit.findFirst({
        where: {
          bookingId: { not: booking.id },
          sitterId: booking.sitterId,
          status: "CONFIRMED",
          startTime: { lt: visit.endTime },
          endTime: { gt: visit.startTime },
        },
        select: {
          id: true,
          bookingId: true,
          startTime: true,
          endTime: true,
        },
      });

      if (conflict) {
        return {
          ok: false,
          error:
            "This sitter already has a confirmed visit that overlaps one of this booking’s visit times.",
        };
      }
    }
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    }),
    prisma.visit.updateMany({
      where: { bookingId },
      data: { status: "CONFIRMED" },
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

  if (booking.status === "CANCELED" || booking.status === "COMPLETED") {
    return {
      ok: false,
      error: `Booking is already ${booking.status.toLowerCase()}.`,
    };
  }

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

  if (booking.status === "CANCELED") {
    return { ok: false, error: "Cannot complete a canceled booking." };
  }

  if (booking.status === "COMPLETED") {
    return { ok: false, error: "Booking is already completed." };
  }

  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Only CONFIRMED bookings can be completed (current: ${booking.status}).`,
    };
  }

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

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) {
    return { ok: false, error: "Missing booking id." };
  }

  const formData =
    arg1 instanceof FormData ? arg1 : arg2 instanceof FormData ? arg2 : null;

  const assignToMe = formData?.get("assignToMe")?.toString() === "true";

  let nextSitterId = null;

  if (assignToMe) {
    nextSitterId = await resolveAssignableSitterIdForOperator(session);

    if (!nextSitterId) {
      return {
        ok: false,
        error:
          "No linked sitter account was found for this operator. Make sure your sitter account exists and uses the same email.",
      };
    }
  } else {
    const nextSitterIdRaw = formData?.get("sitterId")?.toString() || "";
    nextSitterId = nextSitterIdRaw || null;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      sitterId: true,
      status: true,
      startTime: true,
      endTime: true,
      visits: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
        orderBy: { startTime: "asc" },
      },
    },
  });

  if (!booking) {
    return { ok: false, error: "Booking not found." };
  }

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

  if (toSitterId) {
    const sitterExists = await prisma.user.findFirst({
      where: {
        id: toSitterId,
        role: "SITTER",
      },
      select: { id: true },
    });

    if (!sitterExists) {
      return { ok: false, error: "Selected sitter was not found." };
    }

    for (const visit of booking.visits) {
      const conflict = await prisma.visit.findFirst({
        where: {
          bookingId: { not: booking.id },
          sitterId: toSitterId,
          status: "CONFIRMED",
          startTime: { lt: visit.endTime },
          endTime: { gt: visit.startTime },
        },
        select: {
          id: true,
          bookingId: true,
          startTime: true,
          endTime: true,
        },
      });

      if (conflict) {
        return {
          ok: false,
          error:
            "This sitter already has a confirmed visit that overlaps one of this booking’s visit times.",
        };
      }
    }
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { sitterId: toSitterId },
    }),
    prisma.visit.updateMany({
      where: { bookingId },
      data: { sitterId: toSitterId },
    }),
    prisma.bookingHistory.create({
      data: {
        bookingId,
        fromSitterId,
        toSitterId,
        note: assignToMe
          ? "Operator assigned booking to self"
          : !fromSitterId && toSitterId
          ? "Operator assigned sitter"
          : fromSitterId && !toSitterId
          ? "Operator unassigned sitter"
          : "Operator reassigned sitter",
        changedByUserId: actorId,
      },
    }),
  ]);

  revalidateOperator(bookingId);
  return { ok: true };
}
