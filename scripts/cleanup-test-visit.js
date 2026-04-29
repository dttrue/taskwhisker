// scripts/cleanup-test-visit.mjs
import { prisma } from "../src/lib/db.js";

async function main() {
  const visitStart = new Date("2026-04-20T14:00:00.000Z"); // 10:00 AM NJ
  const visitEnd = new Date("2026-04-20T14:30:00.000Z"); // 10:30 AM NJ

  await prisma.visit.deleteMany({
    where: {
      startTime: visitStart,
      endTime: visitEnd,
    },
  });

  await prisma.booking.deleteMany({
    where: {
      startTime: visitStart,
      endTime: visitEnd,
      serviceType: "DROP_IN",
    },
  });

  console.log("✅ Cleaned test booking + visits");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
