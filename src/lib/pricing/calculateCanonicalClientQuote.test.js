import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalClientQuoteError,
  calculateCanonicalClientQuote,
} from "./calculateCanonicalClientQuote.js";

const POLICY = {
  Dog: { species: "Dog", isSupported: true, minimumCount: 0, maximumCount: null },
  Cat: { species: "Cat", isSupported: true, minimumCount: 0, maximumCount: null },
};

function makeOption({
  code,
  primarySpecies,
  baseRateCents,
  petCharges = [],
  policies = [POLICY[primarySpecies]],
  allowsMixedSpecies = false,
  minimumPetCount = 1,
  maximumPetCount = null,
  includedPetCount = 1,
  defaultAdditionalCents = null,
  optionActive = true,
  offeringActive = true,
  rateActive = true,
}) {
  return {
    id: `option-${code}`,
    code,
    label: code,
    primarySpecies,
    durationMinutes: 30,
    isActive: optionActive,
    offering: {
      id: `offering-${code}`,
      code: `OFFERING_${code}`,
      name: "Care offering",
      billingUnit: "VISIT",
      scheduleKind: "TIMED_VISIT",
      allowsMixedSpecies,
      allowsUnlistedSpecies: false,
      minimumPetCount,
      maximumPetCount,
      isActive: offeringActive,
      speciesPolicies: policies,
    },
    clientRate: {
      id: `rate-${code}`,
      currency: "USD",
      baseRateCents,
      includedPetCount,
      defaultAdditionalCents,
      version: 1,
      isActive: rateActive,
      petCharges: petCharges.map(
        ([species, threshold, amountCents], index) => ({
          id: `charge-${code}-${index}`,
          species,
          includedCount: threshold,
          additionalCents: amountCents,
        }),
      ),
    },
  };
}

function pets(species, count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${species} ${index + 1}`,
    species,
  }));
}

const OPTIONS = {
  DOG_15: makeOption({
    code: "DROP_IN_DOG_15",
    primarySpecies: "Dog",
    baseRateCents: 2000,
    petCharges: [["Dog", 1, 200]],
    policies: [{ ...POLICY.Dog, maximumCount: 2 }],
  }),
  DOG_30: makeOption({
    code: "DROP_IN_DOG_30",
    primarySpecies: "Dog",
    baseRateCents: 2500,
    petCharges: [["Dog", 1, 500]],
    policies: [{ ...POLICY.Dog, maximumCount: 2 }],
  }),
  DOG_60: makeOption({
    code: "DROP_IN_DOG_60",
    primarySpecies: "Dog",
    baseRateCents: 3000,
    petCharges: [["Dog", 1, 500]],
    policies: [{ ...POLICY.Dog, maximumCount: 2 }],
  }),
  CAT_15: makeOption({
    code: "DROP_IN_CAT_15",
    primarySpecies: "Cat",
    baseRateCents: 2000,
    petCharges: [["Cat", 1, 300]],
  }),
  CAT_30: makeOption({
    code: "DROP_IN_CAT_30",
    primarySpecies: "Cat",
    baseRateCents: 2500,
    petCharges: [["Cat", 1, 300]],
  }),
  CAT_60: makeOption({
    code: "DROP_IN_CAT_60",
    primarySpecies: "Cat",
    baseRateCents: 3000,
    petCharges: [["Cat", 1, 300]],
  }),
  WALK_15: makeOption({
    code: "DOG_WALK_15",
    primarySpecies: "Dog",
    baseRateCents: 2200,
    policies: [{ ...POLICY.Dog, minimumCount: 1, maximumCount: 1 }],
    maximumPetCount: 1,
  }),
  WALK_30: makeOption({
    code: "DOG_WALK_30",
    primarySpecies: "Dog",
    baseRateCents: 2200,
    policies: [{ ...POLICY.Dog, minimumCount: 1, maximumCount: 1 }],
    maximumPetCount: 1,
  }),
  WALK_60: makeOption({
    code: "DOG_WALK_60",
    primarySpecies: "Dog",
    baseRateCents: 3000,
    policies: [{ ...POLICY.Dog, minimumCount: 1, maximumCount: 1 }],
    maximumPetCount: 1,
  }),
  DOG_OVERNIGHT: makeOption({
    code: "OVERNIGHT_DOG_HOME",
    primarySpecies: "Dog",
    baseRateCents: 6000,
    petCharges: [["Dog", 1, 2000], ["Cat", 0, 800]],
    policies: [POLICY.Dog, POLICY.Cat],
    allowsMixedSpecies: true,
  }),
  CAT_OVERNIGHT: makeOption({
    code: "OVERNIGHT_CAT_HOME",
    primarySpecies: "Cat",
    baseRateCents: 4200,
    petCharges: [["Cat", 1, 800]],
    policies: [POLICY.Dog, POLICY.Cat],
    allowsMixedSpecies: true,
  }),
};

const PARITY_CASES = [
  ["Dog Drop-In 15 · one", OPTIONS.DOG_15, pets("Dog", 1), 2000],
  ["Dog Drop-In 15 · two", OPTIONS.DOG_15, pets("Dog", 2), 2200],
  ["Dog Drop-In 30 · one", OPTIONS.DOG_30, pets("Dog", 1), 2500],
  ["Dog Drop-In 30 · two", OPTIONS.DOG_30, pets("Dog", 2), 3000],
  ["Dog Drop-In 60 · one", OPTIONS.DOG_60, pets("Dog", 1), 3000],
  ["Dog Drop-In 60 · two", OPTIONS.DOG_60, pets("Dog", 2), 3500],
  ["Cat Drop-In 15 · one", OPTIONS.CAT_15, pets("Cat", 1), 2000],
  ["Cat Drop-In 15 · two", OPTIONS.CAT_15, pets("Cat", 2), 2300],
  ["Cat Drop-In 15 · three", OPTIONS.CAT_15, pets("Cat", 3), 2600],
  ["Cat Drop-In 15 · four", OPTIONS.CAT_15, pets("Cat", 4), 2900],
  ["Cat Drop-In 30 · one", OPTIONS.CAT_30, pets("Cat", 1), 2500],
  ["Cat Drop-In 30 · two", OPTIONS.CAT_30, pets("Cat", 2), 2800],
  ["Cat Drop-In 30 · three", OPTIONS.CAT_30, pets("Cat", 3), 3100],
  ["Cat Drop-In 30 · four", OPTIONS.CAT_30, pets("Cat", 4), 3400],
  ["Cat Drop-In 60 · one", OPTIONS.CAT_60, pets("Cat", 1), 3000],
  ["Cat Drop-In 60 · two", OPTIONS.CAT_60, pets("Cat", 2), 3300],
  ["Cat Drop-In 60 · three", OPTIONS.CAT_60, pets("Cat", 3), 3600],
  ["Cat Drop-In 60 · four", OPTIONS.CAT_60, pets("Cat", 4), 3900],
  ["Dog Walk 15", OPTIONS.WALK_15, pets("Dog", 1), 2200],
  ["Dog Walk 30", OPTIONS.WALK_30, pets("Dog", 1), 2200],
  ["Dog Walk 60", OPTIONS.WALK_60, pets("Dog", 1), 3000],
  ["Dog Overnight · one Dog", OPTIONS.DOG_OVERNIGHT, pets("Dog", 1), 6000],
  ["Dog Overnight · two Dogs", OPTIONS.DOG_OVERNIGHT, pets("Dog", 2), 8000],
  [
    "Dog Overnight · Dog and Cat",
    OPTIONS.DOG_OVERNIGHT,
    [...pets("Dog", 1), ...pets("Cat", 1)],
    6800,
  ],
  [
    "Dog Overnight · two Dogs and Cat",
    OPTIONS.DOG_OVERNIGHT,
    [...pets("Dog", 2), ...pets("Cat", 1)],
    8800,
  ],
  ["Cat Overnight · one", OPTIONS.CAT_OVERNIGHT, pets("Cat", 1), 4200],
  ["Cat Overnight · two", OPTIONS.CAT_OVERNIGHT, pets("Cat", 2), 5000],
];

for (const [name, careOption, quotePets, expectedSubtotal] of PARITY_CASES) {
  test(name, () => {
    const quote = calculateCanonicalClientQuote({ careOption, pets: quotePets });
    assert.equal(quote.serviceSubtotalCents, expectedSubtotal);
  });
}

test("applies the 10% client fee to representative subtotals", () => {
  const oneDog = calculateCanonicalClientQuote({
    careOption: OPTIONS.DOG_30,
    pets: pets("Dog", 1),
  });
  const twoDogs = calculateCanonicalClientQuote({
    careOption: OPTIONS.DOG_30,
    pets: pets("Dog", 2),
  });
  const overnight = calculateCanonicalClientQuote({
    careOption: OPTIONS.DOG_OVERNIGHT,
    pets: [...pets("Dog", 2), ...pets("Cat", 1)],
  });
  assert.deepEqual(
    [oneDog.clientFeeCents, oneDog.clientTotalCents],
    [250, 2750],
  );
  assert.deepEqual(
    [twoDogs.clientFeeCents, twoDogs.clientTotalCents],
    [300, 3300],
  );
  assert.deepEqual(
    [overnight.clientFeeCents, overnight.clientTotalCents],
    [880, 9680],
  );
});

test("applies the preview fee to updated 15-minute client prices", () => {
  const oneCat = calculateCanonicalClientQuote({
    careOption: OPTIONS.CAT_15,
    pets: pets("Cat", 1),
  });
  const twoCats = calculateCanonicalClientQuote({
    careOption: OPTIONS.CAT_15,
    pets: pets("Cat", 2),
  });
  const dogWalk = calculateCanonicalClientQuote({
    careOption: OPTIONS.WALK_15,
    pets: pets("Dog", 1),
  });

  assert.deepEqual(
    [oneCat.serviceSubtotalCents, oneCat.clientFeeCents, oneCat.clientTotalCents],
    [2000, 200, 2200],
  );
  assert.deepEqual(
    [twoCats.serviceSubtotalCents, twoCats.clientFeeCents, twoCats.clientTotalCents],
    [2300, 230, 2530],
  );
  assert.deepEqual(
    [dogWalk.serviceSubtotalCents, dogWalk.clientFeeCents, dogWalk.clientTotalCents],
    [2200, 220, 2420],
  );
});

test("applies the preview fee to normalized Cat Drop-In prices", () => {
  for (const [careOption, expected] of [
    [OPTIONS.CAT_30, [[2500, 250, 2750], [2800, 280, 3080], [3100, 310, 3410], [3400, 340, 3740]]],
    [OPTIONS.CAT_60, [[3000, 300, 3300], [3300, 330, 3630], [3600, 360, 3960], [3900, 390, 4290]]],
  ]) {
    for (const [index, expectedQuote] of expected.entries()) {
      const quote = calculateCanonicalClientQuote({
        careOption,
        pets: pets("Cat", index + 1),
      });
      assert.deepEqual(
        [quote.serviceSubtotalCents, quote.clientFeeCents, quote.clientTotalCents],
        expectedQuote,
      );
    }
  }
});

function assertQuoteError(run, code) {
  assert.throws(run, (error) => {
    assert(error instanceof CanonicalClientQuoteError);
    assert.equal(error.code, code);
    return true;
  });
}

test("rejects a missing primary species", () => {
  assertQuoteError(
    () => calculateCanonicalClientQuote({ careOption: OPTIONS.DOG_30, pets: pets("Cat", 1) }),
    "PRIMARY_SPECIES_REQUIRED",
  );
});

test("rejects unsupported species", () => {
  const option = makeOption({
    code: "UNSUPPORTED_SPECIES",
    primarySpecies: "Dog",
    baseRateCents: 2000,
    policies: [POLICY.Dog],
    allowsMixedSpecies: true,
  });
  assertQuoteError(
    () => calculateCanonicalClientQuote({
      careOption: option,
      pets: [...pets("Dog", 1), ...pets("Rabbit", 1)],
    }),
    "UNSUPPORTED_SPECIES",
  );
});

test("rejects more than two dogs for Dog Drop-In", () => {
  assertQuoteError(
    () => calculateCanonicalClientQuote({ careOption: OPTIONS.DOG_30, pets: pets("Dog", 3) }),
    "SPECIES_MAXIMUM",
  );
});

test("rejects two-dog walks", () => {
  assertQuoteError(
    () => calculateCanonicalClientQuote({ careOption: OPTIONS.WALK_30, pets: pets("Dog", 2) }),
    "TOO_MANY_PETS",
  );
});

test("rejects mixed-species Drop-In quotes", () => {
  assertQuoteError(
    () => calculateCanonicalClientQuote({
      careOption: OPTIONS.DOG_30,
      pets: [...pets("Dog", 1), ...pets("Cat", 1)],
    }),
    "MIXED_SPECIES_NOT_ALLOWED",
  );
});

test("rejects Dogs from the Cat Overnight package without a Dog price rule", () => {
  assertQuoteError(
    () => calculateCanonicalClientQuote({
      careOption: OPTIONS.CAT_OVERNIGHT,
      pets: [...pets("Cat", 1), ...pets("Dog", 1)],
    }),
    "MISSING_PET_PRICE",
  );
});

test("rejects Cat-only use of the Dog Overnight package", () => {
  assertQuoteError(
    () => calculateCanonicalClientQuote({
      careOption: OPTIONS.DOG_OVERNIGHT,
      pets: pets("Cat", 1),
    }),
    "PRIMARY_SPECIES_REQUIRED",
  );
});

test("rejects an unpriced extra primary-species pet", () => {
  const option = makeOption({
    code: "NO_EXTRA_PRICE",
    primarySpecies: "Dog",
    baseRateCents: 2000,
  });
  assertQuoteError(
    () => calculateCanonicalClientQuote({ careOption: option, pets: pets("Dog", 2) }),
    "MISSING_PET_PRICE",
  );
});

test("rejects inactive option, offering, and rate configuration", () => {
  for (const [field, code] of [
    ["optionActive", "INACTIVE_OPTION"],
    ["offeringActive", "INACTIVE_OFFERING"],
    ["rateActive", "INACTIVE_RATE"],
  ]) {
    assertQuoteError(
      () => calculateCanonicalClientQuote({
        careOption: makeOption({
          code: field,
          primarySpecies: "Dog",
          baseRateCents: 1000,
          [field]: false,
        }),
        pets: pets("Dog", 1),
      }),
      code,
    );
  }
});

test("normalizes structured pets and rejects malformed input", () => {
  const quote = calculateCanonicalClientQuote({
    careOption: OPTIONS.DOG_30,
    pets: [{ name: "  Milo  ", species: "  Dog  " }],
  });
  assert.deepEqual(quote.pets, [{ name: "Milo", species: "Dog" }]);
  assertQuoteError(
    () => calculateCanonicalClientQuote({ careOption: OPTIONS.DOG_30, pets: null }),
    "INVALID_PETS",
  );
  assertQuoteError(
    () => calculateCanonicalClientQuote({ careOption: OPTIONS.DOG_30, pets: [] }),
    "INVALID_PET_COUNT",
  );
});

test("returns a deterministic additional-pet breakdown", () => {
  const quote = calculateCanonicalClientQuote({
    careOption: OPTIONS.DOG_OVERNIGHT,
    pets: [
      { name: "Milo", species: "Dog" },
      { name: "Luna", species: "Dog" },
      { name: "Gary", species: "Cat" },
    ],
  });
  assert.deepEqual(quote.breakdown, [
    {
      type: "BASE_CARE",
      label: "OVERNIGHT_DOG_HOME",
      quantity: 1,
      amountCents: 6000,
    },
    {
      type: "ADDITIONAL_PET",
      label: "Luna · Dog",
      petIndex: 1,
      petName: "Luna",
      species: "Dog",
      speciesOrdinal: 2,
      thresholdIncludedCount: 1,
      quantity: 1,
      amountCents: 2000,
    },
    {
      type: "ADDITIONAL_PET",
      label: "Gary · Cat",
      petIndex: 2,
      petName: "Gary",
      species: "Cat",
      speciesOrdinal: 1,
      thresholdIncludedCount: 0,
      quantity: 1,
      amountCents: 800,
    },
  ]);
});
