// prisma/seed.js
import "dotenv/config";
import bcrypt from "bcryptjs";
import pkg from "@prisma/client";

const { PrismaClient, Role, BookingStatus } = pkg;
const prisma = new PrismaClient();

function dayAt(daysFromNow, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Because Client.email is optional-but-unique, upsert-by-email only works if email exists.
async function upsertClient({ name, email, phone, city, state }) {
  if (email) {
    // email is unique; safe to upsert when present
    return prisma.client.upsert({
      where: { email },
      update: { name, phone, city, state },
      create: { name, email, phone, city, state },
    });
  }

  // If no email, try to "de-dupe" by name+phone as a reasonable seed heuristic
  const existing = await prisma.client.findFirst({
    where: {
      name,
      phone: phone ?? null,
    },
  });

  if (existing) {
    return prisma.client.update({
      where: { id: existing.id },
      data: { city, state },
    });
  }

  return prisma.client.create({
    data: {
      name,
      phone: phone ?? null,
      city: city ?? null,
      state: state ?? null,
    },
  });
}

async function createSeedBooking({
  clientId,
  sitterId,
  status,
  startTime,
  endTime,
  operatorId,
  serviceSummary,
  notes,
  lineItems,
}) {
  const clientTotalCents = lineItems.reduce(
    (sum, li) => sum + li.totalPriceCents,
    0
  );

  const platformFeeCents = Math.round(clientTotalCents * 0.1);
  const sitterPayoutCents = clientTotalCents - platformFeeCents;

  const now = new Date();
  const confirmedAt = status === BookingStatus.CONFIRMED ? now : null;
  const canceledAt = status === BookingStatus.CANCELED ? now : null;
  const completedAt = status === BookingStatus.COMPLETED ? now : null;

  return prisma.booking.create({
    data: {
      clientId,
      sitterId: sitterId ?? null,
      serviceSummary: serviceSummary ?? null,
      notes: notes ?? null,
      startTime,
      endTime,
      status,
      clientTotalCents,
      platformFeeCents,
      sitterPayoutCents,
      confirmedAt,
      canceledAt,
      completedAt,

      lineItems: {
        create: lineItems,
      },

      // ✅ This is what makes your UI show: "by therainbowniche@gmail.com"
      history: {
        create:
          status === BookingStatus.REQUESTED
            ? [
                {
                  fromStatus: null,
                  toStatus: BookingStatus.REQUESTED,
                  note: "Seeded booking",
                  changedByUserId: operatorId,
                },
              ]
            : status === BookingStatus.CONFIRMED
            ? [
                {
                  fromStatus: null,
                  toStatus: BookingStatus.REQUESTED,
                  note: "Seeded booking",
                  changedByUserId: operatorId,
                },
                {
                  fromStatus: BookingStatus.REQUESTED,
                  toStatus: BookingStatus.CONFIRMED,
                  note: "Seeded confirm transition",
                  changedByUserId: operatorId,
                },
              ]
            : status === BookingStatus.CANCELED
            ? [
                {
                  fromStatus: null,
                  toStatus: BookingStatus.REQUESTED,
                  note: "Seeded booking",
                  changedByUserId: operatorId,
                },
                {
                  fromStatus: BookingStatus.REQUESTED,
                  toStatus: BookingStatus.CANCELED,
                  note: "Seeded cancel transition",
                  changedByUserId: operatorId,
                },
              ]
            : status === BookingStatus.COMPLETED
            ? [
                {
                  fromStatus: null,
                  toStatus: BookingStatus.REQUESTED,
                  note: "Seeded booking",
                  changedByUserId: operatorId,
                },
                {
                  fromStatus: BookingStatus.REQUESTED,
                  toStatus: BookingStatus.CONFIRMED,
                  note: "Seeded confirm transition",
                  changedByUserId: operatorId,
                },
                {
                  fromStatus: BookingStatus.CONFIRMED,
                  toStatus: BookingStatus.COMPLETED,
                  note: "Seeded complete transition",
                  changedByUserId: operatorId,
                },
              ]
            : [
                {
                  fromStatus: null,
                  toStatus: status,
                  note: "Seeded booking",
                  changedByUserId: operatorId,
                },
              ],
      },
    },
  });
}

async function main() {
  const bridgetPassword = process.env.BRIDGET_PASSWORD;
  const danielPassword = process.env.DANIEL_PASSWORD;

  if (!bridgetPassword || !danielPassword) {
    throw new Error("Missing BRIDGET_PASSWORD or DANIEL_PASSWORD in .env");
  }

  const [bridgetHash, danielHash] = await Promise.all([
    bcrypt.hash(bridgetPassword, 12),
    bcrypt.hash(danielPassword, 12),
  ]);

  // ---- USERS ----
  const bridget = await prisma.user.upsert({
    where: { email: "therainbowniche@gmail.com" },
    update: {},
    create: {
      email: "therainbowniche@gmail.com",
      name: "Bridget",
      role: Role.OPERATOR,
      hashedPassword: bridgetHash,
    },
  });

  const daniel = await prisma.user.upsert({
    where: { email: "dttruest@gmail.com" },
    update: {},
    create: {
      email: "dttruest@gmail.com",
      name: "Daniel",
      role: Role.SITTER,
      hashedPassword: danielHash,
    },
  });

  // ---- CLEANUP (so re-seeding doesn't duplicate your test set) ----
  // Only deletes bookings that match this seed's "signature"
  await prisma.bookingHistory.deleteMany({
    where: { note: { startsWith: "Seeded cancel-test" } },
  });

  await prisma.bookingLineItem.deleteMany({
    where: { booking: { notes: { startsWith: "Seeded cancel-test" } } },
  });

  await prisma.booking.deleteMany({
    where: { notes: { startsWith: "Seeded cancel-test" } },
  });

  // ---- COMMON LINE ITEMS ----
  const commonLineItems = [
    {
      label: "Visit",
      quantity: 2,
      unitPriceCents: 4000,
      totalPriceCents: 8000,
    },
    {
      label: "Travel",
      quantity: 1,
      unitPriceCents: 2000,
      totalPriceCents: 2000,
    },
  ];

  // ---- 6 CANCEL-TEST BOOKINGS (all CONFIRMED) ----
  const cancelTestClients = [
    {
      name: "Sarah Johnson",
      email: "sarah@example.com",
      phone: "555-111-2222",
      city: "Princeton",
      state: "NJ",
    },
    {
      name: "Mike Davis",
      email: "mike@example.com",
      phone: "555-333-4444",
      city: "New Brunswick",
      state: "NJ",
    },
    {
      name: "Ava Martinez",
      email: "ava@example.com",
      phone: "555-555-1111",
      city: "Jersey City",
      state: "NJ",
    },
    {
      name: "Noah Kim",
      email: "noah@example.com",
      phone: "555-555-2222",
      city: "Hoboken",
      state: "NJ",
    },
    {
      name: "Emma Chen",
      email: "emma@example.com",
      phone: "555-555-3333",
      city: "Brooklyn",
      state: "NY",
    },
    {
      name: "Liam Patel",
      email: "liam@example.com",
      phone: "555-555-4444",
      city: "Manhattan",
      state: "NY",
    },
  ];

  for (let i = 0; i < cancelTestClients.length; i++) {
    const client = await upsertClient(cancelTestClients[i]);

    await createSeedBooking({
      clientId: client.id,
      sitterId: daniel.id,
      status: BookingStatus.CONFIRMED, // ✅ best for cancel-reason testing
      startTime: dayAt(i + 1, 10),
      endTime: dayAt(i + 1, 12),
      operatorId: bridget.id,
      serviceSummary: "Drop-in visits (cancel test)",
      notes: `Seeded cancel-test booking #${i + 1}`,
      lineItems: commonLineItems,
    });
  }

  console.log("Seed complete (6 CONFIRMED cancel-test bookings).");
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
