import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const PROHIBITED_BRANCH_SUFFIX = "j4y";
const TARGET_SERVICE_CODES = [
  "CAT_DROPIN_SINGLE_15",
  "CAT_DROPIN_DOUBLE_15",
  "DOG_WALK_SINGLE_15",
];
const TARGET_OPTION_CODES = ["DROP_IN_CAT_15", "DOG_WALK_15"];

const BEFORE = {
  services: [
    { code: "CAT_DROPIN_DOUBLE_15", basePriceCents: 2000, notes: "+$3 per visit per additional cat after two", isActive: true },
    { code: "CAT_DROPIN_SINGLE_15", basePriceCents: 1000, notes: null, isActive: true },
    { code: "DOG_WALK_SINGLE_15", basePriceCents: 1500, notes: null, isActive: true },
  ],
  rates: [
    { code: "DOG_WALK_15", baseRateCents: 1500, version: 1, currency: "USD", includedPetCount: 1, defaultAdditionalCents: null, isActive: true },
    { code: "DROP_IN_CAT_15", baseRateCents: 1000, version: 1, currency: "USD", includedPetCount: 1, defaultAdditionalCents: null, isActive: true },
  ],
  charges: [
    { code: "DROP_IN_CAT_15", species: "Cat", includedCount: 1, additionalCents: 1000 },
    { code: "DROP_IN_CAT_15", species: "Cat", includedCount: 2, additionalCents: 300 },
  ],
};

const AFTER = {
  services: [
    { code: "CAT_DROPIN_DOUBLE_15", basePriceCents: 2300, notes: "+$3 per visit per additional cat after two", isActive: true },
    { code: "CAT_DROPIN_SINGLE_15", basePriceCents: 2000, notes: null, isActive: true },
    { code: "DOG_WALK_SINGLE_15", basePriceCents: 2200, notes: null, isActive: true },
  ],
  rates: [
    { code: "DOG_WALK_15", baseRateCents: 2200, version: 2, currency: "USD", includedPetCount: 1, defaultAdditionalCents: null, isActive: true },
    { code: "DROP_IN_CAT_15", baseRateCents: 2000, version: 2, currency: "USD", includedPetCount: 1, defaultAdditionalCents: null, isActive: true },
  ],
  charges: [
    { code: "DROP_IN_CAT_15", species: "Cat", includedCount: 1, additionalCents: 300 },
  ],
};

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
  if (!expectedQaBranchId) throw new Error("TASKWHISKER_QA_BRANCH_ID is required.");
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
    assert(operator, "The selected pricing operator User does not exist.");
    assert.equal(operator.role, "OPERATOR", "The selected User must be an OPERATOR.");
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
    "Multiple OPERATOR users exist; specify --operator-user-id=<id> or CATALOG_OPERATOR_USER_ID.",
  );
  return operators[0];
}

async function inspectTargetState(client) {
  const [services, rates, charges] = await Promise.all([
    client.service.findMany({
      where: { code: { in: TARGET_SERVICE_CODES } },
      select: { code: true, basePriceCents: true, notes: true, isActive: true },
      orderBy: { code: "asc" },
    }),
    client.clientCareRate.findMany({
      where: { careOption: { code: { in: TARGET_OPTION_CODES } } },
      select: {
        baseRateCents: true,
        version: true,
        currency: true,
        includedPetCount: true,
        defaultAdditionalCents: true,
        isActive: true,
        careOption: { select: { code: true } },
      },
      orderBy: { careOption: { code: "asc" } },
    }),
    client.clientCareRatePetCharge.findMany({
      where: { clientRate: { careOption: { code: { in: TARGET_OPTION_CODES } } } },
      select: {
        species: true,
        includedCount: true,
        additionalCents: true,
        clientRate: { select: { careOption: { select: { code: true } } } },
      },
      orderBy: [{ species: "asc" }, { includedCount: "asc" }],
    }),
  ]);

  return {
    services,
    rates: rates.map(({ careOption, ...rate }) => ({
      code: careOption.code,
      ...rate,
    })),
    charges: charges.map(({ clientRate, ...charge }) => ({
      code: clientRate.careOption.code,
      ...charge,
    })),
  };
}

function classifyState(state) {
  if (isDeepStrictEqual(state, BEFORE)) return "APPLY_REQUIRED";
  if (isDeepStrictEqual(state, AFTER)) return "MATCHING";
  return "DRIFT";
}

async function getSafetySnapshot(client) {
  const [services, rates, bookingTotals, compensationCounts] = await Promise.all([
    client.service.findMany({ orderBy: { code: "asc" } }),
    client.clientCareRate.findMany({
      where: { careOption: { code: { notIn: TARGET_OPTION_CODES } } },
      include: { careOption: { select: { code: true } }, petCharges: true },
      orderBy: { careOption: { code: "asc" } },
    }),
    client.booking.aggregate({
      _count: true,
      _sum: { clientTotalCents: true },
    }),
    Promise.all([
      client.defaultSitterCareRate.count(),
      client.defaultSitterCareRatePetCharge.count(),
      client.sitterCareRate.count(),
      client.sitterCareRatePetCharge.count(),
    ]),
  ]);
  return {
    unaffectedServices: services.filter(
      (service) => !TARGET_SERVICE_CODES.includes(service.code),
    ),
    unaffectedRates: rates,
    bookingTotals,
    compensationCounts,
  };
}

async function applyUpdate(tx, operatorId) {
  for (const service of AFTER.services) {
    const before = BEFORE.services.find((row) => row.code === service.code);
    const result = await tx.service.updateMany({
      where: {
        code: service.code,
        basePriceCents: before.basePriceCents,
        notes: before.notes,
        isActive: before.isActive,
      },
      data: {
        basePriceCents: service.basePriceCents,
        notes: service.notes,
      },
    });
    assert.equal(result.count, 1, `Legacy Service changed unexpectedly: ${service.code}`);
  }

  for (const rate of AFTER.rates) {
    const before = BEFORE.rates.find((row) => row.code === rate.code);
    const result = await tx.clientCareRate.updateMany({
      where: {
        careOption: { code: rate.code },
        baseRateCents: before.baseRateCents,
        version: before.version,
        currency: before.currency,
        includedPetCount: before.includedPetCount,
        defaultAdditionalCents: before.defaultAdditionalCents,
        isActive: before.isActive,
      },
      data: {
        baseRateCents: rate.baseRateCents,
        version: rate.version,
        setByUserId: operatorId,
      },
    });
    assert.equal(result.count, 1, `ClientCareRate changed unexpectedly: ${rate.code}`);
  }

  const catRate = await tx.clientCareRate.findUniqueOrThrow({
    where: { careOptionId: (await tx.careOption.findUniqueOrThrow({ where: { code: "DROP_IN_CAT_15" } })).id },
    select: { id: true },
  });
  const thresholdOne = await tx.clientCareRatePetCharge.updateMany({
    where: {
      clientRateId: catRate.id,
      species: "Cat",
      includedCount: 1,
      additionalCents: 1000,
    },
    data: { additionalCents: 300 },
  });
  assert.equal(thresholdOne.count, 1, "Cat threshold 1 changed unexpectedly.");
  const thresholdTwo = await tx.clientCareRatePetCharge.deleteMany({
    where: {
      clientRateId: catRate.id,
      species: "Cat",
      includedCount: 2,
      additionalCents: 300,
    },
  });
  assert.equal(thresholdTwo.count, 1, "Cat threshold 2 changed unexpectedly.");
}

async function main() {
  const args = process.argv.slice(2);
  const modes = args.filter((argument) => ["--dry-run", "--apply"].includes(argument));
  assert.equal(modes.length, 1, "Use exactly one of --dry-run or --apply.");
  const mode = modes[0];
  const argumentId = args.find((argument) => argument.startsWith("--operator-user-id="))
    ?.slice("--operator-user-id=".length)
    .trim();
  const environmentId = process.env.CATALOG_OPERATOR_USER_ID?.trim();
  if (argumentId && environmentId) {
    assert.equal(argumentId, environmentId, "Operator selectors must identify the same User.");
  }

  const identity = await assertSafeDatabase();
  const prisma = new PrismaClient();
  try {
    const operator = await resolveOperator(prisma, argumentId || environmentId || null);
    const state = await inspectTargetState(prisma);
    const classification = classifyState(state);
    console.log(JSON.stringify({
      mode,
      database: identity,
      operator: { name: operator.name, email: redactEmail(operator.email), role: operator.role },
      classification,
      current: state,
    }, null, 2));
    if (classification === "DRIFT") {
      throw new Error("Approved pricing targets differ from both expected pre-change and post-change state.");
    }
    if (mode === "--dry-run" || classification === "MATCHING") return;

    const beforeSafety = await getSafetySnapshot(prisma);
    await prisma.$transaction(async (tx) => {
      assert.equal(classifyState(await inspectTargetState(tx)), "APPLY_REQUIRED");
      await applyUpdate(tx, operator.id);
      assert.deepEqual(await inspectTargetState(tx), AFTER);
    });
    const afterSafety = await getSafetySnapshot(prisma);
    assert.deepEqual(afterSafety, beforeSafety, "Unrelated or historical records changed.");
    console.log(JSON.stringify({ classification: "MATCHING", current: await inspectTargetState(prisma) }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
