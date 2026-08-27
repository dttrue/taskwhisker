import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessAssignedSitterCompensationError,
  calculateBusinessAssignedSitterCompensation,
  selectBusinessAssignedSitterRate,
  validateBusinessAssignedSitter,
} from "./calculateBusinessAssignedSitterCompensation.js";

const sitterId = "sitter-1";

function pets(species, count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${species} ${index + 1}`,
    species,
  }));
}

function makeCareOption(overrides = {}) {
  return {
    id: "option-1",
    code: "DROP_IN_DOG_30",
    label: "Dog drop-in · 30 minutes",
    primarySpecies: "Dog",
    isActive: true,
    ...overrides,
    clientRate: {
      id: "client-rate-1",
      currency: "USD",
      baseRateCents: 10_000,
      isActive: true,
      ...overrides.clientRate,
    },
  };
}

function makeRate(overrides = {}) {
  return {
    id: "sitter-rate-1",
    currency: "USD",
    baseCompensationCents: 5000,
    includedPetCount: 1,
    defaultAdditionalCents: null,
    version: 1,
    isActive: true,
    petCharges: [],
    ...overrides,
  };
}

function calculate(overrides = {}) {
  return calculateBusinessAssignedSitterCompensation({
    careOption: makeCareOption(),
    rate: makeRate(),
    rateSource: "DEFAULT_RATE",
    sitterId,
    pets: pets("Dog", 1),
    quantity: 1,
    ...overrides,
  });
}

function assertCode(run, code) {
  assert.throws(run, (error) => {
    assert(error instanceof BusinessAssignedSitterCompensationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("default rate resolves when no sitter override exists", () => {
  const defaultRate = makeRate({ id: "default-rate" });
  assert.deepEqual(
    selectBusinessAssignedSitterRate({ sitterRate: null, defaultRate }),
    { rate: defaultRate, rateSource: "DEFAULT_RATE" },
  );
});

test("active sitter-specific override wins", () => {
  const sitterRate = makeRate({ id: "override" });
  const defaultRate = makeRate({ id: "default" });
  assert.deepEqual(
    selectBusinessAssignedSitterRate({ sitterRate, defaultRate }),
    { rate: sitterRate, rateSource: "SITTER_OVERRIDE" },
  );
});

test("inactive override falls back to active default", () => {
  const sitterRate = makeRate({ id: "override", isActive: false });
  const defaultRate = makeRate({ id: "default" });
  assert.deepEqual(
    selectBusinessAssignedSitterRate({ sitterRate, defaultRate }),
    { rate: defaultRate, rateSource: "DEFAULT_RATE" },
  );
});

test("missing override and default fails safely", () => {
  assertCode(
    () => selectBusinessAssignedSitterRate({ sitterRate: null, defaultRate: null }),
    "NO_COMPENSATION_RATE",
  );
});

test("base exactly at the 90 percent ceiling is accepted", () => {
  const quote = calculate({ rate: makeRate({ baseCompensationCents: 9000 }) });
  assert.equal(quote.maximumBaseCompensationCents, 9000);
  assert.equal(quote.unitCompensationCents, 9000);
});

test("base above the 90 percent ceiling is rejected", () => {
  assertCode(
    () => calculate({ rate: makeRate({ baseCompensationCents: 9001 }) }),
    "COMPENSATION_CEILING_EXCEEDED",
  );
});

test("one pet and one visit produces base compensation", () => {
  const quote = calculate();
  assert.deepEqual(
    [quote.unitCompensationCents, quote.sitterFeeCents, quote.sitterPayoutCents],
    [5000, 500, 4500],
  );
});

test("additional pet uses the greatest applicable species threshold", () => {
  const rate = makeRate({
    petCharges: [
      { species: "Dog", includedCount: 0, additionalCents: 100 },
      { species: "Dog", includedCount: 1, additionalCents: 700 },
    ],
  });
  assert.equal(
    calculate({ rate, pets: pets("Dog", 2) }).unitCompensationCents,
    5700,
  );
});

test("multiple pet thresholds are applied deterministically", () => {
  const rate = makeRate({
    petCharges: [
      { species: "Dog", includedCount: 1, additionalCents: 700 },
      { species: "Dog", includedCount: 2, additionalCents: 300 },
    ],
  });
  assert.equal(
    calculate({ rate, pets: pets("Dog", 3) }).unitCompensationCents,
    6000,
  );
});

test("default additional compensation is used as fallback", () => {
  const rate = makeRate({ defaultAdditionalCents: 250 });
  assert.equal(
    calculate({ rate, pets: pets("Dog", 2) }).unitCompensationCents,
    5250,
  );
});

test("missing required pet compensation fails", () => {
  assertCode(
    () => calculate({ pets: pets("Dog", 2) }),
    "INCOMPLETE_PET_COMPENSATION",
  );
});

test("quantity three multiplies the entire unit compensation", () => {
  const quote = calculate({ quantity: 3 });
  assert.equal(quote.sitterCompensationSubtotalCents, 15_000);
});

test("overnight quantity greater than one uses the same billable-unit rule", () => {
  const careOption = makeCareOption({
    code: "OVERNIGHT_DOG_HOME",
    label: "Dog household",
  });
  const quote = calculate({ careOption, quantity: 2 });
  assert.equal(quote.sitterCompensationSubtotalCents, 10_000);
});

test("the sitter fee is applied once to the aggregate subtotal", () => {
  const quote = calculate({
    rate: makeRate({ baseCompensationCents: 1001 }),
    quantity: 3,
  });
  assert.deepEqual(
    [quote.sitterCompensationSubtotalCents, quote.sitterFeeCents],
    [3003, 300],
  );
});

test("odd-cent aggregate subtotal uses shared half-up fee rounding", () => {
  const quote = calculate({ rate: makeRate({ baseCompensationCents: 1005 }) });
  assert.deepEqual([quote.sitterFeeCents, quote.sitterPayoutCents], [101, 904]);
});

test("sitter override never borrows default pet-charge rules", () => {
  const override = makeRate({ id: "override", petCharges: [] });
  const defaultRate = makeRate({
    id: "default",
    petCharges: [
      { species: "Dog", includedCount: 1, additionalCents: 700 },
    ],
  });
  const selected = selectBusinessAssignedSitterRate({
    sitterRate: override,
    defaultRate,
  });
  assertCode(
    () => calculate({ ...selected, pets: pets("Dog", 2) }),
    "INCOMPLETE_PET_COMPENSATION",
  );
});

test("invalid sitter role is rejected", () => {
  assertCode(
    () => validateBusinessAssignedSitter({ id: sitterId, role: "OPERATOR" }, sitterId),
    "INVALID_SITTER",
  );
});

test("currency mismatch is rejected", () => {
  assertCode(
    () => calculate({ rate: makeRate({ currency: "CAD" }) }),
    "CURRENCY_MISMATCH",
  );
});

test("breakdown is stable and separates base from additional pets", () => {
  const quote = calculate({
    rate: makeRate({
      petCharges: [
        { species: "Dog", includedCount: 1, additionalCents: 700 },
      ],
    }),
    pets: [
      { name: "Milo", species: "Dog" },
      { name: "Luna", species: "Dog" },
    ],
    quantity: 2,
  });
  assert.deepEqual(quote.breakdown, [
    {
      type: "BASE_COMPENSATION",
      label: "Dog drop-in · 30 minutes",
      unitAmountCents: 5000,
      quantity: 2,
      totalAmountCents: 10_000,
    },
    {
      type: "ADDITIONAL_PET_COMPENSATION",
      label: "Luna · Dog",
      petIndex: 1,
      petName: "Luna",
      species: "Dog",
      speciesOrdinal: 2,
      thresholdIncludedCount: 1,
      unitAmountCents: 700,
      quantity: 2,
      totalAmountCents: 1400,
    },
  ]);
});

test("client rate fields other than base ceiling and currency do not affect compensation", () => {
  const first = calculate();
  const second = calculate({
    careOption: makeCareOption({
      clientRate: {
        includedPetCount: 99,
        defaultAdditionalCents: 99_999,
        petCharges: [{ species: "Dog", includedCount: 0, additionalCents: 88_888 }],
      },
    }),
  });
  assert.deepEqual(
    [second.unitCompensationCents, second.sitterPayoutCents],
    [first.unitCompensationCents, first.sitterPayoutCents],
  );
});
