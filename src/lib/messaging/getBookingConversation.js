// src/lib/messaging/getBookingConversation.js
import { prisma } from "@/lib/db";

export async function getBookingConversation(bookingId) {
  if (!bookingId) {
    throw new Error("bookingId is required.");
  }

  return prisma.conversation.findUnique({
    where: {
      bookingId,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },

      booking: {
        include: {
          client: true,
          sitter: true,
          operator: true,
        },
      },
    },
  });
}

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
