// scripts/cleanup-availability.js

import { prisma } from "../src/lib/db.js";

async function main() {
  const sitter = await prisma.user.findFirst({
    where: { email: "test-sitter@example.com" },
  });

  if (!sitter) return;

  const bookings = await prisma.booking.findMany({
    where: { sitterId: sitter.id },
  });

  const ids = bookings.map((b) => b.id);

  await prisma.visit.deleteMany({
    where: { bookingId: { in: ids } },
  });

  await prisma.booking.deleteMany({
    where: { id: { in: ids } },
  });

  console.log("Cleanup done");
}

main().finally(() => prisma.$disconnect());
