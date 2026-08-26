import "server-only";

import { prisma } from "@/lib/db";

export function resolveDefaultPublicBookingSitter() {
  const configuredUserId =
    process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID?.trim();

  if (!configuredUserId) return null;

  return prisma.user.findFirst({
    where: {
      id: configuredUserId,
      role: "SITTER",
    },
  });
}
