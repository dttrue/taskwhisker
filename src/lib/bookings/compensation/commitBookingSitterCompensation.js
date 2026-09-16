import { resolveBusinessOwnerIdentityWithDb } from "../businessOwnerIdentityContract.js";
import { buildInitialAuthorizations, inspectFinancialReadiness, visitFinancialInclude, reject as rejectVisit } from "../visitCompensation/contract.js";
import { calculateBusinessAssignedSitterCompensation, selectBusinessAssignedSitterRate, BusinessAssignedSitterCompensationError } from "../../pricing/calculateBusinessAssignedSitterCompensation.js";
import { SITTER_FEE_BPS } from "../../pricing/calculatePricing.js";
import { isRetryableRewardTransactionError, REWARD_TRANSACTION_ATTEMPTS } from "../../rewards/rewardProgressGrantWrites.js";
import { BookingSitterCompensationError, reject, money, validDate, validateCanonicalCompensationBooking, validateInitialCommitment, validateReservation, validateExistingCompensation, sitterEconomics } from "./compensationContract.js";

const compensationInclude = { petCharges: { orderBy: { petPosition: "asc" } } };
const bookingInclude = {
  sitter: { select: { id: true, role: true } }, pricingSnapshot: true, attributionSnapshot: true,
  bookingPets: { orderBy: { position: "asc" } }, visits: { orderBy: { startTime: "asc" }, include: visitFinancialInclude },
  sitterCompensation: { include: compensationInclude },
};
const reservationFor = (tx, bookingId) => tx.sitterRewardReservation.findUnique({ where: { bookingId }, include: { grant: true } });

export async function resolveBookingSitterCompensationEconomics({ tx, booking, identity, reservation, ownerConfiguration }) {
  const { sitterId, compensationLane, pricing } = identity;
  const owner = await resolveBusinessOwnerIdentityWithDb({ db: tx, configuration: ownerConfiguration });
  const isOwner = sitterId === owner.sitterId;
  if (isOwner && reservation && reservation.status !== "RELEASED") reject("OWNER_REWARD_REQUIRES_REVIEW", "Existing owner entitlement requires manual review.");
  const rewardApplied = !isOwner && compensationLane === "SITTER_ORIGINATED" && reservation?.status === "RESERVED";
  const common = {
    performerPolicy: isOwner ? "OWNER_OPERATOR" : "ORDINARY",
    feePolicy: isOwner ? "OWNER_0_PERCENT" : rewardApplied ? "REWARD_5_PERCENT" : "STANDARD_10_PERCENT",
    bookingId: booking.id, sitterId, compensationLane, currency: pricing.currency, quantity: booking.quantity,
    clientBaseAggregateCents: null, clientServiceSubtotalCents: null,
    sourceRateId: null, rateVersion: null, baseUnitCompensationCents: null,
    baseAggregateCompensationCents: null, additionalPetCompensationCents: null,
    includedPetCount: null, defaultAdditionalCents: null,
    rewardApplied, rewardReservationId: rewardApplied ? reservation.id : null,
    rewardGrantId: rewardApplied ? reservation.grantId : null,
    rewardLevel: rewardApplied ? reservation.grant.rewardLevel : null,
  };
  if (isOwner) return { ...common, clientServiceSubtotalCents: pricing.serviceSubtotalCents,
    rateSource: "OWNER_FROZEN_CLIENT_SERVICE", sitterFeeBasisPoints: 0,
    sitterCompensationSubtotalCents: pricing.serviceSubtotalCents, sitterFeeCents: 0, sitterPayoutCents: pricing.serviceSubtotalCents, petCharges: [] };
  if (compensationLane === "SITTER_ORIGINATED") {
    const sitterFeeBasisPoints = rewardApplied ? reservation.grant.feeBasisPoints : SITTER_FEE_BPS;
    return { ...common, clientServiceSubtotalCents: pricing.serviceSubtotalCents,
      rateSource: "CANONICAL_CLIENT_SERVICE_SUBTOTAL", sitterFeeBasisPoints,
      ...sitterEconomics(pricing.serviceSubtotalCents, sitterFeeBasisPoints), petCharges: [] };
  }
  // Only sitter rates are loaded. Frozen option metadata controls historical pet
  // interpretation; no careOption/clientRate/catalog quote query occurs here.
  const [sitterRate, defaultRate] = await Promise.all([
    tx.sitterCareRate.findUnique({ where: { careOptionId_sitterId: { careOptionId: booking.careOptionId, sitterId } }, include: { petCharges: true } }),
    tx.defaultSitterCareRate.findUnique({ where: { careOptionId: booking.careOptionId }, include: { petCharges: true } }),
  ]);
  const { rate, rateSource } = selectBusinessAssignedSitterRate({ sitterRate, defaultRate });
  if (rate.careOptionId !== booking.careOptionId || (rateSource === "SITTER_OVERRIDE" && rate.sitterId !== sitterId)) reject("RATE_IDENTITY_MISMATCH", "Selected rate identity does not match the Booking assignment.");
  const quote = calculateBusinessAssignedSitterCompensation({
    careOption: { code: pricing.careOptionCode, label: pricing.careOptionLabel, primarySpecies: pricing.primarySpecies, isActive: true },
    frozenClientPricing: { baseAggregateCents: pricing.baseAggregateCents, currency: pricing.currency },
    rate, rateSource, sitterId, quantity: booking.quantity,
    pets: booking.bookingPets.map((pet) => ({ name: pet.nameSnapshot, species: pet.speciesSnapshot })),
  });
  const baseAggregateCompensationCents = quote.breakdown[0].totalAmountCents;
  const petCharges = quote.breakdown.slice(1).map((entry) => {
    if (entry.thresholdIncludedCount !== null && !entry.sourcePetChargeId) reject("RATE_IDENTITY_MISMATCH", "Applied species compensation requires its actual rate-rule identity.");
    return { petPosition: entry.petIndex, species: entry.species, sourcePetChargeId: entry.sourcePetChargeId,
      thresholdIncludedCount: entry.thresholdIncludedCount, unitAmountCents: entry.unitAmountCents,
      aggregateAmountCents: entry.totalAmountCents };
  });
  return { ...common, clientBaseAggregateCents: pricing.baseAggregateCents,
    rateSource, sourceRateId: quote.sourceRate.id, rateVersion: quote.sourceRate.version,
    baseUnitCompensationCents: rate.baseCompensationCents, baseAggregateCompensationCents,
    additionalPetCompensationCents: money(quote.sitterCompensationSubtotalCents - baseAggregateCompensationCents),
    includedPetCount: rate.includedPetCount, defaultAdditionalCents: rate.defaultAdditionalCents,
    sitterFeeBasisPoints: quote.sitterFeeBasisPoints,
    sitterCompensationSubtotalCents: quote.sitterCompensationSubtotalCents,
    sitterFeeCents: quote.sitterFeeCents, sitterPayoutCents: quote.sitterPayoutCents, petCharges };
}

async function commitInTransaction(tx, bookingId, { confirmation = false, actorUserId = null, ownerConfiguration } = {}) {
  // Same ordering as reserve: Booking, Visits, then shared reward account.
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Visit" WHERE "bookingId" = ${bookingId} ORDER BY "id" FOR UPDATE`;
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  const identity = validateCanonicalCompensationBooking(booking);
  let reservation = await reservationFor(tx, bookingId);
  validateReservation(reservation, bookingId, identity.sitterId, identity.compensationLane, booking.attributionSnapshot);
  let account = null;
  if (reservation) {
    // Released historical entitlement still belongs to the original sitter.
    const rewardSitterId = reservation.sitterId;
    await tx.$queryRaw`SELECT "id" FROM "SitterRewardAccount" WHERE "sitterId" = ${rewardSitterId} FOR UPDATE`;
    account = await tx.sitterRewardAccount.findUnique({ where: { sitterId: rewardSitterId } });
    if (!account) reject("INVALID_REWARD_STATE", "Reservation reward account is missing.");
    reservation = await reservationFor(tx, bookingId);
    if (!reservation) reject("INVALID_REWARD_STATE", "Reservation disappeared during commitment.");
    validateReservation(reservation, bookingId, identity.sitterId, identity.compensationLane, booking.attributionSnapshot);
  }
  if (booking.sitterCompensation) {
    if (confirmation && booking.status !== "CONFIRMED") rejectVisit("FINANCIAL_READINESS_MISSING");
    if (booking.visits.some((v) => v.sitterId !== identity.sitterId)) reject("VISIT_ASSIGNMENT_MISMATCH", "Current Visit assignment contradicts frozen compensation.");
    const existing = validateExistingCompensation(booking.sitterCompensation, booking, identity, reservation);
    // Historical standalone replay remains read-only. Confirmation never repairs.
    if (confirmation || existing.performerPolicy) {
      const ready = inspectFinancialReadiness({ ...booking, rewardReservation: reservation });
      if (!ready.ok) rejectVisit(ready.code);
    }
    return existing;
  }
  if (reservation?.status === "CONSUMED") reject("CONSUMED_WITHOUT_COMPENSATION", "Consumed reservation has no compensation snapshot; history cannot be recreated.");
  const data = await resolveBookingSitterCompensationEconomics({ tx, booking, identity, reservation, ownerConfiguration });
  // Sample after all locks and rate reads, immediately before the pre-service
  // decision and write. This instant records acceptance inside this transaction.
  const [clock] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  validateInitialCommitment(booking, identity.sitterId, clock?.now, { confirmation });
  if (reservation?.status === "RESERVED" && (!validDate(reservation.reservedAt) || reservation.reservedAt > clock.now)) reject("INVALID_REWARD_STATE", "Reservation cannot postdate compensation commitment.");
  const { petCharges, ...scalars } = data;
  const result = await tx.bookingSitterCompensation.create({ data: {
    ...scalars, committedAt: clock.now, petCharges: { create: petCharges },
  }, include: compensationInclude });
  const authorizations = buildInitialAuthorizations({ booking, commitment: result, authorizedAt: clock.now,
    actorUserId: actorUserId ?? booking.operatorId, operationId: `initial:${result.id}` });
  for (const data of authorizations) await tx.visitSitterCompensationAuthorization.create({ data });
  if (data.rewardApplied) {
    const changed = await tx.sitterRewardReservation.updateMany({ where: {
      id: reservation.id, bookingId, sitterId: identity.sitterId, grantId: reservation.grantId,
      status: "RESERVED", consumedAt: null, releasedAt: null,
    }, data: { status: "CONSUMED", consumedAt: clock.now } });
    if (changed.count !== 1) reject("REWARD_TRANSITION_CONFLICT", "Reservation could not be consumed exactly once.");
    // Shared write makes stale Serializable reservation/progress snapshots retry.
    await tx.sitterRewardAccount.update({ where: { id: account.id }, data: { version: { increment: 1 } } });
  }
  const [finalClock] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  validateInitialCommitment(booking, identity.sitterId, finalClock?.now, { confirmation });
  return result;
}

// Internal dependency-injectable boundary. No user-controlled transaction hooks,
// sitter, lane, rates, money, currency, reward identity, or timestamps are read.
export async function commitBookingSitterCompensationWithDb({ db, bookingId, ownerConfiguration } = {}) {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!id || typeof db?.$transaction !== "function") reject("INVALID_INPUT", "A Booking ID and transaction-capable database are required.");
  for (let attempt = 0; attempt < REWARD_TRANSACTION_ATTEMPTS; attempt++) {
    try {
      return await db.$transaction((tx) => commitInTransaction(tx, id, { ownerConfiguration }), { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof BookingSitterCompensationError || ["BusinessOwnerIdentityError", "VisitCompensationError"].includes(error?.name)) throw error;
      if (error instanceof BusinessAssignedSitterCompensationError) reject(error.code, error.message);
      // Start a fresh transaction after unique/serialization errors; winner
      // replay runs the same identity checks and never leaks raw Prisma errors.
      if (isRetryableRewardTransactionError(error) || error?.code === "P2002") {
        if (attempt + 1 < REWARD_TRANSACTION_ATTEMPTS) continue;
        reject("COMPENSATION_TRANSACTION_CONFLICT", "Compensation could not be serialized; retry the same Booking.");
      }
      reject("COMPENSATION_PERSISTENCE_ERROR", "Compensation could not be persisted.");
    }
  }
}

// Transaction composition only, imported by the operator confirmation service.
// No public/server-action export accepts a caller lifecycle override.
export function prepareBookingSitterCompensationWithinConfirmationTx({ tx, bookingId, actorUserId }) {
  return commitInTransaction(tx, bookingId, { confirmation: true, actorUserId });
}
