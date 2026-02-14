// src/app/dashboard/operator/actions.js
"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";

export async function createTestBooking() {
  const session = await requireRole(["OPERATOR"]);

  let client = await prisma.client.findFirst({ orderBy: { createdAt: "asc" } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: "Test Client",
        email: "testclient@example.com",
        phone: "555-555-5555",
        city: "Test City",
        state: "NJ",
      },
    });
  }

  const sitter = await prisma.user.findFirst({
    where: { role: "SITTER" },
    orderBy: { createdAt: "asc" },
  });

  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);

  const end = new Date(start);
  end.setHours(12, 0, 0, 0);

  const clientTotalCents = 8500;
  const platformFeeCents = 850;
  const sitterPayoutCents = clientTotalCents - platformFeeCents;
 
  await prisma.booking.create({
    data: {
      clientId: client.id,
      sitterId: sitter?.id ?? null,
      serviceSummary: "Drop-in visits (test)",
      notes: "Auto-created test booking",
      startTime: start,
      endTime: end,
      status: "REQUESTED",
      clientTotalCents,
      platformFeeCents,
      sitterPayoutCents,
      lineItems: {
        create: [
          {
            label: "Visit",
            quantity: 2,
            unitPriceCents: 3500,
            totalPriceCents: 7000,
          },
          {
            label: "Travel",
            quantity: 1,
            unitPriceCents: 1500,
            totalPriceCents: 1500,
          },
        ],
      },
      history: {
        create: {
          fromStatus: null,
          toStatus: "REQUESTED",
          note: "Test booking created",
          changedByUserId: session.user.id,
        },
      },
    },
  });

  revalidatePath("/dashboard/operator");
}

export async function confirmBooking(bookingId) {
  const session = await requireRole(["OPERATOR"]);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("Booking not found");

  if (booking.status !== "REQUESTED") {
    throw new Error(`Cannot confirm booking from status ${booking.status}`);
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      history: {
        create: {
          fromStatus: booking.status,
          toStatus: "CONFIRMED",
          note: "Operator confirmed booking",
          changedByUserId: session.user.id,
        },
      },
    },
  });

  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${bookingId}`);
}

export async function cancelBooking(bookingId) {
  const session = await requireRole(["OPERATOR"]);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("Booking not found");

  if (["CANCELED", "COMPLETED"].includes(booking.status)) {
    throw new Error(`Cannot cancel booking from status ${booking.status}`);
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
      history: {
        create: {
          fromStatus: booking.status,
          toStatus: "CANCELED",
          note: "Operator canceled booking",
          changedByUserId: session.user.id,
        },
      },
    },
  });

  revalidatePath("/dashboard/operator");
  revalidatePath(`/dashboard/operator/bookings/${bookingId}`);
}
