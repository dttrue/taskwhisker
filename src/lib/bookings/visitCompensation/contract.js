import { calculateSitterEconomics } from "../../pricing/calculatePricing.js";

export const VISIT_COMPENSATION_POLICY_VERSION = 1;
export const authorizationInclude = { petCharges: { orderBy: { petPosition: "asc" } }, void: true };
export const visitFinancialInclude = {
  compensationAuthorizations: { orderBy: { revision: "asc" }, include: authorizationInclude },
  compensationAllocation: true,
};
const money = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const date = (d) => d instanceof Date && Number.isFinite(+d);
const text = (s) => typeof s === "string" && s.length > 0;
export class VisitCompensationError extends Error {
  constructor(code, message = "Visit financial preparation requires manual review.") { super(message); this.name = "VisitCompensationError"; this.code = code; }
}
export function reject(code) { throw new VisitCompensationError(code); }

export function distributeClientUnits(snapshot) {
  const q = snapshot?.quantity;
  if (!Number.isInteger(q) || q < 1 || q > 366 ||
      ![snapshot.baseAggregateCents, snapshot.additionalPetAggregateCents, snapshot.serviceSubtotalCents].every(money) ||
      snapshot.baseAggregateCents + snapshot.additionalPetAggregateCents !== snapshot.serviceSubtotalCents) reject("INVALID_UNIT_PRICING");
  const share = (amount, position) => Math.floor(amount / q) + (position < amount % q ? 1 : 0);
  return Array.from({ length: q }, (_, canonicalUnitPosition) => {
    const unitBaseCents = share(snapshot.baseAggregateCents, canonicalUnitPosition);
    const unitAdditionalPetCents = share(snapshot.additionalPetAggregateCents, canonicalUnitPosition);
    return { canonicalUnitPosition, unitBaseCents, unitAdditionalPetCents, unitServiceSubtotalCents: unitBaseCents + unitAdditionalPetCents };
  });
}
export function validatePositions(booking) {
  const positions = booking.visits?.map((v) => v.canonicalUnitPosition).sort((a, b) => a - b);
  if (!positions || positions.length !== booking.quantity || positions.some((p, i) => p !== i)) reject("CANONICAL_UNIT_POSITIONS_REQUIRED");
}

export function buildInitialAuthorizations({ booking, commitment, authorizedAt, actorUserId, operationId }) {
  validatePositions(booking);
  const units = distributeClientUnits(booking.pricingSnapshot);
  return booking.visits.map((visit) => {
    if (!date(authorizedAt) || authorizedAt >= visit.startTime) reject("AUTHORIZATION_AFTER_START");
    const unit = units[visit.canonicalUnitPosition];
    const business = commitment.performerPolicy === "ORDINARY" && commitment.compensationLane === "BUSINESS_ASSIGNED";
    const petCharges = business ? commitment.petCharges.map(({ petPosition, species, sourcePetChargeId, thresholdIncludedCount, unitAmountCents }) => ({ petPosition, species, sourcePetChargeId, thresholdIncludedCount, unitAmountCents })) : [];
    const sitterBaseCents = business ? commitment.baseUnitCompensationCents : unit.unitBaseCents;
    const sitterPetCents = business ? petCharges.reduce((n, p) => n + p.unitAmountCents, 0) : unit.unitAdditionalPetCents;
    if (business && sitterBaseCents > Math.floor(unit.unitBaseCents * 9000 / 10000)) reject("COMPENSATION_CEILING_EXCEEDED");
    return {
      visitId: visit.id, bookingId: booking.id, commitmentId: commitment.id, revision: 1, predecessorId: null,
      sitterId: commitment.sitterId, compensationLane: commitment.compensationLane,
      performerPolicy: commitment.performerPolicy, feePolicy: commitment.feePolicy, currency: commitment.currency,
      ...unit, sitterBaseCents, sitterPetCents,
      ...calculateSitterEconomics(sitterBaseCents + sitterPetCents, commitment.sitterFeeBasisPoints),
      sitterFeeBasisPoints: commitment.sitterFeeBasisPoints, rateSource: commitment.rateSource,
      sourceRateId: commitment.sourceRateId, rateVersion: commitment.rateVersion,
      includedPetCount: business ? commitment.includedPetCount : null,
      defaultAdditionalCents: business ? commitment.defaultAdditionalCents : null,
      rewardReservationId: commitment.rewardReservationId, rewardGrantId: commitment.rewardGrantId,
      policyVersion: VISIT_COMPENSATION_POLICY_VERSION, actorUserId, reason: "INITIAL_COMMITMENT", operationId, authorizedAt,
      petCharges: { create: petCharges },
    };
  });
}

export function activeAuthorization(visit) {
  const rows = visit?.compensationAuthorizations;
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows.reduce((a, b) => a.revision > b.revision ? a : b);
  return row.void ? null : row;
}
export function authorizationValid(booking, visit, row) {
  if (!row || row.void || row.visitId !== visit.id || row.bookingId !== booking.id || row.sitterId !== visit.sitterId ||
      row.commitmentId !== booking.sitterCompensation?.id || row.currency !== booking.pricingSnapshot?.currency ||
      row.canonicalUnitPosition !== visit.canonicalUnitPosition || row.policyVersion !== VISIT_COMPENSATION_POLICY_VERSION ||
      !date(row.authorizedAt) || row.authorizedAt >= visit.startTime || row.authorizedAt < booking.sitterCompensation.committedAt ||
      !text(row.actorUserId) || !text(row.operationId) || !text(row.reason)) return false;
  let unit;
  try { unit = distributeClientUnits(booking.pricingSnapshot)[visit.canonicalUnitPosition]; } catch { return false; }
  if (!unit || Object.entries(unit).some(([k, v]) => row[k] !== v)) return false;
  if (![row.sitterBaseCents, row.sitterPetCents, row.sitterCompensationSubtotalCents, row.sitterFeeCents, row.sitterPayoutCents].every(money) ||
      row.sitterBaseCents + row.sitterPetCents !== row.sitterCompensationSubtotalCents || row.sitterFeeCents + row.sitterPayoutCents !== row.sitterCompensationSubtotalCents) return false;
  const bps = { OWNER_0_PERCENT: 0, STANDARD_10_PERCENT: 1000, REWARD_5_PERCENT: 500 }[row.feePolicy];
  if (bps === undefined || bps !== row.sitterFeeBasisPoints || calculateSitterEconomics(row.sitterCompensationSubtotalCents, bps).sitterFeeCents !== row.sitterFeeCents) return false;
  const owner = row.performerPolicy === "OWNER_OPERATOR";
  if (owner !== (row.feePolicy === "OWNER_0_PERCENT") || !["OWNER_OPERATOR", "ORDINARY"].includes(row.performerPolicy)) return false;
  if (!["SITTER_ORIGINATED", "BUSINESS_ASSIGNED"].includes(row.compensationLane)) return false;
  const c = booking.sitterCompensation;
  if (row.revision === 1 && ["sitterId", "compensationLane", "performerPolicy", "feePolicy", "rateSource", "sourceRateId", "rateVersion", "rewardReservationId", "rewardGrantId"].some((k) => row[k] !== c[k])) return false;
  if (row.revision === 1 && row.performerPolicy === "ORDINARY" && row.compensationLane === "BUSINESS_ASSIGNED" &&
      (row.sitterBaseCents !== c.baseUnitCompensationCents || row.sitterPetCents * c.quantity !== c.additionalPetCompensationCents)) return false;
  const reward = row.feePolicy === "REWARD_5_PERCENT";
  if (reward) {
    const r = booking.rewardReservation, a = booking.attributionSnapshot;
    if (owner || row.compensationLane !== "SITTER_ORIGINATED" || a?.referringSitterId !== row.sitterId || a?.requestedSitterId !== row.sitterId ||
        !c.rewardApplied || c.rewardReservationId !== row.rewardReservationId || c.rewardGrantId !== row.rewardGrantId ||
        !r || r.status !== "CONSUMED" || r.id !== row.rewardReservationId || r.grantId !== row.rewardGrantId || r.sitterId !== row.sitterId) return false;
  } else if (row.rewardReservationId !== null || row.rewardGrantId !== null) return false;
  if (owner || row.compensationLane === "SITTER_ORIGINATED") {
    if (row.rateSource !== (owner ? "OWNER_FROZEN_CLIENT_SERVICE" : "CANONICAL_CLIENT_SERVICE_SUBTOTAL") || row.sourceRateId !== null || row.rateVersion !== null ||
        row.sitterBaseCents !== unit.unitBaseCents || row.sitterPetCents !== unit.unitAdditionalPetCents) return false;
  } else if (!["SITTER_OVERRIDE", "DEFAULT_RATE"].includes(row.rateSource) || !text(row.sourceRateId) || !Number.isInteger(row.rateVersion) || row.rateVersion < 1 ||
      row.sitterBaseCents > Math.floor(unit.unitBaseCents * 9000 / 10000) || !Array.isArray(row.petCharges) || row.petCharges.reduce((sum, p) => sum + p.unitAmountCents, 0) !== row.sitterPetCents) return false;
  return true;
}

export function inspectFinancialReadiness(booking, visitId = null) {
  const fail = (reason) => ({ ok: false, code: "FINANCIAL_READINESS_MISSING", reason, error: "This canonical visit is unavailable for service. Financial preparation requires operator review." });
  const c = booking?.sitterCompensation;
  if (!c || c.bookingId !== booking.id || c.sitterId !== booking.sitterId || !c.performerPolicy || !c.feePolicy) return fail("COMPENSATION_REQUIRED");
  try { validatePositions(booking); } catch { return fail("CANONICAL_UNIT_POSITIONS_REQUIRED"); }
  for (const visit of booking.visits) {
    const rows = visit.compensationAuthorizations;
    if (!Array.isArray(rows) || rows.filter((a) => a.revision === 1).length !== 1) return fail("AUTHORIZATION_MISSING");
    const ordered = [...rows].sort((a, b) => a.revision - b.revision);
    if (ordered.some((a, i) => a.revision !== i + 1 || a.predecessorId !== (i ? ordered[i - 1].id : null))) return fail("AUTHORIZATION_INVALID");
    if (visitId && visit.id !== visitId) continue;
    if (visit.status === "CANCELED") continue;
    if (!authorizationValid(booking, visit, activeAuthorization(visit))) return fail("AUTHORIZATION_INVALID");
  }
  if (visitId && !booking.visits.some((v) => v.id === visitId)) return fail("AUTHORIZATION_MISSING");
  return { ok: true };
}
