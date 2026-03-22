// prisma/seed.js
import "dotenv/config";
import bcrypt from "bcryptjs";
import pkg from "@prisma/client";

const { PrismaClient, Role, BookingStatus, VisitStatus } = pkg;
const prisma = new PrismaClient();

function dayAt(daysFromNow, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function dayOnlyFromDate(date) {
  return new Date(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}T00:00:00`
  );
}

const LOCATIONS = {
  southRiver: {
    serviceAddressLine1: "12 Main St",
    serviceAddressLine2: null,
    serviceCity: "South River",
    serviceState: "NJ",
    servicePostalCode: "08882",
    serviceCountry: "US",
    serviceLat: 40.4465,
    serviceLng: -74.3857,
    accessInstructions: "Use front walkway.",
    locationNotes: "Friendly orange cat inside.",
  },
  eastBrunswick: {
    serviceAddressLine1: "421 Route 18",
    serviceAddressLine2: null,
    serviceCity: "East Brunswick",
    serviceState: "NJ",
    servicePostalCode: "08816",
    serviceCountry: "US",
    serviceLat: 40.4279,
    serviceLng: -74.4159,
    accessInstructions: "Side door entry.",
    locationNotes: "Dog leash hangs by the door.",
  },
  newBrunswick: {
    serviceAddressLine1: "90 Livingston Ave",
    serviceAddressLine2: "Apt 2",
    serviceCity: "New Brunswick",
    serviceState: "NJ",
    servicePostalCode: "08901",
    serviceCountry: "US",
    serviceLat: 40.4862,
    serviceLng: -74.4518,
    accessInstructions: "Buzz apartment 2.",
    locationNotes: "Parking is easier after noon.",
  },
  oldBridge: {
    serviceAddressLine1: "7 County Rd 516",
    serviceAddressLine2: null,
    serviceCity: "Old Bridge",
    serviceState: "NJ",
    servicePostalCode: "08857",
    serviceCountry: "US",
    serviceLat: 40.398,
    serviceLng: -74.3232,
    accessInstructions: "Garage code shared separately.",
    locationNotes: "Large fenced yard.",
  },
  sayreville: {
    serviceAddressLine1: "25 Washington Rd",
    serviceAddressLine2: null,
    serviceCity: "Sayreville",
    serviceState: "NJ",
    servicePostalCode: "08872",
    serviceCountry: "US",
    serviceLat: 40.4593,
    serviceLng: -74.3607,
    accessInstructions: "Back gate entrance.",
    locationNotes: "Two cats, carrier in laundry room.",
  },
  princeton: {
    serviceAddressLine1: "55 Nassau St",
    serviceAddressLine2: null,
    serviceCity: "Princeton",
    serviceState: "NJ",
    servicePostalCode: "08542",
    serviceCountry: "US",
    serviceLat: 40.3493,
    serviceLng: -74.659,
    accessInstructions: "Concierge has key.",
    locationNotes: "Do not ring bell after 8 PM.",
  },
  jerseyCity: {
    serviceAddressLine1: "200 Newark Ave",
    serviceAddressLine2: "Unit 5B",
    serviceCity: "Jersey City",
    serviceState: "NJ",
    servicePostalCode: "07302",
    serviceCountry: "US",
    serviceLat: 40.7193,
    serviceLng: -74.0422,
    accessInstructions: "Call on arrival.",
    locationNotes: "Busy street, limited parking.",
  },
};

// Because Client.email is optional-but-unique, upsert-by-email only works if email exists.
async function upsertClient({ name, email, phone, city, state }) {
  if (email) {
    return prisma.client.upsert({
      where: { email },
      update: { name, phone, city, state },
      create: { name, email, phone, city, state },
    });
  }

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
  operatorId,
  status = BookingStatus.REQUESTED,
  serviceCode,
  notes,
  visits,
  addOnCodes = [],
  serviceAddressLine1 = null,
  serviceAddressLine2 = null,
  serviceCity = null,
  serviceState = null,
  servicePostalCode = null,
  serviceCountry = "US",
  serviceLat = null,
  serviceLng = null,
  accessInstructions = null,
  locationNotes = null,
}) {
  if (!serviceCode) {
    throw new Error("createSeedBooking requires serviceCode");
  }

  if (!Array.isArray(visits) || visits.length === 0) {
    throw new Error("createSeedBooking requires at least one visit");
  }

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
  });

  if (!service) {
    throw new Error(`Service not found for code: ${serviceCode}`);
  }

  const addOnServices =
    addOnCodes.length > 0
      ? await prisma.service.findMany({
          where: {
            code: { in: addOnCodes },
            category: "EXTRA",
            isActive: true,
          },
        })
      : [];

  const addOnMap = new Map(addOnServices.map((s) => [s.code, s]));

  const visitRows = visits.map((visit) => ({
    startTime: visit.startTime,
    endTime: visit.endTime,
    date: dayOnlyFromDate(visit.startTime),
    status:
      status === BookingStatus.CANCELED
        ? VisitStatus.CANCELED
        : status === BookingStatus.COMPLETED
        ? VisitStatus.COMPLETED
        : VisitStatus.CONFIRMED,
  }));

  const earliestStart = [...visitRows].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  )[0].startTime;

  const latestEnd = visitRows.reduce(
    (max, v) => (v.endTime > max ? v.endTime : max),
    visitRows[0].endTime
  );

  const baseServiceLineItem = {
    label: service.name,
    quantity: visitRows.length,
    unitPriceCents: service.basePriceCents,
    totalPriceCents: service.basePriceCents * visitRows.length,
  };

  const addOnLineItems = addOnCodes.map((code) => {
    const addOn = addOnMap.get(code);

    if (!addOn) {
      throw new Error(`Add-on not found or inactive: ${code}`);
    }

    return {
      label: addOn.name,
      quantity: 1,
      unitPriceCents: addOn.basePriceCents,
      totalPriceCents: addOn.basePriceCents,
    };
  });

  const lineItems = [baseServiceLineItem, ...addOnLineItems];

  const clientTotalCents = lineItems.reduce(
    (sum, li) => sum + li.totalPriceCents,
    0
  );

  const platformFeeCents = Math.round(clientTotalCents * 0.1);
  const sitterPayoutCents = clientTotalCents - platformFeeCents;

  const now = new Date();
  const confirmedAt =
    status === BookingStatus.CONFIRMED || status === BookingStatus.COMPLETED
      ? now
      : null;
  const canceledAt = status === BookingStatus.CANCELED ? now : null;
  const completedAt = status === BookingStatus.COMPLETED ? now : null;

  return prisma.booking.create({
    data: {
      clientId,
      sitterId: sitterId ?? null,
      operatorId,

      serviceId: service.id,
      serviceSummary: service.name,
      serviceType: service.category,

      notes: notes ?? null,
      startTime: earliestStart,
      endTime: latestEnd,
      status,
      clientTotalCents,
      platformFeeCents,
      sitterPayoutCents,
      confirmedAt,
      canceledAt,
      completedAt,

      serviceAddressLine1,
      serviceAddressLine2,
      serviceCity,
      serviceState,
      servicePostalCode,
      serviceCountry,
      serviceLat,
      serviceLng,
      accessInstructions,
      locationNotes,

      lineItems: {
        create: lineItems,
      },

      visits: {
        create: visitRows.map((visit) => ({
          operatorId,
          sitterId: sitterId ?? null,
          date: visit.date,
          startTime: visit.startTime,
          endTime: visit.endTime,
          status: visit.status,
        })),
      },

      history: {
        create: [
          {
            fromStatus: null,
            toStatus: status,
            note: notes ?? "Seeded booking",
            changedByUserId: operatorId,
          },
        ],
      },
    },
  });
}

async function main() {
  const bridgetPassword = process.env.BRIDGET_PASSWORD;
  const bridgetSitterPassword = process.env.BRIDGET_SITTER_PASSWORD;
  const danielPassword = process.env.DANIEL_PASSWORD;

  if (!bridgetPassword || !bridgetSitterPassword || !danielPassword) {
    throw new Error(
      "Missing BRIDGET_PASSWORD, BRIDGET_SITTER_PASSWORD, or DANIEL_PASSWORD in .env"
    );
  }

  const [bridgetHash, danielHash, bridgetSitterHash] = await Promise.all([
    bcrypt.hash(bridgetPassword, 12),
    bcrypt.hash(danielPassword, 12),
    bcrypt.hash(bridgetSitterPassword, 12),
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

  const bridgetSitter = await prisma.user.upsert({
    where: { email: "lunajobs13@gmail.com" },
    update: {},
    create: {
      email: "lunajobs13@gmail.com",
      name: "Bridget",
      role: Role.SITTER,
      hashedPassword: bridgetSitterHash,
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

  // ---- SERVICES ----
  await prisma.service.deleteMany();

  await prisma.service.createMany({
    data: [
      {
        name: "Dog Overnight (in your home)",
        code: "DOG_OVERNIGHT_HOME",
        species: "DOG",
        category: "OVERNIGHT",
        durationMinutes: null,
        basePriceCents: 6000,
        notes: "+$20 per additional dog, +$8 per cat",
      },
      {
        name: "Cat Overnight",
        code: "CAT_OVERNIGHT",
        species: "CAT",
        category: "OVERNIGHT",
        durationMinutes: null,
        basePriceCents: 4200,
        notes: "+$8 per additional cat",
      },
      {
        name: "Dog Drop-In (single dog, 15 min)",
        code: "DOG_DROPIN_SINGLE_15",
        species: "DOG",
        category: "DROP_IN",
        durationMinutes: 15,
        basePriceCents: 2000,
      },
      {
        name: "Dog Drop-In (single dog, 30 min)",
        code: "DOG_DROPIN_SINGLE_30",
        species: "DOG",
        category: "DROP_IN",
        durationMinutes: 30,
        basePriceCents: 2500,
      },
      {
        name: "Dog Drop-In (single dog, 60 min)",
        code: "DOG_DROPIN_SINGLE_60",
        species: "DOG",
        category: "DROP_IN",
        durationMinutes: 60,
        basePriceCents: 3000,
      },
      {
        name: "Dog Drop-In (two dogs, 15 min)",
        code: "DOG_DROPIN_DOUBLE_15",
        species: "DOG",
        category: "DROP_IN",
        durationMinutes: 15,
        basePriceCents: 2200,
      },
      {
        name: "Dog Drop-In (two dogs, 30 min)",
        code: "DOG_DROPIN_DOUBLE_30",
        species: "DOG",
        category: "DROP_IN",
        durationMinutes: 30,
        basePriceCents: 3000,
      },
      {
        name: "Dog Drop-In (two dogs, 60 min)",
        code: "DOG_DROPIN_DOUBLE_60",
        species: "DOG",
        category: "DROP_IN",
        durationMinutes: 60,
        basePriceCents: 3500,
      },
      {
        name: "Dog Walk (single dog, 15 min)",
        code: "DOG_WALK_SINGLE_15",
        species: "DOG",
        category: "WALK",
        durationMinutes: 15,
        basePriceCents: 1500,
      },
      {
        name: "Dog Walk (single dog, 30 min)",
        code: "DOG_WALK_SINGLE_30",
        species: "DOG",
        category: "WALK",
        durationMinutes: 30,
        basePriceCents: 2200,
      },
      {
        name: "Dog Walk (single dog, 60 min)",
        code: "DOG_WALK_SINGLE_60",
        species: "DOG",
        category: "WALK",
        durationMinutes: 60,
        basePriceCents: 3000,
      },
      {
        name: "Dog Bath (at home)",
        code: "DOG_BATH",
        species: "DOG",
        category: "EXTRA",
        durationMinutes: null,
        basePriceCents: 2500,
      },
      {
        name: "Dog Nail Cut + Grind",
        code: "DOG_NAIL_GRIND",
        species: "DOG",
        category: "EXTRA",
        durationMinutes: null,
        basePriceCents: 2000,
      },
      {
        name: "Cat Nail Cutting",
        code: "CAT_NAIL_CUT",
        species: "CAT",
        category: "EXTRA",
        durationMinutes: null,
        basePriceCents: 2000,
      },
      {
        name: "Cat Drop-In (one cat, 15 min)",
        code: "CAT_DROPIN_SINGLE_15",
        species: "CAT",
        category: "DROP_IN",
        durationMinutes: 15,
        basePriceCents: 1000,
      },
      {
        name: "Cat Drop-In (one cat, 30 min)",
        code: "CAT_DROPIN_SINGLE_30",
        species: "CAT",
        category: "DROP_IN",
        durationMinutes: 30,
        basePriceCents: 2000,
      },
      {
        name: "Cat Drop-In (one cat, 60 min)",
        code: "CAT_DROPIN_SINGLE_60",
        species: "CAT",
        category: "DROP_IN",
        durationMinutes: 60,
        basePriceCents: 2500,
      },
      {
        name: "Cat Drop-In (two cats, 15 min)",
        code: "CAT_DROPIN_DOUBLE_15",
        species: "CAT",
        category: "DROP_IN",
        durationMinutes: 15,
        basePriceCents: 2000,
        notes: "+$3 per visit per additional cat after two",
      },
      {
        name: "Cat Drop-In (two cats, 30 min)",
        code: "CAT_DROPIN_DOUBLE_30",
        species: "CAT",
        category: "DROP_IN",
        durationMinutes: 30,
        basePriceCents: 2200,
        notes: "+$3 per visit per additional cat after two",
      },
      {
        name: "Cat Drop-In (two cats, 60 min)",
        code: "CAT_DROPIN_DOUBLE_60",
        species: "CAT",
        category: "DROP_IN",
        durationMinutes: 60,
        basePriceCents: 2800,
        notes: "+$3 per visit per additional cat after two",
      },
    ],
  });

  // ---- CLEANUP SEEDED BOOKINGS ----
  await prisma.bookingHistory.deleteMany({
    where: { booking: { notes: { startsWith: "Seeded booking:" } } },
  });

  await prisma.bookingLineItem.deleteMany({
    where: { booking: { notes: { startsWith: "Seeded booking:" } } },
  });

  await prisma.visit.deleteMany({
    where: { booking: { notes: { startsWith: "Seeded booking:" } } },
  });

  await prisma.booking.deleteMany({
    where: { notes: { startsWith: "Seeded booking:" } },
  });

  // ---- CLIENTS ----
  const sarah = await upsertClient({
    name: "Sarah Johnson",
    email: "sarah@example.com",
    phone: "555-111-2222",
    city: "Princeton",
    state: "NJ",
  });

  const mike = await upsertClient({
    name: "Mike Davis",
    email: "mike@example.com",
    phone: "555-333-4444",
    city: "New Brunswick",
    state: "NJ",
  });

  const ava = await upsertClient({
    name: "Ava Martinez",
    email: "ava@example.com",
    phone: "555-555-1111",
    city: "Jersey City",
    state: "NJ",
  });

  const noah = await upsertClient({
    name: "Noah Kim",
    email: "noah@example.com",
    phone: "555-555-2222",
    city: "Hoboken",
    state: "NJ",
  });

  const emma = await upsertClient({
    name: "Emma Chen",
    email: "emma@example.com",
    phone: "555-555-3333",
    city: "Brooklyn",
    state: "NY",
  });

  const liam = await upsertClient({
    name: "Liam Patel",
    email: "liam@example.com",
    phone: "555-555-4444",
    city: "Manhattan",
    state: "NY",
  });

  // ---- SEEDED BOOKINGS ----

  // Daniel - route-friendly bookings for today
  await createSeedBooking({
    clientId: sarah.id,
    sitterId: daniel.id,
    operatorId: bridget.id,
    status: BookingStatus.CONFIRMED,
    serviceCode: "CAT_DROPIN_SINGLE_30",
    notes: "Seeded booking: Daniel today morning cat visit",
    visits: [
      { startTime: dayAt(0, 9, 0), endTime: dayAt(0, 9, 30) },
      { startTime: dayAt(1, 9, 0), endTime: dayAt(1, 9, 30) },
    ],
    addOnCodes: ["CAT_NAIL_CUT"],
    ...LOCATIONS.southRiver,
  });

  await createSeedBooking({
    clientId: mike.id,
    sitterId: daniel.id,
    operatorId: bridget.id,
    status: BookingStatus.CONFIRMED,
    serviceCode: "DOG_WALK_SINGLE_30",
    notes: "Seeded booking: Daniel today midday dog walk",
    visits: [
      { startTime: dayAt(0, 12, 30), endTime: dayAt(0, 13, 0) },
      { startTime: dayAt(2, 12, 30), endTime: dayAt(2, 13, 0) },
    ],
    ...LOCATIONS.eastBrunswick,
  });

  await createSeedBooking({
    clientId: ava.id,
    sitterId: daniel.id,
    operatorId: bridget.id,
    status: BookingStatus.CONFIRMED,
    serviceCode: "DOG_DROPIN_SINGLE_60",
    notes: "Seeded booking: Daniel today afternoon dog drop-in with bath",
    visits: [{ startTime: dayAt(0, 15, 30), endTime: dayAt(0, 16, 30) }],
    addOnCodes: ["DOG_BATH"],
    ...LOCATIONS.newBrunswick,
  });

  await createSeedBooking({
    clientId: liam.id,
    sitterId: daniel.id,
    operatorId: bridget.id,
    status: BookingStatus.CONFIRMED,
    serviceCode: "DOG_OVERNIGHT_HOME",
    notes: "Seeded booking: Daniel upcoming overnight",
    visits: [{ startTime: dayAt(1, 20, 0), endTime: dayAt(2, 8, 0) }],
    ...LOCATIONS.oldBridge,
  });

  // Bridget sitter
  await createSeedBooking({
    clientId: noah.id,
    sitterId: bridgetSitter.id,
    operatorId: bridget.id,
    status: BookingStatus.CONFIRMED,
    serviceCode: "CAT_DROPIN_DOUBLE_30",
    notes: "Seeded booking: Bridget sitter today cat visit",
    visits: [
      { startTime: dayAt(0, 10, 30), endTime: dayAt(0, 11, 0) },
      { startTime: dayAt(0, 18, 0), endTime: dayAt(0, 18, 30) },
    ],
    ...LOCATIONS.sayreville,
  });

  await createSeedBooking({
    clientId: emma.id,
    sitterId: bridgetSitter.id,
    operatorId: bridget.id,
    status: BookingStatus.REQUESTED,
    serviceCode: "DOG_WALK_SINGLE_60",
    notes: "Seeded booking: Bridget sitter requested long walk",
    visits: [{ startTime: dayAt(1, 14, 0), endTime: dayAt(1, 15, 0) }],
    ...LOCATIONS.princeton,
  });

  // Unassigned for operator dashboard
  await createSeedBooking({
    clientId: emma.id,
    sitterId: null,
    operatorId: bridget.id,
    status: BookingStatus.REQUESTED,
    serviceCode: "DOG_DROPIN_DOUBLE_30",
    notes: "Seeded booking: unassigned requested booking",
    visits: [
      { startTime: dayAt(0, 17, 0), endTime: dayAt(0, 17, 30) },
      { startTime: dayAt(1, 17, 0), endTime: dayAt(1, 17, 30) },
    ],
    addOnCodes: ["DOG_NAIL_GRIND"],
    ...LOCATIONS.jerseyCity,
  });

  // Completed
  await createSeedBooking({
    clientId: ava.id,
    sitterId: daniel.id,
    operatorId: bridget.id,
    status: BookingStatus.COMPLETED,
    serviceCode: "DOG_DROPIN_SINGLE_60",
    notes: "Seeded booking: completed yesterday dog drop-in",
    visits: [{ startTime: dayAt(-1, 11, 0), endTime: dayAt(-1, 12, 0) }],
    addOnCodes: ["DOG_BATH"],
    ...LOCATIONS.newBrunswick,
  });

  // Canceled
  await createSeedBooking({
    clientId: noah.id,
    sitterId: daniel.id,
    operatorId: bridget.id,
    status: BookingStatus.CANCELED,
    serviceCode: "CAT_OVERNIGHT",
    notes: "Seeded booking: canceled overnight",
    visits: [{ startTime: dayAt(2, 20, 0), endTime: dayAt(3, 8, 0) }],
    ...LOCATIONS.oldBridge,
  });

  console.log(
    "Seed complete: services + map-ready dashboard bookings created."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
