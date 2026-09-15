import { resolveEffectiveBookingCompensationLane, rewardReservationMatchesHistoricalAttribution } from "./effectiveCompensationLane.js";
import { normalizeBookingAttributionSnapshot } from "../../attribution/clientAttributionContract.js";
import { calculateClientEconomics, calculateSitterEconomics, CLIENT_FEE_BPS, SITTER_FEE_BPS, MAX_MONEY_CENTS } from "../../pricing/calculatePricing.js";
import { REWARD_SITTER_FEE_BPS } from "../../rewards/rewardPolicy.js";

export class BookingSitterCompensationError extends Error {
  constructor(code, message) { super(message); this.name = "BookingSitterCompensationError"; this.code = code; }
}
export function reject(code, message) { throw new BookingSitterCompensationError(code, message); }
export function money(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY_CENTS) reject("INVALID_MONEY", "Money must be supported non-negative integer cents.");
  return value;
}
export const validDate = (value) => value instanceof Date && Number.isFinite(value.getTime());
const text = (value) => typeof value === "string" && Boolean(value.trim());

// No catalog/legacy fallback; nullable catalog FKs may have been cleared by deletion.
export function validateCanonicalCompensationBooking(booking) {
  if (!booking) reject("BOOKING_NOT_FOUND", "Booking not found.");
  if (!booking.canonicalCreationKey && !booking.canonicalInputHash && !booking.careOptionId) reject("NOT_CANONICAL", "Legacy Bookings are unsupported.");
  for (const key of ["canonicalCreationKey", "canonicalInputHash", "careOptionId", "careOfferingId", "careOptionCode", "careOfferingCode", "scheduleTimeZone"]) {
    if (!text(booking[key])) reject("INVALID_CANONICAL_CONTRACT", "Canonical identity is incomplete.");
  }
  if (!booking.canonicalSchedule || !Number.isInteger(booking.quantity) || booking.quantity < 1 || booking.quantity > 366 ||
      ["clientTotalCents", "platformFeeCents", "sitterPayoutCents"].some((key) => booking[key] !== null)) reject("INVALID_CANONICAL_CONTRACT", "Canonical contract or legacy-money boundary is invalid.");
  const p = booking.pricingSnapshot;
  if (!p) reject("PRICING_SNAPSHOT_MISSING", "Frozen canonical pricing is required.");
  if (p.bookingId !== booking.id || p.economicsVersion !== 1 || !validDate(p.committedAt) || !Number.isInteger(p.clientRateVersion) || p.clientRateVersion < 1) reject("INVALID_PRICING_SNAPSHOT", "Frozen pricing metadata is invalid.");
  for (const key of ["careOptionCode", "careOfferingCode", "quantity", "billingUnit", "scheduleKind", "durationMinutes"]) {
    if (p[key] !== booking[key]) reject("INVALID_PRICING_SNAPSHOT", "Pricing and Booking identities disagree.");
  }
  for (const key of ["careOptionId", "careOfferingId"]) if (p[key] !== null && p[key] !== booking[key]) reject("INVALID_PRICING_SNAPSHOT", "Pricing catalog identity disagrees with Booking.");
  if (!((p.billingUnit === "VISIT" && p.scheduleKind === "TIMED_VISIT" && Number.isInteger(p.durationMinutes) && p.durationMinutes > 0) ||
      (p.billingUnit === "NIGHT" && p.scheduleKind === "OVERNIGHT_STAY")) || booking.canonicalSchedule.kind !== p.scheduleKind) reject("INVALID_CANONICAL_CONTRACT", "Billing and schedule semantics disagree.");
  if (p.currency !== "USD") reject("CURRENCY_MISMATCH", "Only the frozen USD contract is supported.");
  for (const key of ["baseUnitCents", "baseAggregateCents", "additionalPetAggregateCents", "serviceSubtotalCents", "clientFeeCents", "clientTotalCents"]) money(p[key]);
  if (money(p.baseUnitCents * p.quantity) !== p.baseAggregateCents || money(p.baseAggregateCents + p.additionalPetAggregateCents) !== p.serviceSubtotalCents || p.clientFeeBasisPoints !== CLIENT_FEE_BPS) reject("INVALID_PRICING_SNAPSHOT", "Frozen pricing aggregation is inconsistent.");
  let client;
  try { client = calculateClientEconomics(p.serviceSubtotalCents); } catch { reject("INVALID_MONEY", "Frozen client economics overflow."); }
  if (client.clientFeeCents !== p.clientFeeCents || client.clientTotalCents !== p.clientTotalCents) reject("INVALID_PRICING_SNAPSHOT", "Frozen client fee or total is inconsistent.");
  if (!Array.isArray(booking.bookingPets) || !booking.bookingPets.length || booking.bookingPets.some((pet, index) => pet.position !== index || !text(pet.nameSnapshot) || !text(pet.speciesSnapshot))) reject("INVALID_CANONICAL_CONTRACT", "Ordered frozen pets are required.");
  const a = booking.attributionSnapshot;
  if (!a) reject("ATTRIBUTION_SNAPSHOT_MISSING", "Frozen attribution is required.");
  if (a.bookingId !== booking.id) reject("INVALID_ATTRIBUTION", "Attribution belongs to another Booking.");
  try { normalizeBookingAttributionSnapshot(a); } catch { reject("INVALID_ATTRIBUTION", "Attribution semantics are invalid."); }
  if (booking.sitter?.id !== booking.sitterId || booking.sitter?.role !== "SITTER") reject("SITTER_MISMATCH", "Authoritative sitter relation and assignment disagree.");
  const effective = resolveEffectiveBookingCompensationLane(booking);
  if (!effective.ok) reject(effective.code, "Frozen attribution, compensation or current assignment requires review.");
  const { sitterId, compensationLane } = effective;
  if (booking.sitter?.id !== sitterId || booking.sitter.role !== "SITTER") reject("SITTER_MISMATCH", "Authoritative compensation sitter and current assignment disagree.");
  return { sitterId, compensationLane, pricing: p };
}

export function validateInitialCommitment(booking, sitterId, now) {
  if (!validDate(now)) reject("INVALID_DATABASE_TIME", "Database time is unavailable.");
  if (booking.status !== "CONFIRMED" || booking.canceledAt || booking.completedAt) reject("BOOKING_NOT_COMMITTABLE", "Initial compensation requires an active CONFIRMED Booking.");
  if (!Array.isArray(booking.visits) || !booking.visits.length) reject("VISITS_MISSING", "At least one Visit is required.");
  if (booking.visits.length !== booking.quantity) reject("VISIT_CONTRACT_MISMATCH", "Visit count differs from frozen quantity.");
  for (const v of booking.visits) {
    if (v.bookingId !== booking.id || v.sitterId !== sitterId || v.operatorId !== booking.operatorId) reject("VISIT_ASSIGNMENT_MISMATCH", "All Visits must agree with the authoritative Booking assignment.");
    // Enum has no IN_PROGRESS. CONFIRMED plus the strict time gate is the only
    // supported pre-service state; PENDING/CANCELED/COMPLETED fail closed.
    if (v.status !== "CONFIRMED" || v.completedAt || v.performedBySitterId || !validDate(v.startTime) || !validDate(v.endTime) || v.endTime <= v.startTime) reject("INVALID_VISIT_STATE", "Visit state and timestamps must describe unperformed confirmed care.");
    if (now >= v.startTime) reject("CARE_ALREADY_STARTED", "Compensation must be committed strictly before the earliest Visit start.");
  }
}

export function validateReservation(reservation, bookingId, sitterId, lane, attributionSnapshot = null) {
  if (!reservation) return;
  const historical = lane === "BUSINESS_ASSIGNED" && reservation.status === "RELEASED" &&
    rewardReservationMatchesHistoricalAttribution({ id: bookingId, attributionSnapshot }, reservation);
  if (lane !== "SITTER_ORIGINATED" && !historical) reject("BUSINESS_REWARD_CONTRADICTION", "Business-assigned compensation may only retain a valid released historical reward.");
  const r = reservation, g = r.grant;
  if (!text(r.id) || r.bookingId !== bookingId || (!historical && r.sitterId !== sitterId) || !g || r.grantId !== g.id || g.sitterId !== r.sitterId) reject("REWARD_IDENTITY_MISMATCH", "Reward Booking, sitter or grant identity disagrees.");
  if (!["RESERVED", "CONSUMED", "RELEASED"].includes(r.status) || !validDate(r.reservedAt) ||
      (r.status === "RESERVED" && (r.consumedAt !== null || r.releasedAt !== null)) ||
      (r.status === "CONSUMED" && (!validDate(r.consumedAt) || r.consumedAt < r.reservedAt || r.releasedAt !== null)) ||
      (r.status === "RELEASED" && (!validDate(r.releasedAt) || r.releasedAt < r.reservedAt || r.consumedAt !== null))) reject("INVALID_REWARD_STATE", "Reward reservation lifecycle is inconsistent.");
  // A released entitlement is unavailable. Its old fee is not used.
  if (r.status !== "RELEASED" && (g.feeBasisPoints !== REWARD_SITTER_FEE_BPS || !Number.isInteger(g.rewardLevel) || g.rewardLevel < 1)) reject("UNSUPPORTED_REWARD_FEE", "Reward grant terms are unsupported.");
  // Intentionally no grant status, expiry, capacity or current-pointer check:
  // RESERVED is the earlier entitlement freeze, including after revocation.
}

export function validateExistingCompensation(row, booking, identity, reservation) {
  if (row.bookingId !== booking.id || row.sitterId !== identity.sitterId || row.compensationLane !== identity.compensationLane || row.currency !== identity.pricing.currency || row.quantity !== booking.quantity || !validDate(row.committedAt)) reject("COMPENSATION_IDENTITY_CONFLICT", "Existing compensation contradicts authoritative Booking identity.");
  for (const key of ["sitterCompensationSubtotalCents", "sitterFeeCents", "sitterPayoutCents"]) money(row[key]);
  if (row.sitterCompensationSubtotalCents !== row.sitterFeeCents + row.sitterPayoutCents) reject("COMPENSATION_INVARIANT", "Stored compensation does not balance.");
  if (row.rewardApplied) {
    if (!reservation || reservation.status !== "CONSUMED" || row.compensationLane !== "SITTER_ORIGINATED" || row.rewardReservationId !== reservation.id || row.rewardGrantId !== reservation.grantId || row.rewardLevel !== reservation.grant.rewardLevel || row.sitterFeeBasisPoints !== reservation.grant.feeBasisPoints || +row.committedAt !== +reservation.consumedAt) reject("COMPENSATION_REWARD_CONFLICT", "Reward compensation and consumed reservation disagree.");
  } else if (row.sitterFeeBasisPoints !== SITTER_FEE_BPS || row.rewardReservationId !== null || row.rewardGrantId !== null || row.rewardLevel !== null || (reservation && reservation.status !== "RELEASED")) reject("COMPENSATION_REWARD_CONFLICT", "Standard compensation contradicts reward state.");
  if (identity.compensationLane === "SITTER_ORIGINATED") {
    if (row.rateSource !== "CANONICAL_CLIENT_SERVICE_SUBTOTAL" || row.clientServiceSubtotalCents !== identity.pricing.serviceSubtotalCents || row.sitterCompensationSubtotalCents !== row.clientServiceSubtotalCents || row.sourceRateId !== null || row.rateVersion !== null) reject("COMPENSATION_INVARIANT", "Stored sitter-originated basis is inconsistent.");
  } else if (!["SITTER_OVERRIDE", "DEFAULT_RATE"].includes(row.rateSource) || !text(row.sourceRateId) || !Number.isInteger(row.rateVersion) || row.rateVersion < 1 || row.clientBaseAggregateCents !== identity.pricing.baseAggregateCents) reject("COMPENSATION_INVARIANT", "Stored business rate identity or basis is inconsistent.");
  return row;
}

export function sitterEconomics(subtotal, feeBps) {
  if (![SITTER_FEE_BPS, REWARD_SITTER_FEE_BPS].includes(feeBps)) reject("UNSUPPORTED_REWARD_FEE", "Sitter fee policy is unsupported.");
  try { return calculateSitterEconomics(money(subtotal), feeBps); }
  catch (error) { if (error instanceof BookingSitterCompensationError) throw error; reject("INVALID_MONEY", "Sitter economics are invalid."); }
}
