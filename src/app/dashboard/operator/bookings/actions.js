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
  // confirmBooking(formData)
  if (arg1 instanceof FormData) {
    return arg1.get("bookingId")?.toString() || null;
  }

  // confirmBooking(bookingId)
  if (typeof arg1 === "string") return arg1;

  // confirmBooking(bookingId, formData)
  if (typeof arg1 === "string" && arg2 instanceof FormData) return arg1;

  // confirmBooking(_, formData)
  if (arg2 instanceof FormData) {
    return arg2.get("bookingId")?.toString() || null;
  }

  return null;
}

export async function confirmBooking(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  });
  if (!booking) return;

  if (booking.status !== "REQUESTED") return;

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
}

export async function cancelBooking(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) return;

  // --- extract cancel reason from FormData if present ---
  const fd =
    arg1 instanceof FormData ? arg1 : arg2 instanceof FormData ? arg2 : null;

  let reason = "";

  if (fd) {
    const preset = (fd.get("cancelReason") || "").toString().trim();
    const other = (fd.get("cancelReasonOther") || "").toString().trim();

    const raw = preset === "OTHER" ? other : preset;
    reason = raw.slice(0, 140); // safety cap
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  });
  if (!booking) return;

  if (booking.status === "CANCELED" || booking.status === "COMPLETED") return;

  // If booking was already confirmed, require reason
  if (booking.status === "CONFIRMED" && !reason) {
    return {
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
}


export async function completeBooking(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const bookingId = resolveBookingId(arg1, arg2);
  if (!bookingId) return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  });
  if (!booking) return;

  if (booking.status !== "CONFIRMED") return;

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
}

// keep your assignSitter as-is (already flexible)
export async function assignSitter(arg1, arg2) {
  const session = await requireRole(["OPERATOR"]);
  const actorId = await getActorId(session);

  const formData = arg2 ?? arg1;
  const bookingId =
    (arg2 ? arg1 : null) ?? formData.get("bookingId")?.toString();

  const nextSitterIdRaw = formData.get("sitterId")?.toString();
  if (!bookingId) return;

  const nextSitterId = nextSitterIdRaw ? nextSitterIdRaw : null;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, sitterId: true, status: true },
  });
  if (!booking) return;

  if (booking.status === "COMPLETED") return;

  const fromSitterId = booking.sitterId ?? null;
  const toSitterId = nextSitterId;

  if (fromSitterId === toSitterId) return;

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
}


