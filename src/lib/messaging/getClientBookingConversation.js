// src/lib/messaging/getClientBookingConversation.js
import { prisma } from "@/lib/db";

export async function getClientBookingConversation(clientLinkToken) {
  if (!clientLinkToken) {
    throw new Error("clientLinkToken is required.");
  }

  const booking = await prisma.booking.findUnique({
    where: {
      clientLinkToken,
    },
    include: {
      client: true,
      sitter: true,
      operator: true,
      conversation: {
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  });

  if (!booking) {
    return null;
  }

  return booking;
}
