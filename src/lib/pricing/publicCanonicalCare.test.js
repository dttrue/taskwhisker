import assert from "node:assert/strict";
import test from "node:test";

import {
  PublicCanonicalCareError,
  buildPublicCanonicalCareCatalog,
  toPublicCanonicalQuote,
  translatePublicQuoteError,
} from "./publicCanonicalCare.js";
import {
  CanonicalClientQuoteError,
  calculateCanonicalClientQuote,
} from "./calculateCanonicalClientQuote.js";

const dogPolicy = {
  species: "Dog",
  isSupported: true,
  minimumCount: 0,
  maximumCount: null,
};
const catPolicy = {
  species: "Cat",
  isSupported: true,
  minimumCount: 0,
  maximumCount: null,
};

const OFFERINGS = {
  DROP_IN: {
    code: "DROP_IN",
    name: "Drop-In Visit",
    description: "Scheduled in-home check-ins.",
    billingUnit: "VISIT",
    scheduleKind: "TIMED_VISIT",
    allowsMixedSpecies: false,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: null,
    isActive: true,
    sortOrder: 10,
    speciesPolicies: [{ ...dogPolicy, maximumCount: 2 }, catPolicy],
  },
  DOG_WALK: {
    code: "DOG_WALK",
    name: "Dog Walk",
    description: "Scheduled neighborhood walks.",
    billingUnit: "VISIT",
    scheduleKind: "TIMED_VISIT",
    allowsMixedSpecies: false,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: 1,
    isActive: true,
    sortOrder: 20,
    speciesPolicies: [{ ...dogPolicy, minimumCount: 1, maximumCount: 1 }],
  },
  OVERNIGHT: {
    code: "OVERNIGHT",
    name: "Overnight Care",
    description: "In-home overnight care.",
    billingUnit: "NIGHT",
    scheduleKind: "OVERNIGHT_STAY",
    allowsMixedSpecies: true,
    allowsUnlistedSpecies: false,
    minimumPetCount: 1,
    maximumPetCount: null,
    isActive: true,
    sortOrder: 30,
    speciesPolicies: [dogPolicy, catPolicy],
  },
};

function option({
  offering,
  code,
  label,
  primarySpecies,
  durationMinutes,
  sortOrder,
  baseRateCents,
  charges = [],
  isActive = true,
  rateActive = true,
}) {
  return {
    code,
    label,
    primarySpecies,
    durationMinutes,
    isActive,
    sortOrder,
    offering,
    clientRate: {
      id: `internal-rate-${code}`,
      currency: "USD",
      baseRateCents,
      includedPetCount: 1,
      defaultAdditionalCents: null,
      version: 1,
      isActive: rateActive,
      setByUserId: "internal-operator-id",
      petCharges: charges.map(([species, includedCount, additionalCents]) => ({
        species,
        includedCount,
        additionalCents,
      })),
    },
    internalAuditField: "not-public",
  };
}

function makeCatalogOptions() {
  return [
    option({ offering: OFFERINGS.DROP_IN, code: "DROP_IN_DOG_15", label: "Dog drop-in · 15 minutes", primarySpecies: "Dog", durationMinutes: 15, sortOrder: 10, baseRateCents: 2000, charges: [["Dog", 1, 200]] }),
    option({ offering: OFFERINGS.DROP_IN, code: "DROP_IN_DOG_30", label: "Dog drop-in · 30 minutes", primarySpecies: "Dog", durationMinutes: 30, sortOrder: 20, baseRateCents: 2500, charges: [["Dog", 1, 500]] }),
    option({ offering: OFFERINGS.DROP_IN, code: "DROP_IN_DOG_60", label: "Dog drop-in · 60 minutes", primarySpecies: "Dog", durationMinutes: 60, sortOrder: 30, baseRateCents: 3000, charges: [["Dog", 1, 500]] }),
    option({ offering: OFFERINGS.DROP_IN, code: "DROP_IN_CAT_15", label: "Cat drop-in · 15 minutes", primarySpecies: "Cat", durationMinutes: 15, sortOrder: 40, baseRateCents: 1000, charges: [["Cat", 1, 1000], ["Cat", 2, 300]] }),
    option({ offering: OFFERINGS.DROP_IN, code: "DROP_IN_CAT_30", label: "Cat drop-in · 30 minutes", primarySpecies: "Cat", durationMinutes: 30, sortOrder: 50, baseRateCents: 2000, charges: [["Cat", 1, 200], ["Cat", 2, 300]] }),
    option({ offering: OFFERINGS.DROP_IN, code: "DROP_IN_CAT_60", label: "Cat drop-in · 60 minutes", primarySpecies: "Cat", durationMinutes: 60, sortOrder: 60, baseRateCents: 2500, charges: [["Cat", 1, 300]] }),
    option({ offering: OFFERINGS.DOG_WALK, code: "DOG_WALK_15", label: "15 minutes", primarySpecies: "Dog", durationMinutes: 15, sortOrder: 10, baseRateCents: 1500 }),
    option({ offering: OFFERINGS.DOG_WALK, code: "DOG_WALK_30", label: "30 minutes", primarySpecies: "Dog", durationMinutes: 30, sortOrder: 20, baseRateCents: 2200 }),
    option({ offering: OFFERINGS.DOG_WALK, code: "DOG_WALK_60", label: "60 minutes", primarySpecies: "Dog", durationMinutes: 60, sortOrder: 30, baseRateCents: 3000 }),
    option({ offering: OFFERINGS.OVERNIGHT, code: "OVERNIGHT_DOG_HOME", label: "Dog household", primarySpecies: "Dog", durationMinutes: null, sortOrder: 10, baseRateCents: 6000, charges: [["Dog", 1, 2000], ["Cat", 0, 800]] }),
    option({ offering: OFFERINGS.OVERNIGHT, code: "OVERNIGHT_CAT_HOME", label: "Cat household", primarySpecies: "Cat", durationMinutes: null, sortOrder: 20, baseRateCents: 4200, charges: [["Cat", 1, 800]] }),
  ];
}

function pet(name, species) {
  return { name, species };
}

function summarize(result) {
  return Object.fromEntries(
    result.offerings.map((offering) => [
      offering.code,
      offering.options.map((careOption) => careOption.code),
    ]),
  );
}

const HOUSEHOLDS = [
  [
    "one Dog",
    [pet("Milo", "Dog")],
    {
      DROP_IN: ["DROP_IN_DOG_15", "DROP_IN_DOG_30", "DROP_IN_DOG_60"],
      DOG_WALK: ["DOG_WALK_15", "DOG_WALK_30", "DOG_WALK_60"],
      OVERNIGHT: ["OVERNIGHT_DOG_HOME"],
    },
  ],
  [
    "two Dogs",
    [pet("Milo", "Dog"), pet("Luna", "Dog")],
    {
      DROP_IN: ["DROP_IN_DOG_15", "DROP_IN_DOG_30", "DROP_IN_DOG_60"],
      OVERNIGHT: ["OVERNIGHT_DOG_HOME"],
    },
  ],
  [
    "one Cat",
    [pet("Milo", "Cat")],
    {
      DROP_IN: ["DROP_IN_CAT_15", "DROP_IN_CAT_30", "DROP_IN_CAT_60"],
      OVERNIGHT: ["OVERNIGHT_CAT_HOME"],
    },
  ],
  [
    "two Cats",
    [pet("Milo", "Cat"), pet("Luna", "Cat")],
    {
      DROP_IN: ["DROP_IN_CAT_15", "DROP_IN_CAT_30", "DROP_IN_CAT_60"],
      OVERNIGHT: ["OVERNIGHT_CAT_HOME"],
    },
  ],
  [
    "Dog and Cat",
    [pet("Milo", "Dog"), pet("Luna", "Cat")],
    { OVERNIGHT: ["OVERNIGHT_DOG_HOME"] },
  ],
];

for (const [name, pets, expected] of HOUSEHOLDS) {
  test(`returns eligible care for ${name}`, () => {
    const result = buildPublicCanonicalCareCatalog({
      careOptions: makeCatalogOptions().reverse(),
      pets,
    });
    assert.deepEqual(summarize(result), expected);
  });
}

test("returns no options for Rabbit or Dog plus unsupported species", () => {
  for (const pets of [
    [pet("Bun", "Rabbit")],
    [pet("Milo", "Dog"), pet("Bun", "Rabbit")],
  ]) {
    assert.throws(
      () => buildPublicCanonicalCareCatalog({ careOptions: makeCatalogOptions(), pets }),
      (error) => error.code === "NO_ELIGIBLE_CARE_OPTIONS",
    );
  }
});

test("returns public DTOs without internal rate, setter, audit, or sitter data", () => {
  const result = buildPublicCanonicalCareCatalog({
    careOptions: makeCatalogOptions(),
    pets: [pet("Milo", "Dog")],
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("internal-rate"), false);
  assert.equal(serialized.includes("internal-operator"), false);
  assert.equal(serialized.includes("internalAuditField"), false);
  assert.equal(serialized.includes("sitter"), false);
  assert.deepEqual(result.offerings[0].options[1], {
    code: "DROP_IN_DOG_30",
    label: "Dog drop-in · 30 minutes",
    displayLabel: "30 minutes",
    primarySpecies: "Dog",
    durationMinutes: 30,
    quote: {
      currency: "USD",
      serviceSubtotalCents: 2500,
      clientFeeCents: 250,
      clientTotalCents: 2750,
    },
  });
});

test("excludes inactive options and offerings", () => {
  let options = makeCatalogOptions();
  options[0] = { ...options[0], isActive: false };
  options = options.map((careOption) =>
    careOption.offering.code === "DOG_WALK"
      ? {
          ...careOption,
          offering: { ...careOption.offering, isActive: false },
        }
      : careOption,
  );
  const result = buildPublicCanonicalCareCatalog({
    careOptions: options,
    pets: [pet("Milo", "Dog")],
  });
  const summary = summarize(result);
  assert.equal(summary.DROP_IN.includes("DROP_IN_DOG_15"), false);
  assert.equal("DOG_WALK" in summary, false);
});

test("surfaces active catalog configuration errors", () => {
  const options = makeCatalogOptions();
  options[0] = { ...options[0], clientRate: { ...options[0].clientRate, isActive: false } };
  assert.throws(
    () => buildPublicCanonicalCareCatalog({
      careOptions: options,
      pets: [pet("Milo", "Dog")],
    }),
    (error) =>
      error instanceof PublicCanonicalCareError &&
      error.code === "CATALOG_CONFIGURATION_ERROR",
  );
});

test("surfaces missing primary-species pricing as catalog configuration drift", () => {
  const options = makeCatalogOptions();
  const dogOptionIndex = options.findIndex(
    ({ code }) => code === "DROP_IN_DOG_30",
  );
  options[dogOptionIndex] = {
    ...options[dogOptionIndex],
    clientRate: {
      ...options[dogOptionIndex].clientRate,
      petCharges: [],
    },
  };
  assert.throws(
    () =>
      buildPublicCanonicalCareCatalog({
        careOptions: options,
        pets: [pet("Milo", "Dog"), pet("Luna", "Dog")],
      }),
    (error) => error.code === "CATALOG_CONFIGURATION_ERROR",
  );
});

test("rejects invalid pet input distinctly", () => {
  assert.throws(
    () => buildPublicCanonicalCareCatalog({ careOptions: makeCatalogOptions(), pets: [] }),
    (error) => error.code === "INVALID_PET_INPUT",
  );
});

test("rejects duplicate option codes instead of returning duplicate DTOs", () => {
  const options = makeCatalogOptions();
  options.push(options[0]);
  assert.throws(
    () => buildPublicCanonicalCareCatalog({
      careOptions: options,
      pets: [pet("Milo", "Dog")],
    }),
    (error) => error.code === "CATALOG_CONFIGURATION_ERROR",
  );
});

test("strips rate identity from explicit public quote DTOs", () => {
  const option = makeCatalogOptions().find(({ code }) => code === "OVERNIGHT_DOG_HOME");
  const catalog = buildPublicCanonicalCareCatalog({
    careOptions: [option],
    pets: [pet("Milo", "Dog"), pet("Luna", "Dog"), pet("Gary", "Cat")],
  });
  const publicQuote = toPublicCanonicalQuote({
    careOffering: {
      code: "OVERNIGHT",
      name: "Overnight Care",
      billingUnit: "NIGHT",
      scheduleKind: "OVERNIGHT_STAY",
    },
    careOption: {
      code: option.code,
      label: option.label,
      primarySpecies: option.primarySpecies,
      durationMinutes: option.durationMinutes,
    },
    pets: catalog.pets,
    quantity: 1,
    currency: "USD",
    rate: { id: "private-rate", version: 99 },
    clientFeeBasisPoints: 1000,
    serviceSubtotalCents: 8800,
    clientFeeCents: 880,
    clientTotalCents: 9680,
    breakdown: [{ type: "BASE_CARE", amountCents: 6000 }],
  });
  assert.equal("rate" in publicQuote, false);
  assert.equal(JSON.stringify(publicQuote).includes("private-rate"), false);
  assert.deepEqual(
    [publicQuote.serviceSubtotalCents, publicQuote.clientFeeCents, publicQuote.clientTotalCents],
    [8800, 880, 9680],
  );
});

test("translates expected quote failures into stable public outcomes", () => {
  for (const [internalCode, publicCode] of [
    ["INVALID_PETS", "INVALID_PET_INPUT"],
    ["PRIMARY_SPECIES_REQUIRED", "OPTION_NOT_ELIGIBLE"],
    ["OPTION_NOT_FOUND", "OPTION_NOT_FOUND_OR_INACTIVE"],
    ["INACTIVE_OPTION", "OPTION_NOT_FOUND_OR_INACTIVE"],
    ["INACTIVE_RATE", "CATALOG_CONFIGURATION_ERROR"],
  ]) {
    assert.equal(
      translatePublicQuoteError(
        new CanonicalClientQuoteError(internalCode, "internal detail"),
      ).code,
      publicCode,
    );
  }
  assert.equal(
    translatePublicQuoteError(new Error("database detail")).code,
    "UNEXPECTED_SERVER_ERROR",
  );
});

test("distinguishes unpriced package incompatibility from broken pricing", () => {
  const catOvernight = makeCatalogOptions().find(
    ({ code }) => code === "OVERNIGHT_CAT_HOME",
  );
  const brokenDogOption = makeCatalogOptions().find(
    ({ code }) => code === "DROP_IN_DOG_30",
  );
  brokenDogOption.clientRate = {
    ...brokenDogOption.clientRate,
    petCharges: [],
  };

  for (const [careOption, pets, expectedCode] of [
    [
      catOvernight,
      [pet("Milo", "Cat"), pet("Scout", "Dog")],
      "OPTION_NOT_ELIGIBLE",
    ],
    [
      brokenDogOption,
      [pet("Milo", "Dog"), pet("Luna", "Dog")],
      "CATALOG_CONFIGURATION_ERROR",
    ],
  ]) {
    let internalError;
    try {
      calculateCanonicalClientQuote({ careOption, pets });
    } catch (error) {
      internalError = error;
    }
    assert.equal(internalError?.code, "MISSING_PET_PRICE");
    assert.equal(translatePublicQuoteError(internalError).code, expectedCode);
  }
});
