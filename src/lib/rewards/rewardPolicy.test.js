import assert from "node:assert/strict";
import test from "node:test";
import { SITTER_FEE_BPS } from "../pricing/calculatePricing.js";
import {
  STANDARD_SITTER_FEE_BPS, REWARD_SITTER_FEE_BPS, REWARD_MAX_USES,
  REWARD_DURATION_WEEKS, REWARD_DURATION_MS, getRewardProgressTarget,
  getRewardExpiry, inspectCurrentRewardGrant,
} from "./rewardPolicy.js";

for (const [level, target] of [[0, 10], [1, 8], [2, 6], [10, 6]]) {
  test(`reward level ${level} requires ${target} completions`, () => {
    assert.equal(getRewardProgressTarget(level), target);
  });
}
test("invalid reward levels are rejected", () => {
  for (const level of [-1, 0.5, null, "1", NaN]) assert.throws(() => getRewardProgressTarget(level), RangeError);
});
test("reward policy is 500 bps, 10 uses, and reuses standard sitter fee", () => {
  assert.equal(STANDARD_SITTER_FEE_BPS, SITTER_FEE_BPS);
  assert.equal(STANDARD_SITTER_FEE_BPS, 1000);
  assert.equal(REWARD_SITTER_FEE_BPS, 500);
  assert.equal(REWARD_MAX_USES, 10);
});
test("eight weeks is exactly 56 elapsed days across DST", () => {
  const start = new Date("2026-10-15T12:00:00Z");
  assert.equal(REWARD_DURATION_WEEKS, 8);
  assert.equal(REWARD_DURATION_MS, 56 * 86400000);
  assert.equal(getRewardExpiry(start).getTime() - start.getTime(), REWARD_DURATION_MS);
  assert.equal(start.toISOString(), "2026-10-15T12:00:00.000Z");
});
test("invalid expiry input is rejected", () => {
  assert.throws(() => getRewardExpiry(new Date(NaN)), RangeError);
});
const now = new Date("2026-08-29T12:00:00Z");
const grant = { status: "ACTIVE", maximumUses: 10, expiresAt: new Date(now.getTime() + 1) };
test("ACTIVE grant with remaining capacity accepts", () => {
  assert.equal(inspectCurrentRewardGrant(grant, now, 9).accepting, true);
});
test("expiry equality is no longer accepting", () => {
  assert.deepEqual(inspectCurrentRewardGrant({ ...grant, expiresAt: now }, now, 0), { accepting: false, normalizedStatus: "EXPIRED" });
});
test("ten occupied uses normalizes ACTIVE to EXHAUSTED", () => {
  assert.deepEqual(inspectCurrentRewardGrant(grant, now, 10), { accepting: false, normalizedStatus: "EXHAUSTED" });
});
for (const status of ["EXPIRED", "EXHAUSTED", "REVOKED"]) {
  test(`${status} grants do not accept new reservations`, () => {
    assert.deepEqual(inspectCurrentRewardGrant({ ...grant, status }, now, 0), { accepting: false, normalizedStatus: status });
  });
}
