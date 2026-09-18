// src/lib/messaging/getBookingConversation.js
import { prisma } from "@/lib/db";

export async function getBookingConversation(bookingId) {
  if (!bookingId) {
    throw new Error("bookingId is required.");
  }

  return prisma.conversation.findFirst({
    where: {
      bookingId,
      scope: "BOOKING",
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },

      booking: {
        include: {
          pricingSnapshot: { select: { id: true } },
          sitterCompensation: { select: { id: true } },
          client: true,
          sitter: true,
          operator: true,
        },
      },
    },
  });
}
