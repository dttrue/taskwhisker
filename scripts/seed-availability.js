// scripts/seed-availability.js

import { prisma } from "../src/lib/db.js";

const REAL_SITTER_ID = "cmnz49db90001dftmweslotj7";

function localDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);

  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function localDateOnly(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function getTomorrowDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function main() {
  const date = getTomorrowDateString();
  const visitDate = localDateOnly(date);

  const sitter = await prisma.user.findUnique({
    where: { id: REAL_SITTER_ID },
  });

  if (!sitter) {
    throw new Error(`Real sitter not found: ${REAL_SITTER_ID}`);
  }

  const client = await prisma.client.upsert({
    where: { email: "test-client@example.com" },
    update: {},
    create: {
      name: "Test Client",
      email: "test-client@example.com",
    },
  });

  const bookingStart = localDateTime(date, "17:00");
  const bookingEnd = localDateTime(date, "19:30");

  const clientTotalCents = 3000;
  const platformFeeCents = Math.floor(clientTotalCents * 0.1);
  const sitterPayoutCents = clientTotalCents - platformFeeCents;

  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      operatorId: sitter.id,
      sitterId: sitter.id,
      serviceType: "DROP_IN",
      serviceSummary: "Seeded evening test visits",
      startTime: bookingStart,
      endTime: bookingEnd,
      clientTotalCents,
      platformFeeCents,
      sitterPayoutCents,
      status: "CONFIRMED",
    },
  });

  await prisma.visit.createMany({
    data: [
      {
        bookingId: booking.id,
        sitterId: sitter.id,
        operatorId: sitter.id,
        date: visitDate,
        status: "CONFIRMED",
        startTime: localDateTime(date, "17:00"),
        endTime: localDateTime(date, "17:30"),
      },
      {
        bookingId: booking.id,
        sitterId: sitter.id,
        operatorId: sitter.id,
        date: visitDate,
        status: "CONFIRMED",
        startTime: localDateTime(date, "19:00"),
        endTime: localDateTime(date, "19:30"),
      },
    ],
  });

  const seededVisits = await prisma.visit.findMany({
    where: { sitterId: sitter.id },
    select: {
      id: true,
      sitterId: true,
      status: true,
      date: true,
      startTime: true,
      endTime: true,
      bookingId: true,
    },
    orderBy: {
      startTime: "asc",
    },
  });

  console.log("Seed complete");
  console.log("Seed date:", date);
  console.log("Sitter ID:", sitter.id);
  console.log("Sitter email:", sitter.email);
  console.log("SEEDED VISITS FOR SITTER", seededVisits);
  console.log(`
Open:
http://localhost:3000/dev/check-availability?sitterId=${sitter.id}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
