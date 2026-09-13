import { calculateBusinessAssignedSitterCompensation, selectBusinessAssignedSitterRate, BusinessAssignedSitterCompensationError } from "../../pricing/calculateBusinessAssignedSitterCompensation.js";
import { SITTER_FEE_BPS } from "../../pricing/calculatePricing.js";
import { isRetryableRewardTransactionError, REWARD_TRANSACTION_ATTEMPTS } from "../../rewards/rewardProgressGrantWrites.js";
import { BookingSitterCompensationError, reject, money, validDate, validateCanonicalCompensationBooking, validateInitialCommitment, validateReservation, validateExistingCompensation, sitterEconomics } from "./compensationContract.js";

const compensationInclude = { petCharges: { orderBy: { petPosition: "asc" } } };
const bookingInclude = {
  sitter: { select: { id: true, role: true } }, pricingSnapshot: true, attributionSnapshot: true,
  bookingPets: { orderBy: { position: "asc" } }, visits: { orderBy: { startTime: "asc" } },
  sitterCompensation: { include: compensationInclude },
};
const reservationFor = (tx, bookingId) => tx.sitterRewardReservation.findUnique({ where: { bookingId }, include: { grant: true } });

export async function resolveBookingSitterCompensationEconomics({ tx, booking, identity, reservation }) {
  const { sitterId, compensationLane, pricing } = identity;
  const rewardApplied = reservation?.status === "RESERVED";
  const common = {
    bookingId: booking.id, sitterId, compensationLane, currency: pricing.currency, quantity: booking.quantity,
    clientBaseAggregateCents: null, clientServiceSubtotalCents: null,
    sourceRateId: null, rateVersion: null, baseUnitCompensationCents: null,
    baseAggregateCompensationCents: null, additionalPetCompensationCents: null,
    includedPetCount: null, defaultAdditionalCents: null,
    rewardApplied, rewardReservationId: rewardApplied ? reservation.id : null,
    rewardGrantId: rewardApplied ? reservation.grantId : null,
    rewardLevel: rewardApplied ? reservation.grant.rewardLevel : null,
  };
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

async function commitInTransaction(tx, bookingId) {
  // Same ordering as reserve: Booking, Visits, then shared reward account.
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Visit" WHERE "bookingId" = ${bookingId} ORDER BY "id" FOR UPDATE`;
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  const identity = validateCanonicalCompensationBooking(booking);
  let reservation = await reservationFor(tx, bookingId);
  validateReservation(reservation, bookingId, identity.sitterId, identity.compensationLane);
  let account = null;
  if (reservation) {
    await tx.$queryRaw`SELECT "id" FROM "SitterRewardAccount" WHERE "sitterId" = ${identity.sitterId} FOR UPDATE`;
    account = await tx.sitterRewardAccount.findUnique({ where: { sitterId: identity.sitterId } });
    if (!account) reject("INVALID_REWARD_STATE", "Reservation reward account is missing.");
    reservation = await reservationFor(tx, bookingId);
    if (!reservation) reject("INVALID_REWARD_STATE", "Reservation disappeared during commitment.");
    validateReservation(reservation, bookingId, identity.sitterId, identity.compensationLane);
  }
  if (booking.sitterCompensation) {
    if (booking.visits.some((v) => v.sitterId !== identity.sitterId)) reject("VISIT_ASSIGNMENT_MISMATCH", "Current Visit assignment contradicts frozen compensation.");
    return validateExistingCompensation(booking.sitterCompensation, booking, identity, reservation);
  }
  if (reservation?.status === "CONSUMED") reject("CONSUMED_WITHOUT_COMPENSATION", "Consumed reservation has no compensation snapshot; history cannot be recreated.");
  const data = await resolveBookingSitterCompensationEconomics({ tx, booking, identity, reservation });
  // Sample after all locks and rate reads, immediately before the pre-service
  // decision and write. This instant records acceptance inside this transaction.
  const [clock] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  validateInitialCommitment(booking, identity.sitterId, clock?.now);
  if (reservation?.status === "RESERVED" && (!validDate(reservation.reservedAt) || reservation.reservedAt > clock.now)) reject("INVALID_REWARD_STATE", "Reservation cannot postdate compensation commitment.");
  const { petCharges, ...scalars } = data;
  const result = await tx.bookingSitterCompensation.create({ data: {
    ...scalars, committedAt: clock.now, petCharges: { create: petCharges },
  }, include: compensationInclude });
  if (data.rewardApplied) {
    const changed = await tx.sitterRewardReservation.updateMany({ where: {
      id: reservation.id, bookingId, sitterId: identity.sitterId, grantId: reservation.grantId,
      status: "RESERVED", consumedAt: null, releasedAt: null,
    }, data: { status: "CONSUMED", consumedAt: clock.now } });
    if (changed.count !== 1) reject("REWARD_TRANSITION_CONFLICT", "Reservation could not be consumed exactly once.");
    // Shared write makes stale Serializable reservation/progress snapshots retry.
    await tx.sitterRewardAccount.update({ where: { id: account.id }, data: { version: { increment: 1 } } });
  }
  return result;
}

// Internal dependency-injectable boundary. No user-controlled transaction hooks,
// sitter, lane, rates, money, currency, reward identity, or timestamps are read.
export async function commitBookingSitterCompensationWithDb({ db, bookingId } = {}) {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!id || typeof db?.$transaction !== "function") reject("INVALID_INPUT", "A Booking ID and transaction-capable database are required.");
  for (let attempt = 0; attempt < REWARD_TRANSACTION_ATTEMPTS; attempt++) {
    try {
      return await db.$transaction((tx) => commitInTransaction(tx, id), { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof BookingSitterCompensationError) throw error;
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
