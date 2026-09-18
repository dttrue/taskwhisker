import { randomUUID } from 'node:crypto';

// PostgreSQL partial uniqueness preserves exactly one historical thread while
// allowing independent coverage threads. Safe inside existing transactions.
export async function ensureBookingConversation(tx, bookingId) {
  const id = randomUUID();
  const [conversation] = await tx.$queryRaw`
    INSERT INTO "Conversation" (id, "bookingId", scope, "createdAt", "updatedAt")
    VALUES (${id}, ${bookingId}, 'BOOKING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("bookingId") WHERE scope = 'BOOKING'
    DO UPDATE SET "bookingId" = EXCLUDED."bookingId"
    RETURNING id`;
  return conversation;
}

export function historicalConversation(booking) {
  if (!booking) return null;
  const { conversations, ...rest } = booking;
  return { ...rest, conversation: conversations?.[0] ?? null };
}
