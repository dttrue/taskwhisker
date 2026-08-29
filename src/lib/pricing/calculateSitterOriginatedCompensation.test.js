import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalClientQuoteError,
  calculateCanonicalClientQuote,
} from "./calculateCanonicalClientQuote.js";
import {
  SITTER_ORIGINATED_COMPENSATION_ERROR_CODES,
  SITTER_ORIGINATED_COMPENSATION_LANE,
  SitterOriginatedCompensationError,
  calculateSitterOriginatedCompensation,
  validateSitterOriginatedSitter,
} from "./calculateSitterOriginatedCompensation.js";
import {
  buildSitterOriginatedCompensationResolverInput,
  quoteSitterOriginatedCompensationWithDb,
} from "./sitterOriginatedCompensationResolver.js";

const sitter = { id: "sitter-1", role: "SITTER" };

const offerings = {
  DROP_IN: {
    code: "DROP_IN",
    name: "Drop-In Visit",
    billingUnit: "VISIT",
    scheduleKind: "TIMED_VISIT",
    allowsMixedSpecies: false,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: null,
    isActive: true,
    speciesPolicies: [
      { species: "Dog", isSupported: true, minimumCount: 0, maximumCount: 2 },
      { species: "Cat", isSupported: true, minimumCount: 0, maximumCount: null },
    ],
  },
  DOG_WALK: {
    code: "DOG_WALK",
    name: "Dog Walk",
    billingUnit: "VISIT",
    scheduleKind: "TIMED_VISIT",
    allowsMixedSpecies: false,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: 1,
    isActive: true,
    speciesPolicies: [
      { species: "Dog", isSupported: true, minimumCount: 1, maximumCount: 1 },
    ],
  },
  OVERNIGHT: {
    code: "OVERNIGHT",
    name: "Overnight Care",
    billingUnit: "NIGHT",
    scheduleKind: "OVERNIGHT_STAY",
    allowsMixedSpecies: true,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: null,
    isActive: true,
    speciesPolicies: [
      { species: "Dog", isSupported: true, minimumCount: 0, maximumCount: null },
      { species: "Cat", isSupported: true, minimumCount: 0, maximumCount: null },
    ],
  },
};

const optionDefinitions = {
  DROP_IN_DOG_30: ["DROP_IN", "Dog drop-in · 30 minutes", "Dog", 2500, [["Dog", 1, 500]]],
  DROP_IN_CAT_15: ["DROP_IN", "Cat drop-in · 15 minutes", "Cat", 2000, [["Cat", 1, 300]]],
  DROP_IN_CAT_30: ["DROP_IN", "Cat drop-in · 30 minutes", "Cat", 2500, [["Cat", 1, 300]]],
  DROP_IN_CAT_60: ["DROP_IN", "Cat drop-in · 60 minutes", "Cat", 3000, [["Cat", 1, 300]]],
  DOG_WALK_15: ["DOG_WALK", "15 minutes", "Dog", 2200, []],
  OVERNIGHT_DOG_HOME: [
    "OVERNIGHT",
    "Dog household",
    "Dog",
    6000,
    [
      ["Dog", 1, 2000],
      ["Cat", 0, 800],
    ],
  ],
  OVERNIGHT_CAT_HOME: ["OVERNIGHT", "Cat household", "Cat", 4200, [["Cat", 1, 800]]],
};

function makeCareOption(code, overrides = {}) {
  const [offeringCode, label, primarySpecies, baseRateCents, charges] =
    optionDefinitions[code];
  return {
    id: `option-${code}`,
    code,
    label,
    primarySpecies,
    durationMinutes: code.includes("OVERNIGHT")
      ? null
      : Number(code.match(/(15|30|60)$/)?.[1]),
    isActive: true,
    offering: { ...offerings[offeringCode] },
    clientRate: {
      id: `client-rate-${code}`,
      currency: "USD",
      baseRateCents,
      includedPetCount: 1,
      defaultAdditionalCents: null,
      version: 1,
      isActive: true,
      petCharges: charges.map(
        ([species, includedCount, additionalCents], index) => ({
          id: `${code}-charge-${index}`,
          species,
          includedCount,
          additionalCents,
        }),
      ),
    },
    ...overrides,
  };
}

function pets(...species) {
  return species.map((petSpecies, index) => ({
    name: `${petSpecies} ${index + 1}`,
    species: petSpecies,
  }));
}

function quote(code, bookingPets) {
  return calculateCanonicalClientQuote({
    careOption: makeCareOption(code),
    pets: bookingPets,
  });
}

function compensate(code, bookingPets, quantity = 1, overrides = {}) {
  return calculateSitterOriginatedCompensation({
    canonicalClientQuote: quote(code, bookingPets),
    sitterId: sitter.id,
    quantity,
    compensationLane: SITTER_ORIGINATED_COMPENSATION_LANE,
    expectedCurrency: "USD",
    ...overrides,
  });
}

function makeDb({ sitterRow = sitter, careOption = null } = {}) {
  const calls = [];
  return {
    calls,
    user: {
      async findUnique(args) {
        calls.push({ model: "User", args });
        return sitterRow;
      },
    },
    careOption: {
      async findUnique(args) {
        calls.push({ model: "CareOption", args });
        return careOption;
      },
    },
  };
}

function assertCode(run, code) {
  assert.throws(run, (error) => {
    assert(error instanceof SitterOriginatedCompensationError);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertRejectsCode(run, code) {
  await assert.rejects(run, (error) => {
    assert(error instanceof SitterOriginatedCompensationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("one Dog Drop-In 30 uses the full canonical service subtotal", () => {
  const result = compensate("DROP_IN_DOG_30", pets("Dog"));
  assert.deepEqual(
    [
      result.clientPricing.serviceSubtotalCents,
      result.sitterCompensationSubtotalCents,
      result.sitterFeeCents,
      result.sitterPayoutCents,
    ],
    [2500, 2500, 250, 2250],
  );
});

test("two Dogs Drop-In 30 includes canonical additional-pet pricing", () => {
  const result = compensate("DROP_IN_DOG_30", pets("Dog", "Dog"));
  assert.deepEqual(
    [result.sitterCompensationSubtotalCents, result.sitterFeeCents, result.sitterPayoutCents],
    [3000, 300, 2700],
  );
});

test("three Dog Drop-In 30 visits aggregate exactly once", () => {
  const result = compensate("DROP_IN_DOG_30", pets("Dog"), 3);
  assert.deepEqual(
    [result.clientPricing.serviceSubtotalCents, result.sitterFeeCents, result.sitterPayoutCents],
    [7500, 750, 6750],
  );
});

test("three two-Dog Drop-In 30 visits aggregate pet pricing exactly once", () => {
  const result = compensate("DROP_IN_DOG_30", pets("Dog", "Dog"), 3);
  assert.deepEqual(
    [result.clientPricing.serviceSubtotalCents, result.sitterFeeCents, result.sitterPayoutCents],
    [9000, 900, 8100],
  );
});

test("Cat Drop-In 15 supports one, two, and three Cats", () => {
  assert.deepEqual(
    [1, 2, 3].map((count) =>
      compensate("DROP_IN_CAT_15", pets(...Array(count).fill("Cat")))
        .sitterCompensationSubtotalCents,
    ),
    [2000, 2300, 2600],
  );
});

test("Cat Drop-In 30 supports one, two, and three Cats", () => {
  assert.deepEqual(
    [1, 2, 3].map((count) =>
      compensate("DROP_IN_CAT_30", pets(...Array(count).fill("Cat")))
        .sitterCompensationSubtotalCents,
    ),
    [2500, 2800, 3100],
  );
});

test("Cat Drop-In 60 supports one, two, and three Cats", () => {
  assert.deepEqual(
    [1, 2, 3].map((count) =>
      compensate("DROP_IN_CAT_60", pets(...Array(count).fill("Cat")))
        .sitterCompensationSubtotalCents,
    ),
    [3000, 3300, 3600],
  );
});

test("Dog Walk 15 uses canonical service pricing", () => {
  const result = compensate("DOG_WALK_15", pets("Dog"));
  assert.deepEqual(
    [result.sitterCompensationSubtotalCents, result.sitterFeeCents, result.sitterPayoutCents],
    [2200, 220, 1980],
  );
});

test("two-Dog Walk is rejected by the canonical quote", () => {
  assert.throws(
    () => quote("DOG_WALK_15", pets("Dog", "Dog")),
    (error) =>
      error instanceof CanonicalClientQuoteError &&
      error.code === "TOO_MANY_PETS",
  );
});

test("Dog Overnight supports one Dog", () => {
  assert.equal(
    compensate("OVERNIGHT_DOG_HOME", pets("Dog"))
      .sitterCompensationSubtotalCents,
    6000,
  );
});

test("Dog Overnight supports two Dogs", () => {
  assert.equal(
    compensate("OVERNIGHT_DOG_HOME", pets("Dog", "Dog"))
      .sitterCompensationSubtotalCents,
    8000,
  );
});

test("Dog Overnight supports a Dog and Cat", () => {
  assert.equal(
    compensate("OVERNIGHT_DOG_HOME", pets("Dog", "Cat"))
      .sitterCompensationSubtotalCents,
    6800,
  );
});

test("Dog Overnight supports two Dogs and a Cat", () => {
  assert.equal(
    compensate("OVERNIGHT_DOG_HOME", pets("Dog", "Dog", "Cat"))
      .sitterCompensationSubtotalCents,
    8800,
  );
});

test("two-night mixed Dog Overnight aggregates the full basis", () => {
  const result = compensate(
    "OVERNIGHT_DOG_HOME",
    pets("Dog", "Dog", "Cat"),
    2,
  );
  assert.deepEqual(
    [
      result.clientPricing.serviceSubtotalCents,
      result.clientPricing.clientFeeCents,
      result.clientPricing.clientTotalCents,
      result.sitterCompensationSubtotalCents,
      result.sitterFeeCents,
      result.sitterPayoutCents,
    ],
    [17_600, 1760, 19_360, 17_600, 1760, 15_840],
  );
});

test("Cat Overnight supports one and two Cats", () => {
  assert.deepEqual(
    [1, 2].map((count) =>
      compensate("OVERNIGHT_CAT_HOME", pets(...Array(count).fill("Cat")))
        .sitterCompensationSubtotalCents,
    ),
    [4200, 5000],
  );
});

test("Dog in Cat Overnight is rejected by canonical pricing", () => {
  assert.throws(
    () => quote("OVERNIGHT_CAT_HOME", pets("Cat", "Dog")),
    (error) =>
      error instanceof CanonicalClientQuoteError &&
      error.code === "MISSING_PET_PRICE",
  );
});

test("sitter fee is calculated once on the aggregate subtotal", () => {
  const result = compensate("DROP_IN_DOG_30", pets("Dog"), 3);
  assert.equal(result.sitterFeeCents, 750);
  assert.equal(
    result.sitterFeeCents,
    Math.round(result.sitterCompensationSubtotalCents * 0.1),
  );
});

test("odd-cent sitter fee uses the shared half-up rounding primitive", () => {
  const oddOption = makeCareOption("DROP_IN_DOG_30", {
    clientRate: {
      ...makeCareOption("DROP_IN_DOG_30").clientRate,
      baseRateCents: 1005,
    },
  });
  const canonicalClientQuote = calculateCanonicalClientQuote({
    careOption: oddOption,
    pets: pets("Dog"),
  });
  const result = calculateSitterOriginatedCompensation({
    canonicalClientQuote,
    sitterId: sitter.id,
    quantity: 1,
    compensationLane: SITTER_ORIGINATED_COMPENSATION_LANE,
  });
  assert.deepEqual([result.sitterFeeCents, result.sitterPayoutCents], [101, 904]);
});

test("client fee is excluded from the sitter compensation basis", () => {
  const result = compensate("DROP_IN_DOG_30", pets("Dog"));
  assert.equal(
    result.sitterCompensationSubtotalCents,
    result.clientPricing.serviceSubtotalCents,
  );
  assert.notEqual(
    result.sitterCompensationSubtotalCents,
    result.clientPricing.clientTotalCents,
  );
});

test("client additional-pet charges are included in the sitter basis", () => {
  const oneDog = compensate("DROP_IN_DOG_30", pets("Dog"));
  const twoDogs = compensate("DROP_IN_DOG_30", pets("Dog", "Dog"));
  assert.equal(
    twoDogs.sitterCompensationSubtotalCents -
      oneDog.sitterCompensationSubtotalCents,
    500,
  );
});

test("business-assigned rate fixtures cannot affect the result", () => {
  const canonicalClientQuote = {
    ...quote("DROP_IN_DOG_30", pets("Dog")),
    defaultSitterRate: { baseCompensationCents: 1 },
    sitterRate: { baseCompensationCents: 2 },
  };
  const result = calculateSitterOriginatedCompensation({
    canonicalClientQuote,
    sitterId: sitter.id,
    quantity: 1,
    compensationLane: SITTER_ORIGINATED_COMPENSATION_LANE,
  });
  assert.equal(result.sitterCompensationSubtotalCents, 2500);
});

test("invalid sitter role is rejected", () => {
  assertCode(
    () =>
      validateSitterOriginatedSitter(
        { id: sitter.id, role: "OPERATOR" },
        sitter.id,
      ),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_SITTER,
  );
});

test("missing sitter is rejected", () => {
  assertCode(
    () => validateSitterOriginatedSitter(null, sitter.id),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.SITTER_NOT_FOUND,
  );
});

test("resolver ignores browser-authoritative monetary fields", async () => {
  const careOption = makeCareOption("DROP_IN_DOG_30");
  const db = makeDb({ careOption });
  const result = await quoteSitterOriginatedCompensationWithDb({
    db,
    careOptionCode: careOption.code,
    sitterId: sitter.id,
    pets: pets("Dog"),
    quantity: 1,
    serviceSubtotalCents: 1,
    clientFeeCents: 1,
    sitterPayoutCents: 1,
  });
  assert.equal(result.sitterCompensationSubtotalCents, 2500);
  assert.equal(
    db.calls.some(({ model }) =>
      ["DefaultSitterCareRate", "SitterCareRate"].includes(model),
    ),
    false,
  );
});

test("server wrapper input mapping preserves the authoritative database boundary", () => {
  const fakeDb = { source: "caller" };
  const authoritativeDb = { source: "repository" };
  const resolverInput = buildSitterOriginatedCompensationResolverInput(
    {
      db: fakeDb,
      careOptionCode: "DROP_IN_DOG_30",
      sitterId: sitter.id,
      pets: pets("Dog"),
      quantity: 1,
      serviceSubtotalCents: 1,
      clientFeeCents: 1,
      clientTotalCents: 1,
      sitterFeeCents: 1,
      sitterPayoutCents: 1,
      compensationLane: "BUSINESS_ASSIGNED",
    },
    authoritativeDb,
  );

  assert.deepEqual(Object.keys(resolverInput).sort(), [
    "careOptionCode",
    "db",
    "pets",
    "quantity",
    "sitterId",
  ]);
  assert.equal(resolverInput.db, authoritativeDb);
  assert.equal(resolverInput.careOptionCode, "DROP_IN_DOG_30");
  assert.equal(resolverInput.sitterId, sitter.id);
  assert.deepEqual(resolverInput.pets, pets("Dog"));
  assert.equal(resolverInput.quantity, 1);
});

test("breakdown is deterministic and scales each canonical service component", () => {
  const result = calculateSitterOriginatedCompensation({
    canonicalClientQuote: calculateCanonicalClientQuote({
      careOption: makeCareOption("DROP_IN_DOG_30"),
      pets: [
        { name: "Milo", species: "Dog" },
        { name: "Luna", species: "Dog" },
      ],
    }),
    sitterId: sitter.id,
    quantity: 2,
    compensationLane: SITTER_ORIGINATED_COMPENSATION_LANE,
  });
  assert.deepEqual(result.breakdown, [
    {
      type: "CLIENT_SERVICE_COMPENSATION",
      sourceType: "BASE_CARE",
      label: "Dog drop-in · 30 minutes",
      unitAmountCents: 2500,
      quantity: 2,
      totalAmountCents: 5000,
    },
    {
      type: "CLIENT_SERVICE_COMPENSATION",
      sourceType: "ADDITIONAL_PET",
      label: "Luna · Dog",
      petIndex: 1,
      petName: "Luna",
      species: "Dog",
      speciesOrdinal: 2,
      thresholdIncludedCount: 1,
      unitAmountCents: 500,
      quantity: 2,
      totalAmountCents: 1000,
    },
  ]);
});

test("quantity overflow is rejected before monetary calculation", () => {
  assertCode(
    () =>
      compensate("DROP_IN_DOG_30", pets("Dog"), Number.MAX_SAFE_INTEGER),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.MONEY_OVERFLOW,
  );
});

test("compensation lane is fixed to SITTER_ORIGINATED", () => {
  const result = compensate("DROP_IN_DOG_30", pets("Dog"));
  assert.equal(result.compensationLane, "SITTER_ORIGINATED");
  assertCode(
    () =>
      compensate("DROP_IN_DOG_30", pets("Dog"), 1, {
        compensationLane: "BUSINESS_ASSIGNED",
      }),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_COMPENSATION_LANE,
  );
});

test("currency mismatch is rejected", () => {
  assertCode(
    () =>
      compensate("DROP_IN_DOG_30", pets("Dog"), 1, {
        expectedCurrency: "CAD",
      }),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CURRENCY_MISMATCH,
  );
});

test("resolver rejects a missing care option", async () => {
  await assertRejectsCode(
    () =>
      quoteSitterOriginatedCompensationWithDb({
        db: makeDb(),
        careOptionCode: "MISSING",
        sitterId: sitter.id,
        pets: pets("Dog"),
        quantity: 1,
      }),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CARE_OPTION_NOT_FOUND,
  );
});

test("resolver maps canonical household rejection without leaking internals", async () => {
  const careOption = makeCareOption("DOG_WALK_15");
  await assertRejectsCode(
    () =>
      quoteSitterOriginatedCompensationWithDb({
        db: makeDb({ careOption }),
        careOptionCode: careOption.code,
        sitterId: sitter.id,
        pets: pets("Dog", "Dog"),
        quantity: 1,
      }),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CANONICAL_QUOTE_UNAVAILABLE,
  );
});

test("resolver rejects an invalid sitter before quoting", async () => {
  await assertRejectsCode(
    () =>
      quoteSitterOriginatedCompensationWithDb({
        db: makeDb({
          sitterRow: { id: sitter.id, role: "OPERATOR" },
          careOption: makeCareOption("DROP_IN_DOG_30"),
        }),
        careOptionCode: "DROP_IN_DOG_30",
        sitterId: sitter.id,
        pets: pets("Dog"),
        quantity: 1,
      }),
    SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_SITTER,
  );
});
