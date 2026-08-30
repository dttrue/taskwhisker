import { SITTER_FEE_BPS } from "../pricing/calculatePricing.js";

export const STANDARD_SITTER_FEE_BPS = SITTER_FEE_BPS;
export const REWARD_SITTER_FEE_BPS = 500;
export const REWARD_MAX_USES = 10;
export const REWARD_DURATION_WEEKS = 8;
export const REWARD_DURATION_MS = REWARD_DURATION_WEEKS * 7 * 24 * 60 * 60 * 1000;

export function getRewardProgressTarget(rewardLevel) {
  if (!Number.isInteger(rewardLevel) || rewardLevel < 0) {
    throw new RangeError("rewardLevel must be a non-negative integer.");
  }
  return rewardLevel === 0 ? 10 : rewardLevel === 1 ? 8 : 6;
}

export function getRewardExpiry(startsAt) {
  if (!(startsAt instanceof Date) || !Number.isFinite(startsAt.getTime())) {
    throw new RangeError("A valid grant start timestamp is required.");
  }
  return new Date(startsAt.getTime() + REWARD_DURATION_MS);
}

// Current-state capacity only: exhaustion/revocation history cannot yet tell us
// when a grant stopped accepting. Do not use this to reconstruct past capacity.
export function inspectCurrentRewardGrant(grant, now, capacityUsed) {
  if (grant.status !== "ACTIVE") {
    return { accepting: false, normalizedStatus: grant.status };
  }
  if (now >= grant.expiresAt) {
    return { accepting: false, normalizedStatus: "EXPIRED" };
  }
  if (capacityUsed >= grant.maximumUses) {
    return { accepting: false, normalizedStatus: "EXHAUSTED" };
  }
  return { accepting: true, normalizedStatus: "ACTIVE" };
}
