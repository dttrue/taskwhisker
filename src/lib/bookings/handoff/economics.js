import { resolveBusinessOwnerIdentityWithDb } from "../businessOwnerIdentityContract.js";
import { calculateBusinessAssignedSitterCompensation, selectBusinessAssignedSitterRate } from "../../pricing/calculateBusinessAssignedSitterCompensation.js";
import { calculateSitterEconomics } from "../../pricing/calculatePricing.js";
import { activeAuthorization, distributeClientUnits, reject, VISIT_COMPENSATION_POLICY_VERSION } from "../visitCompensation/contract.js";

// Trusted locked records only. Owner configuration comes from the server environment.
export async function replacementAuthorization(tx, booking, visit, input, authorizedAt) {
  const owner = await resolveBusinessOwnerIdentityWithDb({ db: tx });
  const isOwner = input.sitterId === owner.sitterId;
  const a = booking.attributionSnapshot, c = booking.sitterCompensation, r = booking.rewardReservation;
  const original = a.compensationLane === "SITTER_ORIGINATED" && a.referringSitterId === input.sitterId && a.requestedSitterId === input.sitterId;
  const reward = !isOwner && original && c.sitterId === input.sitterId && c.rewardApplied;
  if (reward && (!r || r.status !== "CONSUMED" || r.id !== c.rewardReservationId || r.sitterId !== input.sitterId)) reject("REWARD_STATE_CONFLICT");
  const unit = distributeClientUnits(booking.pricingSnapshot)[visit.canonicalUnitPosition];
  let sitterBaseCents = unit.unitBaseCents, sitterPetCents = unit.unitAdditionalPetCents, petCharges = [];
  let rateSource = isOwner ? "OWNER_FROZEN_CLIENT_SERVICE" : "CANONICAL_CLIENT_SERVICE_SUBTOTAL";
  let sourceRateId = null, rateVersion = null, includedPetCount = null, defaultAdditionalCents = null;
  if (!isOwner && !original) {
    const [sitterRate, defaultRate] = await Promise.all([
      tx.sitterCareRate.findUnique({ where: { careOptionId_sitterId: { careOptionId: booking.careOptionId, sitterId: input.sitterId } }, include: { petCharges: true } }),
      tx.defaultSitterCareRate.findUnique({ where: { careOptionId: booking.careOptionId }, include: { petCharges: true } }),
    ]);
    const selected = selectBusinessAssignedSitterRate({ sitterRate, defaultRate }), rate = selected.rate;
    if (rate.careOptionId !== booking.careOptionId || selected.rateSource === "SITTER_OVERRIDE" && rate.sitterId !== input.sitterId) reject("RATE_IDENTITY_MISMATCH");
    const p = booking.pricingSnapshot;
    const quote = calculateBusinessAssignedSitterCompensation({ careOption: { code: p.careOptionCode, label: p.careOptionLabel, primarySpecies: p.primarySpecies, isActive: true },
      frozenClientPricing: { baseAggregateCents: unit.unitBaseCents, currency: p.currency }, rate, rateSource: selected.rateSource,
      sitterId: input.sitterId, quantity: 1, pets: booking.bookingPets.map(pet => ({ name: pet.nameSnapshot, species: pet.speciesSnapshot })) });
    sitterBaseCents = rate.baseCompensationCents;
    petCharges = quote.breakdown.slice(1).map(p => ({ petPosition: p.petIndex, species: p.species, sourcePetChargeId: p.sourcePetChargeId, thresholdIncludedCount: p.thresholdIncludedCount, unitAmountCents: p.unitAmountCents }));
    if (petCharges.some(p => p.thresholdIncludedCount !== null && !p.sourcePetChargeId)) reject("RATE_IDENTITY_MISMATCH");
    sitterPetCents = petCharges.reduce((sum,p) => sum + p.unitAmountCents, 0);
    rateSource = selected.rateSource; sourceRateId = rate.id; rateVersion = rate.version;
    includedPetCount = rate.includedPetCount; defaultAdditionalCents = rate.defaultAdditionalCents;
  }
  const predecessor = activeAuthorization(visit), bps = isOwner ? 0 : reward ? 500 : 1000;
  return { visitId: visit.id, bookingId: booking.id, commitmentId: c.id, revision: predecessor.revision + 1, predecessorId: predecessor.id,
    sitterId: input.sitterId, compensationLane: original ? "SITTER_ORIGINATED" : "BUSINESS_ASSIGNED",
    performerPolicy: isOwner ? "OWNER_OPERATOR" : "ORDINARY", feePolicy: isOwner ? "OWNER_0_PERCENT" : reward ? "REWARD_5_PERCENT" : "STANDARD_10_PERCENT",
    currency: c.currency, ...unit, sitterBaseCents, sitterPetCents, ...calculateSitterEconomics(sitterBaseCents + sitterPetCents, bps), sitterFeeBasisPoints: bps,
    rateSource, sourceRateId, rateVersion, includedPetCount, defaultAdditionalCents,
    rewardReservationId: reward ? c.rewardReservationId : null, rewardGrantId: reward ? c.rewardGrantId : null,
    policyVersion: VISIT_COMPENSATION_POLICY_VERSION, actorUserId: input.actorId, operationId: input.operationId,
    reason: `SELECTED_VISIT_HANDOFF:${input.fingerprint}`, authorizedAt, petCharges: { create: petCharges } };
}
