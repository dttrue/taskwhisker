// src/app/dashboard/operator/actions.js
"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";

export async function createTestBooking() {
  await requireRole(["OPERATOR"]);

  // Ensure a client exists
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

  // Optional sitter assignment (first sitter)
  const sitter = await prisma.user.findFirst({
    where: { role: "SITTER" },
    orderBy: { createdAt: "asc" },
  });

  // Tomorrow 10:00–12:00
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

      // status has default REQUESTED in schema, but explicit is fine too:
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
          // If you want this to be the operator instead of the sitter:
          // changedByUserId: session.user.id
          changedByUserId: sitter?.id ?? null,
        },
      },
    },
  });

  revalidatePath("/dashboard/operator");
}
