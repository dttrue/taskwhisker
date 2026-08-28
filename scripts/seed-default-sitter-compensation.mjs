import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { calculateMaximumOrdinaryBaseCompensationCents } from "../src/lib/pricing/calculateBusinessAssignedSitterCompensation.js";

const PROHIBITED_BRANCH_SUFFIX = "j4y";

const DEFAULT_RATES = [
  ["DROP_IN_DOG_15", 2000, 1700],
  ["DROP_IN_DOG_30", 2500, 2100],
  ["DROP_IN_DOG_60", 3000, 2600],
  ["DROP_IN_CAT_15", 2000, 1700],
  ["DROP_IN_CAT_30", 2500, 2100],
  ["DROP_IN_CAT_60", 3000, 2600],
  ["DOG_WALK_15", 2200, 1800],
  ["DOG_WALK_30", 2200, 1800],
  ["DOG_WALK_60", 3000, 2600],
  ["OVERNIGHT_DOG_HOME", 6000, 5400],
  ["OVERNIGHT_CAT_HOME", 4200, 3700],
].map(([optionCode, clientBaseRateCents, baseCompensationCents]) => ({
  optionCode,
  clientBaseRateCents,
  currency: "USD",
  baseCompensationCents,
  includedPetCount: 1,
  defaultAdditionalCents: null,
  version: 1,
  isActive: true,
}));

const PET_CHARGES = [
  ["DROP_IN_DOG_15", "Dog", 1, 200],
  ["DROP_IN_DOG_30", "Dog", 1, 400],
  ["DROP_IN_DOG_60", "Dog", 1, 400],
  ["DROP_IN_CAT_15", "Cat", 1, 300],
  ["DROP_IN_CAT_30", "Cat", 1, 300],
  ["DROP_IN_CAT_60", "Cat", 1, 300],
  ["OVERNIGHT_DOG_HOME", "Dog", 1, 1600],
  ["OVERNIGHT_DOG_HOME", "Cat", 0, 600],
  ["OVERNIGHT_CAT_HOME", "Cat", 1, 600],
].map(([optionCode, species, includedCount, additionalCents]) => ({
  optionCode,
  species,
  includedCount,
  additionalCents,
}));

function redactEmail(email) {
  const [local, domain] = String(email).split("@");
  return domain ? `${local.slice(0, 2)}…@${domain}` : "redacted";
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
    "Connected Neon branch is not the configured disposable QA branch.",
  );
  assert.equal(
    databaseIdentity.branchId.endsWith(PROHIBITED_BRANCH_SUFFIX),
    false,
    "The shared Neon branch is explicitly prohibited.",
  );
  return databaseIdentity;
}

async function resolveOperator(prisma, operatorUserId) {
  const select = { id: true, name: true, email: true, role: true };
  if (operatorUserId) {
    const operator = await prisma.user.findUnique({
      where: { id: operatorUserId },
      select,
    });
    assert(operator, "The selected compensation operator User does not exist.");
    assert.equal(
      operator.role,
      "OPERATOR",
      "The selected compensation operator User must have role OPERATOR.",
    );
    return operator;
  }

  const operators = await prisma.user.findMany({
    where: { role: "OPERATOR" },
    select,
    orderBy: { id: "asc" },
  });
  assert(operators.length > 0, "No OPERATOR user exists for rate attribution.");
  assert.equal(
    operators.length,
    1,
    "Multiple OPERATOR users exist; specify --operator-user-id=<id> or COMPENSATION_OPERATOR_USER_ID.",
  );
  return operators[0];
}

function rateKey(row) {
  return row.optionCode;
}

function chargeKey(row) {
  return `${row.optionCode}:${row.species}:${row.includedCount}`;
}

function expectedRateMaterial(rate) {
  return {
    optionCode: rate.optionCode,
    currency: rate.currency,
    baseCompensationCents: rate.baseCompensationCents,
    includedPetCount: rate.includedPetCount,
    defaultAdditionalCents: rate.defaultAdditionalCents,
    version: rate.version,
    isActive: rate.isActive,
    setByRole: "OPERATOR",
  };
}

function actualRateMaterial(rate) {
  return {
    optionCode: rate.careOption.code,
    currency: rate.currency,
    baseCompensationCents: rate.baseCompensationCents,
    includedPetCount: rate.includedPetCount,
    defaultAdditionalCents: rate.defaultAdditionalCents,
    version: rate.version,
    isActive: rate.isActive,
    setByRole: rate.setByUser.role,
  };
}

async function inspectConfiguration(client) {
  const optionCodes = DEFAULT_RATES.map((rate) => rate.optionCode);
  const [activeOptionCount, options, existingRates, overrideCounts] =
    await Promise.all([
      client.careOption.count({
        where: { isActive: true, offering: { isActive: true } },
      }),
      client.careOption.findMany({
        where: { code: { in: optionCodes } },
        select: {
          id: true,
          code: true,
          isActive: true,
          offering: { select: { isActive: true } },
          clientRate: {
            select: {
              currency: true,
              baseRateCents: true,
              isActive: true,
            },
          },
        },
        orderBy: { code: "asc" },
      }),
      client.defaultSitterCareRate.findMany({
        where: { careOption: { code: { in: optionCodes } } },
        include: {
          careOption: { select: { code: true } },
          setByUser: { select: { role: true } },
          petCharges: true,
        },
        orderBy: { careOption: { code: "asc" } },
      }),
      Promise.all([
        client.sitterCareRate.count(),
        client.sitterCareRatePetCharge.count(),
      ]),
    ]);

  assert.equal(activeOptionCount, 11, "Exactly 11 active canonical options are required.");
  assert.equal(options.length, DEFAULT_RATES.length, "Every managed CareOption is required.");
  assert.deepEqual(
    overrideCounts,
    [0, 0],
    "Sitter-specific compensation tables must remain empty in this phase.",
  );

  const optionByCode = new Map(options.map((option) => [option.code, option]));
  const clientRates = DEFAULT_RATES.map((expectedRate) => {
    const option = optionByCode.get(expectedRate.optionCode);
    assert(option?.isActive && option.offering.isActive, `${expectedRate.optionCode} must be active.`);
    assert(option.clientRate?.isActive, `${expectedRate.optionCode} requires an active client rate.`);
    assert.equal(option.clientRate.currency, "USD", `${expectedRate.optionCode} must use USD.`);
    assert.equal(
      option.clientRate.baseRateCents,
      expectedRate.clientBaseRateCents,
      `${expectedRate.optionCode} client base pricing differs from the approved catalog.`,
    );
    const maximumBaseCompensationCents =
      calculateMaximumOrdinaryBaseCompensationCents(
        option.clientRate.baseRateCents,
      );
    assert(
      expectedRate.baseCompensationCents <= maximumBaseCompensationCents,
      `${expectedRate.optionCode} exceeds the ordinary compensation ceiling.`,
    );
    return {
      optionCode: option.code,
      clientBaseRateCents: option.clientRate.baseRateCents,
      maximumBaseCompensationCents,
    };
  });

  const existingRateByCode = new Map(
    existingRates.map((rate) => [rate.careOption.code, rate]),
  );
  const rates = { create: [], matching: [], drift: [] };
  for (const expected of DEFAULT_RATES) {
    const actual = existingRateByCode.get(expected.optionCode);
    if (!actual) {
      rates.create.push(rateKey(expected));
      continue;
    }
    const expectedMaterial = expectedRateMaterial(expected);
    const actualMaterial = actualRateMaterial(actual);
    if (isDeepStrictEqual(actualMaterial, expectedMaterial)) {
      rates.matching.push(rateKey(expected));
    } else {
      rates.drift.push({
        key: rateKey(expected),
        expected: expectedMaterial,
        actual: actualMaterial,
      });
    }
  }

  const expectedChargesByOption = new Map();
  for (const charge of PET_CHARGES) {
    const charges = expectedChargesByOption.get(charge.optionCode) ?? [];
    charges.push(charge);
    expectedChargesByOption.set(charge.optionCode, charges);
  }

  const charges = { create: [], matching: [], drift: [] };
  for (const expectedRate of DEFAULT_RATES) {
    const actualRate = existingRateByCode.get(expectedRate.optionCode);
    const expectedCharges = expectedChargesByOption.get(expectedRate.optionCode) ?? [];
    const expectedByKey = new Map(
      expectedCharges.map((charge) => [chargeKey(charge), charge]),
    );
    const actualByKey = new Map(
      (actualRate?.petCharges ?? []).map((charge) => [
        chargeKey({ optionCode: expectedRate.optionCode, ...charge }),
        charge,
      ]),
    );

    for (const expected of expectedCharges) {
      const key = chargeKey(expected);
      const actual = actualByKey.get(key);
      if (!actual) {
        charges.create.push(key);
      } else if (actual.additionalCents === expected.additionalCents) {
        charges.matching.push(key);
      } else {
        charges.drift.push({
          key,
          expected: { additionalCents: expected.additionalCents },
          actual: { additionalCents: actual.additionalCents },
        });
      }
    }

    for (const [key, actual] of actualByKey) {
      if (!expectedByKey.has(key)) {
        charges.drift.push({
          key,
          expected: null,
          actual: {
            species: actual.species,
            includedCount: actual.includedCount,
            additionalCents: actual.additionalCents,
          },
        });
      }
    }
  }

  const totals = {
    create: rates.create.length + charges.create.length,
    matching: rates.matching.length + charges.matching.length,
    drift: rates.drift.length + charges.drift.length,
  };
  return {
    clientRates,
    rates,
    charges,
    totals,
    overrideCounts: {
      SitterCareRate: overrideCounts[0],
      SitterCareRatePetCharge: overrideCounts[1],
    },
  };
}

function assertNoDrift(inspection) {
  const driftKeys = [
    ...inspection.rates.drift.map((row) => `DefaultSitterCareRate:${row.key}`),
    ...inspection.charges.drift.map(
      (row) => `DefaultSitterCareRatePetCharge:${row.key}`,
    ),
  ];
  assert.equal(
    driftKeys.length,
    0,
    `Default sitter compensation drift requires manual review: ${driftKeys.join(", ")}`,
  );
}

async function getSafetySnapshot(client) {
  const [services, clientRates, bookings, pricingSnapshots, lineItems, visits, histories, clients, sitterRates, sitterPetCharges] = await Promise.all([
    client.service.findMany({ orderBy: { id: "asc" } }),
    client.clientCareRate.findMany({
      include: { petCharges: true },
      orderBy: { id: "asc" },
    }),
    client.booking.findMany({ orderBy: { id: "asc" } }),
    client.bookingPricingSnapshot.findMany({ orderBy: { id: "asc" } }),
    client.bookingLineItem.findMany({ orderBy: { id: "asc" } }),
    client.visit.findMany({ orderBy: { id: "asc" } }),
    client.bookingHistory.findMany({ orderBy: { id: "asc" } }),
    client.client.findMany({ orderBy: { id: "asc" } }),
    client.sitterCareRate.findMany({
      include: { petCharges: true },
      orderBy: { id: "asc" },
    }),
    client.sitterCareRatePetCharge.findMany({ orderBy: { id: "asc" } }),
  ]);
  return {
    services,
    clientRates,
    bookings,
    pricingSnapshots,
    lineItems,
    visits,
    histories,
    clients,
    sitterRates,
    sitterPetCharges,
  };
}

async function applyConfiguration(tx, operatorId) {
  const optionRows = await tx.careOption.findMany({
    where: { code: { in: DEFAULT_RATES.map((rate) => rate.optionCode) } },
    select: { id: true, code: true },
  });
  const optionByCode = new Map(optionRows.map((option) => [option.code, option]));
  const rateByOptionCode = new Map();

  for (const rate of DEFAULT_RATES) {
    const careOptionId = optionByCode.get(rate.optionCode).id;
    const existing = await tx.defaultSitterCareRate.findUnique({
      where: { careOptionId },
    });
    const row = existing ?? await tx.defaultSitterCareRate.create({
      data: {
        careOptionId,
        currency: rate.currency,
        baseCompensationCents: rate.baseCompensationCents,
        includedPetCount: rate.includedPetCount,
        defaultAdditionalCents: rate.defaultAdditionalCents,
        version: rate.version,
        isActive: rate.isActive,
        setByUserId: operatorId,
      },
    });
    rateByOptionCode.set(rate.optionCode, row);
  }

  for (const charge of PET_CHARGES) {
    const defaultRateId = rateByOptionCode.get(charge.optionCode).id;
    const where = {
      defaultRateId_species_includedCount: {
        defaultRateId,
        species: charge.species,
        includedCount: charge.includedCount,
      },
    };
    const existing = await tx.defaultSitterCareRatePetCharge.findUnique({ where });
    if (!existing) {
      await tx.defaultSitterCareRatePetCharge.create({
        data: {
          defaultRateId,
          species: charge.species,
          includedCount: charge.includedCount,
          additionalCents: charge.additionalCents,
        },
      });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const modes = args.filter((argument) => ["--dry-run", "--apply"].includes(argument));
  assert.equal(modes.length, 1, "Use exactly one of --dry-run or --apply.");
  const mode = modes[0];
  const operatorArgument = args.find((argument) =>
    argument.startsWith("--operator-user-id="),
  );
  const operatorArgumentId = operatorArgument
    ?.slice("--operator-user-id=".length)
    .trim();
  if (operatorArgument && !operatorArgumentId) {
    throw new Error("--operator-user-id requires an existing User ID.");
  }
  const operatorEnvironmentId =
    process.env.COMPENSATION_OPERATOR_USER_ID?.trim();
  if (
    operatorArgumentId &&
    operatorEnvironmentId &&
    operatorArgumentId !== operatorEnvironmentId
  ) {
    throw new Error(
      "--operator-user-id and COMPENSATION_OPERATOR_USER_ID must select the same User.",
    );
  }
  const operatorUserId = operatorArgumentId || operatorEnvironmentId || null;

  const identity = await assertSafeDatabase();
  const prisma = new PrismaClient();
  try {
    const operator = await resolveOperator(prisma, operatorUserId);
    const inspection = await inspectConfiguration(prisma);
    console.log(JSON.stringify({
      mode,
      database: identity,
      operator: {
        name: operator.name,
        email: redactEmail(operator.email),
        role: operator.role,
      },
      inspection,
    }, null, 2));
    assertNoDrift(inspection);
    if (mode === "--dry-run" || inspection.totals.create === 0) return;

    const beforeSafety = await getSafetySnapshot(prisma);
    await prisma.$transaction(async (tx) => {
      const transactionInspection = await inspectConfiguration(tx);
      assertNoDrift(transactionInspection);
      await applyConfiguration(tx, operator.id);
      const completedInspection = await inspectConfiguration(tx);
      assertNoDrift(completedInspection);
      assert.equal(completedInspection.totals.create, 0, "Managed compensation rows are missing.");
      assert.equal(completedInspection.totals.matching, 20, "Managed compensation rows do not match.");
    });
    const afterSafety = await getSafetySnapshot(prisma);
    assert.deepEqual(afterSafety, beforeSafety, "Unrelated, client, or historical data changed.");

    const completedInspection = await inspectConfiguration(prisma);
    console.log(JSON.stringify({ completedInspection }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
