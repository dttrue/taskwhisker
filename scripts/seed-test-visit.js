// node scripts/seed-test-visit.js
import { prisma } from "../src/lib/db.js";

async function main() {
  const sitter = await prisma.user.findFirst({
    where: { role: "SITTER" },
  });

  if (!sitter) {
    console.log("❌ No sitter found");
    return;
  }

  console.log("Using sitter:", sitter.id);

  const client = await prisma.client.upsert({
    where: { email: "testclient@example.com" },
    update: {},
    create: {
      name: "Test Client",
      email: "testclient@example.com",
      phone: "555-111-2222",
    },
  });

  console.log("Using client:", client.id);

  const visitStart = new Date("2026-04-20T14:00:00.000Z"); // 10:00 AM NJ
  const visitEnd = new Date("2026-04-20T14:30:00.000Z"); // 10:30 AM NJ

  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      operatorId: sitter.id,
      sitterId: sitter.id,
      serviceType: "DROP_IN",
      startTime: visitStart,
      endTime: visitEnd,
      clientTotalCents: 1000,
      platformFeeCents: 100,
      sitterPayoutCents: 900,
      status: "CONFIRMED",
    },
  });

  const visit = await prisma.visit.create({
    data: {
      bookingId: booking.id,
      operatorId: sitter.id,
      sitterId: sitter.id,
      date: new Date("2026-04-20T00:00:00.000Z"),
      startTime: visitStart,
      endTime: visitEnd,
      status: "CONFIRMED",
    },
  });

  console.log("✅ Seeded overlapping visit:", visit.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
