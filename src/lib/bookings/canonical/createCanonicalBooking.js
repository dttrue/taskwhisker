import { captureCareInstructions } from "../careSnapshot/contract.js";
import { normalizeBookingIntent, deriveSchedule, requiredText, reject } from "./bookingContract.js";
import { calculateCanonicalClientQuote } from "../../pricing/calculateCanonicalClientQuote.js";
import { aggregateCanonicalQuote, createBookingPricingSnapshotWithDb } from "./pricingSnapshot.js";
import { buildBookingAttributionSnapshot, validateOperator } from "../../attribution/clientAttributionContract.js";
import { findClientIdentity, resolveClientOriginWriteIntent, createOrVerifyClientOriginInTransaction, createBookingAttributionSnapshotInTransaction } from "../../attribution/clientAttributionWrites.js";
import { verifySitterReferralCode, readVerifiedSitterReferralIntent } from "../../referrals/sitterReferralCodeWrites.js";

const include = { bookingPets: { orderBy: { position: "asc" } }, visits: { orderBy: { startTime: "asc" } }, pricingSnapshot: true, attributionSnapshot: true };
function original(booking, hash) {
  if (booking.canonicalInputHash !== hash) reject("IDEMPOTENCY_CONFLICT", "Creation key was already used for different booking choices.");
  if (!booking.pricingSnapshot || !booking.attributionSnapshot || !booking.careOptionId || booking.quantity !== booking.pricingSnapshot.quantity || booking.visits.length !== booking.quantity || !booking.bookingPets.length) reject("INCOMPLETE_CANONICAL_BOOKING", "Stored canonical booking contract is incomplete.");
  const snapshot = booking.pricingSnapshot;
  for (const field of ["careOfferingCode", "careOptionCode", "billingUnit", "scheduleKind", "durationMinutes", "quantity"]) {
    if (booking[field] !== snapshot[field]) reject("INCOMPLETE_CANONICAL_BOOKING", "Stored input and pricing identities disagree.");
  }
  if (!booking.canonicalSchedule || !booking.scheduleTimeZone || ["clientTotalCents", "platformFeeCents", "sitterPayoutCents"].some((field) => booking[field] !== null) || snapshot.baseUnitCents * snapshot.quantity !== snapshot.baseAggregateCents || snapshot.baseAggregateCents + snapshot.additionalPetAggregateCents !== snapshot.serviceSubtotalCents || snapshot.serviceSubtotalCents + snapshot.clientFeeCents !== snapshot.clientTotalCents) reject("INCOMPLETE_CANONICAL_BOOKING", "Stored canonical economics are inconsistent.");
  return booking;
}

// Trusted internal boundary only. operatorId is trusted ownership context;
// input is allowlisted actual choices. No browser-selected sitter ID or lane.
// The server wrapper owns the DB. No public action imports this module.
export async function createCanonicalBookingWithDb({ db, operatorId, creationKey, input }) {
  const key = requiredText(creationKey, "creationKey", 128);
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(key)) reject("INVALID_INPUT", "An opaque retained creation key is required.");
  const { intent, inputHash, publicCode } = normalizeBookingIntent(input, operatorId);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const operator = await tx.user.findUnique({ where: { id: intent.operatorId }, select: { id: true, role: true } });
        validateOperator(operator, intent.operatorId);
        // Read stored economics before loading rates, default assignment or origin.
        const prior = await tx.booking.findUnique({ where: { canonicalCreationKey: key }, include });
        if (prior) return original(prior, inputHash);
        const verifiedReferral = publicCode ? await verifySitterReferralCode({ db: tx, publicCode }) : null;
        const referral = verifiedReferral ? readVerifiedSitterReferralIntent({ db: tx, verifiedReferral }) : null;
        const sitterId = intent.sitterIntent === "REFERRING_SITTER" ? referral.sitterId : process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID?.trim();
        const sitter = sitterId ? await tx.user.findFirst({ where: { id: sitterId, role: "SITTER" } }) : null;
        if (!sitter) reject("SITTER_NOT_CONFIGURED", "Trusted default or verified requested sitter is unavailable.");
        const identity = await findClientIdentity({ db: tx, ...intent.client });
        const originIntent = await resolveClientOriginWriteIntent({ db: tx, ...intent.client, verifiedReferral });
        const client = identity.client ?? await tx.client.create({ data: intent.client });
        const { origin } = await createOrVerifyClientOriginInTransaction({ tx, clientId: client.id, intent: originIntent });
        const referringSitter = origin.referringSitterId ? await tx.user.findUnique({ where: { id: origin.referringSitterId } }) : null;
        const attribution = buildBookingAttributionSnapshot({ clientOrigin: origin, referringSitter, requestedSitter: intent.sitterIntent === "REFERRING_SITTER" ? sitter : null, assignedSitter: sitter });
        const careOption = await tx.careOption.findUnique({ where: { code: intent.careOptionCode }, include: { offering: { include: { speciesPolicies: true } }, clientRate: { include: { petCharges: true } } } });
        const quote = calculateCanonicalClientQuote({ careOption, pets: intent.pets });
        const schedule = deriveSchedule(intent.schedule, careOption);
        // Validate money before persistence. Writer validates again against the
        // actual frozen Booking/Pets after insertion, inside this transaction.
        aggregateCanonicalQuote({ careOption, quote, quantity: schedule.quantity });
        const { location } = intent;
        const booking = await tx.booking.create({ data: {
          clientId: client.id, operatorId: intent.operatorId, sitterId: sitter.id,
          status: "REQUESTED", startTime: schedule.startTime, endTime: schedule.endTime,
          clientTotalCents: null, platformFeeCents: null, sitterPayoutCents: null,
          canonicalCreationKey: key, canonicalInputHash: inputHash,
          careOfferingId: careOption.offering.id, careOfferingCode: careOption.offering.code,
          careOptionId: careOption.id, careOptionCode: careOption.code,
          billingUnit: careOption.offering.billingUnit, scheduleKind: careOption.offering.scheduleKind,
          durationMinutes: careOption.durationMinutes, quantity: schedule.quantity,
          canonicalSchedule: intent.schedule, scheduleTimeZone: intent.timeZone,
          petDetails: intent.petDetails ?? undefined,
          notes: intent.notes, ...captureCareInstructions(intent.notes), petNames: intent.pets.map((pet) => pet.name),
          serviceSummary: `${careOption.offering.name} · ${careOption.label}`,
          serviceAddressLine1: location.addressLine1, serviceAddressLine2: location.addressLine2,
          serviceCity: location.city, serviceState: location.state, servicePostalCode: location.postalCode,
          serviceCountry: location.country, accessInstructions: location.accessInstructions, locationNotes: location.locationNotes,
          bookingPets: { create: intent.pets.map((pet, position) => ({ position, nameSnapshot: pet.name, speciesSnapshot: pet.species })) },
        } });
        await tx.visit.createMany({ data: schedule.windows.map((window, canonicalUnitPosition) => ({ ...window, canonicalUnitPosition, bookingId: booking.id, operatorId: intent.operatorId, sitterId: sitter.id, status: "PENDING" })) });
        await createBookingAttributionSnapshotInTransaction({ tx, bookingId: booking.id, snapshot: attribution });
        await createBookingPricingSnapshotWithDb({ tx, bookingId: booking.id, careOption, quote, quantity: schedule.quantity });
        await tx.bookingHistory.create({ data: { bookingId: booking.id, toStatus: "REQUESTED", note: "Internal canonical booking created; public activation pending." } });
        return tx.booking.findUnique({ where: { id: booking.id }, include });
      }, { isolationLevel: "Serializable", timeout: 30_000 });
    } catch (error) {
      if (!["P2002", "P2034"].includes(error?.code)) throw error;
      // Never query inside an aborted PostgreSQL transaction.
      const winner = await db.booking.findUnique({ where: { canonicalCreationKey: key }, include });
      if (winner) return original(winner, inputHash);
      if (attempt === 2) reject("CANONICAL_CREATION_CONFLICT", "Concurrent creation could not be resolved; retry with the same intent key.");
    }
  }
}
