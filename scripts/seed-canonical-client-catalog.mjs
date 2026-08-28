import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const PROHIBITED_BRANCH_SUFFIX = "j4y";

const OFFERINGS = [
  {
    code: "DROP_IN",
    name: "Drop-In Visit",
    description:
      "Scheduled in-home check-ins for routine pet care and companionship.",
    billingUnit: "VISIT",
    scheduleKind: "TIMED_VISIT",
    allowsMixedSpecies: false,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: null,
    isActive: true,
    sortOrder: 10,
  },
  {
    code: "DOG_WALK",
    name: "Dog Walk",
    description: "Scheduled neighborhood walks for exercise and routine.",
    billingUnit: "VISIT",
    scheduleKind: "TIMED_VISIT",
    allowsMixedSpecies: false,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: 1,
    isActive: true,
    sortOrder: 20,
  },
  {
    code: "OVERNIGHT",
    name: "Overnight Care",
    description: "In-home overnight care for supported pet households.",
    billingUnit: "NIGHT",
    scheduleKind: "OVERNIGHT_STAY",
    allowsMixedSpecies: true,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: null,
    isActive: true,
    sortOrder: 30,
  },
];

const OPTIONS = [
  ["DROP_IN", "DROP_IN_DOG_15", "Dog drop-in · 15 minutes", "Dog", 15, 10],
  ["DROP_IN", "DROP_IN_DOG_30", "Dog drop-in · 30 minutes", "Dog", 30, 20],
  ["DROP_IN", "DROP_IN_DOG_60", "Dog drop-in · 60 minutes", "Dog", 60, 30],
  ["DROP_IN", "DROP_IN_CAT_15", "Cat drop-in · 15 minutes", "Cat", 15, 40],
  ["DROP_IN", "DROP_IN_CAT_30", "Cat drop-in · 30 minutes", "Cat", 30, 50],
  ["DROP_IN", "DROP_IN_CAT_60", "Cat drop-in · 60 minutes", "Cat", 60, 60],
  ["DOG_WALK", "DOG_WALK_15", "15 minutes", "Dog", 15, 10],
  ["DOG_WALK", "DOG_WALK_30", "30 minutes", "Dog", 30, 20],
  ["DOG_WALK", "DOG_WALK_60", "60 minutes", "Dog", 60, 30],
  ["OVERNIGHT", "OVERNIGHT_DOG_HOME", "Dog household", "Dog", null, 10],
  ["OVERNIGHT", "OVERNIGHT_CAT_HOME", "Cat household", "Cat", null, 20],
].map(
  ([offeringCode, code, label, primarySpecies, durationMinutes, sortOrder]) => ({
    offeringCode,
    code,
    label,
    primarySpecies,
    durationMinutes,
    isActive: true,
    sortOrder,
  }),
);

const SPECIES_POLICIES = [
  ["DROP_IN", "Dog", 0, 2],
  ["DROP_IN", "Cat", 0, null],
  ["DOG_WALK", "Dog", 1, 1],
  ["OVERNIGHT", "Dog", 0, null],
  ["OVERNIGHT", "Cat", 0, null],
].map(([offeringCode, species, minimumCount, maximumCount]) => ({
  offeringCode,
  species,
  isSupported: true,
  minimumCount,
  maximumCount,
}));

const CLIENT_RATES = [
  ["DROP_IN_DOG_15", 2000],
  ["DROP_IN_DOG_30", 2500],
  ["DROP_IN_DOG_60", 3000],
  ["DROP_IN_CAT_15", 1000],
  ["DROP_IN_CAT_30", 2000],
  ["DROP_IN_CAT_60", 2500],
  ["DOG_WALK_15", 1500],
  ["DOG_WALK_30", 2200],
  ["DOG_WALK_60", 3000],
  ["OVERNIGHT_DOG_HOME", 6000],
  ["OVERNIGHT_CAT_HOME", 4200],
].map(([optionCode, baseRateCents]) => ({ optionCode, baseRateCents }));

const PET_CHARGES = [
  ["DROP_IN_DOG_15", "Dog", 1, 200],
  ["DROP_IN_DOG_30", "Dog", 1, 500],
  ["DROP_IN_DOG_60", "Dog", 1, 500],
  ["DROP_IN_CAT_15", "Cat", 1, 1000],
  ["DROP_IN_CAT_15", "Cat", 2, 300],
  ["DROP_IN_CAT_30", "Cat", 1, 200],
  ["DROP_IN_CAT_30", "Cat", 2, 300],
  ["DROP_IN_CAT_60", "Cat", 1, 300],
  ["OVERNIGHT_DOG_HOME", "Dog", 1, 2000],
  ["OVERNIGHT_DOG_HOME", "Cat", 0, 800],
  ["OVERNIGHT_CAT_HOME", "Cat", 1, 800],
].map(([optionCode, species, includedCount, additionalCents]) => ({
  optionCode,
  species,
  includedCount,
  additionalCents,
}));

const LEGACY_MAPPINGS = [
  ["DOG_DROPIN_SINGLE_15", "DROP_IN", "DROP_IN_DOG_15", "Legacy single-pet SKU; pet count is canonical pricing data."],
  ["DOG_DROPIN_DOUBLE_15", "DROP_IN", "DROP_IN_DOG_15", "Legacy two-pet SKU; second-pet pricing is now threshold-based."],
  ["DOG_DROPIN_SINGLE_30", "DROP_IN", "DROP_IN_DOG_30", "Legacy single-pet SKU; pet count is canonical pricing data."],
  ["DOG_DROPIN_DOUBLE_30", "DROP_IN", "DROP_IN_DOG_30", "Legacy two-pet SKU; second-pet pricing is now threshold-based."],
  ["DOG_DROPIN_SINGLE_60", "DROP_IN", "DROP_IN_DOG_60", "Legacy single-pet SKU; pet count is canonical pricing data."],
  ["DOG_DROPIN_DOUBLE_60", "DROP_IN", "DROP_IN_DOG_60", "Legacy two-pet SKU; second-pet pricing is now threshold-based."],
  ["CAT_DROPIN_SINGLE_15", "DROP_IN", "DROP_IN_CAT_15", "Legacy single-pet SKU; pet count is canonical pricing data."],
  ["CAT_DROPIN_DOUBLE_15", "DROP_IN", "DROP_IN_CAT_15", "Legacy two-pet SKU; later cats use additional pricing thresholds."],
  ["CAT_DROPIN_SINGLE_30", "DROP_IN", "DROP_IN_CAT_30", "Legacy single-pet SKU; pet count is canonical pricing data."],
  ["CAT_DROPIN_DOUBLE_30", "DROP_IN", "DROP_IN_CAT_30", "Legacy two-pet SKU; later cats use additional pricing thresholds."],
  ["CAT_DROPIN_SINGLE_60", "DROP_IN", "DROP_IN_CAT_60", "Legacy single-pet SKU; pet count is canonical pricing data."],
  ["CAT_DROPIN_DOUBLE_60", "DROP_IN", "DROP_IN_CAT_60", "Legacy two-pet SKU; later cats use additional pricing thresholds."],
  ["DOG_WALK_SINGLE_15", "DOG_WALK", "DOG_WALK_15", "Legacy single-dog duration SKU."],
  ["DOG_WALK_SINGLE_30", "DOG_WALK", "DOG_WALK_30", "Legacy single-dog duration SKU."],
  ["DOG_WALK_SINGLE_60", "DOG_WALK", "DOG_WALK_60", "Legacy single-dog duration SKU."],
  ["DOG_OVERNIGHT_HOME", "OVERNIGHT", "OVERNIGHT_DOG_HOME", "Legacy Dog-primary overnight package."],
  ["CAT_OVERNIGHT", "OVERNIGHT", "OVERNIGHT_CAT_HOME", "Legacy Cat-primary overnight package."],
].map(([serviceCode, offeringCode, optionCode, notes]) => ({
  serviceCode,
  offeringCode,
  optionCode,
  notes,
}));

const EXTRA_CODES = ["DOG_BATH", "DOG_NAIL_GRIND", "CAT_NAIL_CUT"];

const EXPECTED_COUNTS = {
  CareOffering: 3,
  CareOption: 11,
  CareSpeciesPolicy: 5,
  ClientCareRate: 11,
  ClientCareRatePetCharge: 11,
  DefaultSitterCareRate: 0,
  DefaultSitterCareRatePetCharge: 0,
  SitterCareRate: 0,
  SitterCareRatePetCharge: 0,
  LegacyServiceMapping: 17,
};

const PARITY_CASES = [
  ["1 Dog Drop-In 15", "DROP_IN_DOG_15", { Dog: 1 }, 2000],
  ["2 Dog Drop-In 15", "DROP_IN_DOG_15", { Dog: 2 }, 2200],
  ["1 Dog Drop-In 30", "DROP_IN_DOG_30", { Dog: 1 }, 2500],
  ["2 Dog Drop-In 30", "DROP_IN_DOG_30", { Dog: 2 }, 3000],
  ["1 Dog Drop-In 60", "DROP_IN_DOG_60", { Dog: 1 }, 3000],
  ["2 Dog Drop-In 60", "DROP_IN_DOG_60", { Dog: 2 }, 3500],
  ["1 Cat Drop-In 15", "DROP_IN_CAT_15", { Cat: 1 }, 1000],
  ["2 Cat Drop-In 15", "DROP_IN_CAT_15", { Cat: 2 }, 2000],
  ["3 Cat Drop-In 15", "DROP_IN_CAT_15", { Cat: 3 }, 2300],
  ["1 Cat Drop-In 30", "DROP_IN_CAT_30", { Cat: 1 }, 2000],
  ["2 Cat Drop-In 30", "DROP_IN_CAT_30", { Cat: 2 }, 2200],
  ["3 Cat Drop-In 30", "DROP_IN_CAT_30", { Cat: 3 }, 2500],
  ["1 Cat Drop-In 60", "DROP_IN_CAT_60", { Cat: 1 }, 2500],
  ["2 Cat Drop-In 60", "DROP_IN_CAT_60", { Cat: 2 }, 2800],
  ["3 Cat Drop-In 60", "DROP_IN_CAT_60", { Cat: 3 }, 3100],
  ["Dog Walk 15", "DOG_WALK_15", { Dog: 1 }, 1500],
  ["Dog Walk 30", "DOG_WALK_30", { Dog: 1 }, 2200],
  ["Dog Walk 60", "DOG_WALK_60", { Dog: 1 }, 3000],
  ["Dog Overnight", "OVERNIGHT_DOG_HOME", { Dog: 1 }, 6000],
  ["Dog Overnight + second Dog", "OVERNIGHT_DOG_HOME", { Dog: 2 }, 8000],
  ["Dog Overnight + one Cat", "OVERNIGHT_DOG_HOME", { Dog: 1, Cat: 1 }, 6800],
  ["Dog Overnight + second Dog + one Cat", "OVERNIGHT_DOG_HOME", { Dog: 2, Cat: 1 }, 8800],
  ["Cat Overnight", "OVERNIGHT_CAT_HOME", { Cat: 1 }, 4200],
  ["Cat Overnight + second Cat", "OVERNIGHT_CAT_HOME", { Cat: 2 }, 5000],
];

function redactEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!domain) return "redacted";
  return `${local.slice(0, 2)}…@${domain}`;
}

function normalizeIdentity(row) {
  return {
    branchId: row.branchId,
    projectId: row.projectId,
    endpointId: row.endpointId,
    databaseName: row.databaseName,
  };
}

async function getIdentity(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await client.$queryRaw`
      SELECT
        current_setting('neon.branch_id', true) AS "branchId",
        current_setting('neon.project_id', true) AS "projectId",
        current_setting('neon.endpoint_id', true) AS "endpointId",
        current_database() AS "databaseName"
    `;
    return normalizeIdentity(rows[0]);
  } finally {
    await client.$disconnect();
  }
}

async function assertSafeDatabase() {
  const expectedQaBranchId = process.env.TASKWHISKER_QA_BRANCH_ID?.trim();
  if (!expectedQaBranchId) {
    throw new Error("TASKWHISKER_QA_BRANCH_ID is required.");
  }
  assert.equal(
    expectedQaBranchId.endsWith(PROHIBITED_BRANCH_SUFFIX),
    false,
    "TASKWHISKER_QA_BRANCH_ID must not identify the shared Neon branch.",
  );
  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
    throw new Error("DATABASE_URL and DIRECT_URL are required.");
  }

  const [databaseIdentity, directIdentity] = await Promise.all([
    getIdentity(process.env.DATABASE_URL),
    getIdentity(process.env.DIRECT_URL),
  ]);

  assert.deepEqual(
    databaseIdentity,
    directIdentity,
    "DATABASE_URL and DIRECT_URL must resolve to the same Neon database.",
  );
  assert.equal(
    databaseIdentity.branchId,
    expectedQaBranchId,
    "Connected Neon branch is not the approved disposable QA branch.",
  );
  assert.equal(
    databaseIdentity.branchId.endsWith(PROHIBITED_BRANCH_SUFFIX),
    false,
    "The shared Neon branch is explicitly prohibited.",
  );

  return databaseIdentity;
}

async function getCounts(client) {
  const entries = await Promise.all(
    Object.entries({
      User: client.user.count(),
      Service: client.service.count(),
      Booking: client.booking.count(),
      Visit: client.visit.count(),
      BookingHistory: client.bookingHistory.count(),
      BookingLineItem: client.bookingLineItem.count(),
      BookingPet: client.bookingPet.count(),
      Pet: client.pet.count(),
      CareOffering: client.careOffering.count(),
      CareOption: client.careOption.count(),
      CareSpeciesPolicy: client.careSpeciesPolicy.count(),
      ClientCareRate: client.clientCareRate.count(),
      ClientCareRatePetCharge: client.clientCareRatePetCharge.count(),
      DefaultSitterCareRate: client.defaultSitterCareRate.count(),
      DefaultSitterCareRatePetCharge:
        client.defaultSitterCareRatePetCharge.count(),
      SitterCareRate: client.sitterCareRate.count(),
      SitterCareRatePetCharge: client.sitterCareRatePetCharge.count(),
      LegacyServiceMapping: client.legacyServiceMapping.count(),
    }).map(async ([name, countPromise]) => [name, await countPromise]),
  );
  return Object.fromEntries(entries);
}

function inspectRows(model, expectedRows, actualRows, keyOf) {
  const actualByKey = new Map(actualRows.map((row) => [keyOf(row), row]));
  const result = { create: [], matching: [], drift: [] };

  for (const expected of expectedRows) {
    const key = keyOf(expected);
    const actual = actualByKey.get(key);
    if (!actual) {
      result.create.push(key);
    } else if (isDeepStrictEqual(actual, expected)) {
      result.matching.push(key);
    } else {
      result.drift.push({ key, expected, actual });
    }
  }
  return { model, ...result };
}

async function inspectBootstrap(client) {
  const [offerings, options, policies, rates, charges, mappings] =
    await Promise.all([
      client.careOffering.findMany({
        where: { code: { in: OFFERINGS.map((row) => row.code) } },
        select: {
          code: true,
          name: true,
          description: true,
          billingUnit: true,
          scheduleKind: true,
          allowsMixedSpecies: true,
          allowsUnlistedSpecies: true,
          minimumPetCount: true,
          maximumPetCount: true,
          isActive: true,
          sortOrder: true,
        },
      }),
      client.careOption.findMany({
        where: { code: { in: OPTIONS.map((row) => row.code) } },
        select: {
          code: true,
          label: true,
          primarySpecies: true,
          durationMinutes: true,
          isActive: true,
          sortOrder: true,
          offering: { select: { code: true } },
        },
      }),
      client.careSpeciesPolicy.findMany({
        where: {
          OR: SPECIES_POLICIES.map((row) => ({
            offering: { code: row.offeringCode },
            species: row.species,
          })),
        },
        select: {
          species: true,
          isSupported: true,
          minimumCount: true,
          maximumCount: true,
          offering: { select: { code: true } },
        },
      }),
      client.clientCareRate.findMany({
        where: { careOption: { code: { in: CLIENT_RATES.map((row) => row.optionCode) } } },
        select: {
          currency: true,
          baseRateCents: true,
          includedPetCount: true,
          defaultAdditionalCents: true,
          version: true,
          isActive: true,
          careOption: { select: { code: true } },
        },
      }),
      client.clientCareRatePetCharge.findMany({
        where: {
          clientRate: {
            careOption: { code: { in: PET_CHARGES.map((row) => row.optionCode) } },
          },
        },
        select: {
          species: true,
          includedCount: true,
          additionalCents: true,
          clientRate: { select: { careOption: { select: { code: true } } } },
        },
      }),
      client.legacyServiceMapping.findMany({
        where: {
          legacyService: { code: { in: LEGACY_MAPPINGS.map((row) => row.serviceCode) } },
        },
        select: {
          notes: true,
          legacyService: { select: { code: true } },
          offering: { select: { code: true } },
          option: { select: { code: true } },
        },
      }),
    ]);

  const results = [
    inspectRows("CareOffering", OFFERINGS, offerings, (row) => row.code),
    inspectRows(
      "CareOption",
      OPTIONS,
      options.map(({ offering, ...row }) => ({
        ...row,
        offeringCode: offering.code,
      })),
      (row) => row.code,
    ),
    inspectRows(
      "CareSpeciesPolicy",
      SPECIES_POLICIES,
      policies.map(({ offering, ...row }) => ({
        ...row,
        offeringCode: offering.code,
      })),
      (row) => `${row.offeringCode}:${row.species}`,
    ),
    inspectRows(
      "ClientCareRate",
      CLIENT_RATES.map((row) => ({
        ...row,
        currency: "USD",
        includedPetCount: 1,
        defaultAdditionalCents: null,
        version: 1,
        isActive: true,
      })),
      rates.map(({ careOption, ...row }) => ({
        ...row,
        optionCode: careOption.code,
      })),
      (row) => row.optionCode,
    ),
    inspectRows(
      "ClientCareRatePetCharge",
      PET_CHARGES,
      charges.map(({ clientRate, ...row }) => ({
        ...row,
        optionCode: clientRate.careOption.code,
      })),
      (row) => `${row.optionCode}:${row.species}:${row.includedCount}`,
    ),
    inspectRows(
      "LegacyServiceMapping",
      LEGACY_MAPPINGS,
      mappings.map((row) => ({
        serviceCode: row.legacyService.code,
        offeringCode: row.offering.code,
        optionCode: row.option?.code ?? null,
        notes: row.notes,
      })),
      (row) => row.serviceCode,
    ),
  ];

  return {
    results,
    totals: results.reduce(
      (totals, result) => ({
        create: totals.create + result.create.length,
        matching: totals.matching + result.matching.length,
        drift: totals.drift + result.drift.length,
      }),
      { create: 0, matching: 0, drift: 0 },
    ),
  };
}

function assertNoBootstrapDrift(inspection) {
  const drift = inspection.results.flatMap((result) =>
    result.drift.map((row) => `${result.model}:${row.key}`),
  );
  assert.equal(
    drift.length,
    0,
    `Canonical configuration drift requires manual review: ${drift.join(", ")}`,
  );
}

function calculateCatalogSubtotal(option, composition) {
  let totalCents = option.clientRate.baseRateCents;
  for (const [species, count] of Object.entries(composition)) {
    const rules = option.clientRate.petCharges
      .filter((charge) => charge.species === species)
      .sort((left, right) => right.includedCount - left.includedCount);

    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      const rule = rules.find((charge) => charge.includedCount < ordinal);
      if (rule) {
        totalCents += rule.additionalCents;
      } else if (
        ordinal > option.clientRate.includedPetCount &&
        option.clientRate.defaultAdditionalCents != null
      ) {
        totalCents += option.clientRate.defaultAdditionalCents;
      }
    }
  }
  return totalCents;
}

async function loadParityOptions(client) {
  const rows = await client.careOption.findMany({
    where: { code: { in: OPTIONS.map((option) => option.code) } },
    include: { clientRate: { include: { petCharges: true } } },
  });
  return new Map(rows.map((option) => [option.code, option]));
}

function verifyParity(optionByCode) {
  return PARITY_CASES.map(([name, optionCode, composition, expectedCents]) => {
    const option = optionByCode.get(optionCode);
    assert(option?.clientRate, `Missing client rate for ${optionCode}.`);
    const actualCents = calculateCatalogSubtotal(option, composition);
    assert.equal(actualCents, expectedCents, `${name} must equal ${expectedCents}.`);
    return { name, actualCents, expectedCents, passed: true };
  });
}

async function resolveOperator(prisma, operatorUserId) {
  const select = { id: true, name: true, email: true, role: true };

  if (operatorUserId) {
    const operator = await prisma.user.findUnique({
      where: { id: operatorUserId },
      select,
    });
    assert(operator, "The selected catalog operator User does not exist.");
    assert.equal(
      operator.role,
      "OPERATOR",
      "The selected catalog operator User must have role OPERATOR.",
    );
    return operator;
  }

  const operators = await prisma.user.findMany({
    where: { role: "OPERATOR" },
    select,
    orderBy: { id: "asc" },
  });
  assert(operators.length > 0, "No OPERATOR user exists for catalog rate attribution.");
  assert.equal(
    operators.length,
    1,
    "Multiple OPERATOR users exist; specify --operator-user-id=<id> or CATALOG_OPERATOR_USER_ID.",
  );
  return operators[0];
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find((argument) => ["--dry-run", "--apply"].includes(argument));
  if (
    !mode ||
    args.filter((argument) => ["--dry-run", "--apply"].includes(argument))
      .length !== 1
  ) {
    throw new Error("Use --dry-run or --apply.");
  }

  const operatorArgument = args.find((argument) =>
    argument.startsWith("--operator-user-id="),
  );
  const operatorArgumentId = operatorArgument
    ?.slice("--operator-user-id=".length)
    .trim();
  if (operatorArgument && !operatorArgumentId) {
    throw new Error("--operator-user-id requires an existing User ID.");
  }
  const operatorEnvironmentId = process.env.CATALOG_OPERATOR_USER_ID?.trim();
  if (
    operatorArgumentId &&
    operatorEnvironmentId &&
    operatorArgumentId !== operatorEnvironmentId
  ) {
    throw new Error(
      "--operator-user-id and CATALOG_OPERATOR_USER_ID must select the same User.",
    );
  }
  const operatorUserId = operatorArgumentId || operatorEnvironmentId || null;

  const identity = await assertSafeDatabase();
  const prisma = new PrismaClient();

  try {
    const beforeCounts = await getCounts(prisma);
    const beforeServices = await prisma.service.findMany({ orderBy: { code: "asc" } });
    const operator = await resolveOperator(prisma, operatorUserId);

    const requiredServiceCodes = LEGACY_MAPPINGS.map((mapping) => mapping.serviceCode);
    const requiredServices = await prisma.service.findMany({
      where: { code: { in: [...requiredServiceCodes, ...EXTRA_CODES] } },
      select: { id: true, code: true, category: true, isActive: true },
    });
    assert.equal(requiredServices.length, 20, "All 17 core and 3 extra Services are required.");
    const serviceByCode = new Map(requiredServices.map((service) => [service.code, service]));
    for (const code of requiredServiceCodes) {
      assert(serviceByCode.has(code), `Missing required legacy Service: ${code}`);
    }
    for (const code of EXTRA_CODES) {
      assert.equal(serviceByCode.get(code)?.category, "EXTRA", `${code} must remain an EXTRA.`);
    }

    const bootstrapInspection = await inspectBootstrap(prisma);

    console.log(
      JSON.stringify({
        mode,
        database: identity,
        operator: { name: operator.name, email: redactEmail(operator.email), role: operator.role },
        beforeCounts,
        expectedCurrentCounts: EXPECTED_COUNTS,
        bootstrapInspection,
      }, null, 2),
    );

    assertNoBootstrapDrift(bootstrapInspection);
    if (mode === "--dry-run") return;

    await prisma.$transaction(async (tx) => {
      assertNoBootstrapDrift(await inspectBootstrap(tx));

      const offeringByCode = new Map();
      for (const offering of OFFERINGS) {
        const row =
          (await tx.careOffering.findUnique({ where: { code: offering.code } })) ??
          (await tx.careOffering.create({ data: offering }));
        offeringByCode.set(offering.code, row);
      }

      const optionByCode = new Map();
      for (const option of OPTIONS) {
        const offeringId = offeringByCode.get(option.offeringCode).id;
        const data = {
          offeringId,
          code: option.code,
          label: option.label,
          primarySpecies: option.primarySpecies,
          durationMinutes: option.durationMinutes,
          isActive: option.isActive,
          sortOrder: option.sortOrder,
        };
        const row =
          (await tx.careOption.findUnique({ where: { code: option.code } })) ??
          (await tx.careOption.create({ data }));
        optionByCode.set(option.code, row);
      }

      for (const policy of SPECIES_POLICIES) {
        const offeringId = offeringByCode.get(policy.offeringCode).id;
        const data = {
          offeringId,
          species: policy.species,
          isSupported: policy.isSupported,
          minimumCount: policy.minimumCount,
          maximumCount: policy.maximumCount,
        };
        const existing = await tx.careSpeciesPolicy.findUnique({
          where: { offeringId_species: { offeringId, species: policy.species } },
        });
        if (!existing) await tx.careSpeciesPolicy.create({ data });
      }

      const rateByOptionCode = new Map();
      for (const rate of CLIENT_RATES) {
        const careOptionId = optionByCode.get(rate.optionCode).id;
        const data = {
          careOptionId,
          currency: "USD",
          baseRateCents: rate.baseRateCents,
          includedPetCount: 1,
          defaultAdditionalCents: null,
          version: 1,
          isActive: true,
          setByUserId: operator.id,
        };
        const row =
          (await tx.clientCareRate.findUnique({ where: { careOptionId } })) ??
          (await tx.clientCareRate.create({ data }));
        rateByOptionCode.set(rate.optionCode, row);
      }

      for (const charge of PET_CHARGES) {
        const clientRateId = rateByOptionCode.get(charge.optionCode).id;
        const data = {
          clientRateId,
          species: charge.species,
          includedCount: charge.includedCount,
          additionalCents: charge.additionalCents,
        };
        const where = {
          clientRateId_species_includedCount: {
            clientRateId,
            species: charge.species,
            includedCount: charge.includedCount,
          },
        };
        const existing = await tx.clientCareRatePetCharge.findUnique({
          where,
        });
        if (!existing) await tx.clientCareRatePetCharge.create({ data });
      }

      for (const mapping of LEGACY_MAPPINGS) {
        const legacyServiceId = serviceByCode.get(mapping.serviceCode).id;
        const data = {
          legacyServiceId,
          offeringId: offeringByCode.get(mapping.offeringCode).id,
          optionId: optionByCode.get(mapping.optionCode).id,
          notes: mapping.notes,
        };
        const existing = await tx.legacyServiceMapping.findUnique({
          where: { legacyServiceId },
        });
        if (!existing) await tx.legacyServiceMapping.create({ data });
      }

      const completedInspection = await inspectBootstrap(tx);
      assertNoBootstrapDrift(completedInspection);
      assert.equal(completedInspection.totals.create, 0, "Bootstrap records are missing.");
    });

    const afterCounts = await getCounts(prisma);
    const afterServices = await prisma.service.findMany({ orderBy: { code: "asc" } });
    assert.deepEqual(afterServices, beforeServices, "Legacy Service rows must not change.");
    for (const model of [
      "User",
      "Service",
      "Booking",
      "Visit",
      "BookingHistory",
      "BookingLineItem",
      "BookingPet",
      "Pet",
    ]) {
      assert.equal(afterCounts[model], beforeCounts[model], `${model} count must not change.`);
    }
    const afterInspection = await inspectBootstrap(prisma);
    assertNoBootstrapDrift(afterInspection);
    assert.equal(afterInspection.totals.create, 0, "Bootstrap records are missing.");

    const extrasMapped = await prisma.legacyServiceMapping.count({
      where: { legacyService: { code: { in: EXTRA_CODES } } },
    });
    assert.equal(extrasMapped, 0, "Legacy extras must remain unmapped.");

    const parity = verifyParity(await loadParityOptions(prisma));
    console.log(
      JSON.stringify({ afterCounts, bootstrapInspection: afterInspection, extrasMapped, parity }, null, 2),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
