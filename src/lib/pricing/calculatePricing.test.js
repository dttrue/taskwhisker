import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateClientEconomics,
  calculatePercentageFeeCents,
  calculatePlatformRevenueCents,
  calculateSitterEconomics,
} from "./calculatePricing.js";

test("calculates client economics independently", () => {
  assert.deepEqual(calculateClientEconomics(3000), {
    serviceSubtotalCents: 3000,
    clientFeeCents: 300,
    clientTotalCents: 3300,
  });
});

test("calculates sitter economics independently", () => {
  assert.deepEqual(calculateSitterEconomics(2600), {
    sitterCompensationSubtotalCents: 2600,
    sitterFeeCents: 260,
    sitterPayoutCents: 2340,
  });
});

test("combines independent fees into platform revenue", () => {
  assert.equal(calculatePlatformRevenueCents(300, 260), 560);
});

test("handles zero amounts", () => {
  assert.equal(calculatePercentageFeeCents(0, 1000), 0);
  assert.deepEqual(calculateClientEconomics(0), {
    serviceSubtotalCents: 0,
    clientFeeCents: 0,
    clientTotalCents: 0,
  });
  assert.deepEqual(calculateSitterEconomics(0), {
    sitterCompensationSubtotalCents: 0,
    sitterFeeCents: 0,
    sitterPayoutCents: 0,
  });
});

test("rounds half up once at the fee boundary", () => {
  assert.equal(calculatePercentageFeeCents(5, 1000), 1);
});

test("handles values immediately below and above a rounding boundary", () => {
  assert.equal(calculatePercentageFeeCents(4, 1000), 0);
  assert.equal(calculatePercentageFeeCents(6, 1000), 1);
});

test("calculates an odd-cent subtotal", () => {
  assert.deepEqual(calculateClientEconomics(1999), {
    serviceSubtotalCents: 1999,
    clientFeeCents: 200,
    clientTotalCents: 2199,
  });
});

test("rejects negative amounts", () => {
  assert.throws(() => calculateClientEconomics(-1), RangeError);
});

test("rejects non-integer and non-finite amounts", () => {
  assert.throws(() => calculateSitterEconomics(10.5), RangeError);
  assert.throws(() => calculateSitterEconomics(Number.NaN), RangeError);
  assert.throws(() => calculateSitterEconomics(Number.POSITIVE_INFINITY), RangeError);
});

test("rejects invalid basis points", () => {
  assert.throws(() => calculatePercentageFeeCents(100, -1), RangeError);
  assert.throws(() => calculatePercentageFeeCents(100, 1000.5), RangeError);
  assert.throws(() => calculatePercentageFeeCents(100, 10_001), RangeError);
});

test("rejects results outside Prisma Int monetary storage", () => {
  assert.throws(() => calculateClientEconomics(2_147_483_647), RangeError);
  assert.throws(
    () => calculatePlatformRevenueCents(2_147_483_647, 1),
    RangeError,
  );
});
