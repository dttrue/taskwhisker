import { isDeepStrictEqual } from "node:util";
import { calculateCanonicalClientQuote } from "../../pricing/calculateCanonicalClientQuote.js";
import { calculateClientEconomics, MAX_MONEY_CENTS, CLIENT_FEE_BPS } from "../../pricing/calculatePricing.js";
import { reject } from "./bookingContract.js";

// V1 is this first persisted canonical aggregation contract. The rate's real
// version is separate; no pretend catalog version is synthesized.
export const CANONICAL_ECONOMICS_VERSION = 1;
function money(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY_CENTS) reject("INVALID_MONEY", "Money is outside PostgreSQL integer-cent range.");
  return value;
}
export function aggregateCanonicalQuote({ careOption, quote, quantity }) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 366) reject("INVALID_QUANTITY", "Quantity must be 1 to 366 derived units.");
  if (quote.quantity !== 1 || quote.currency !== "USD" || careOption.clientRate.currency !== quote.currency || quote.clientFeeBasisPoints !== CLIENT_FEE_BPS) reject("INVALID_QUOTE", "Unit quote currency, quantity or fee contract is invalid.");
  if (quote.careOption.code !== careOption.code || quote.careOffering.code !== careOption.offering.code || quote.rate.id !== careOption.clientRate.id || quote.rate.version !== careOption.clientRate.version) reject("INVALID_QUOTE", "Quote identity does not match its catalog inputs.");
  if (!Array.isArray(quote.breakdown) || !quote.breakdown.length || quote.breakdown[0].type !== "BASE_CARE") reject("INVALID_BREAKDOWN", "Base-care entry is required first.");
  const petIndices = new Set();
  quote.breakdown.forEach((entry, index) => {
    money(entry.amountCents);
    if (entry.quantity !== 1 || (index > 0 && entry.type !== "ADDITIONAL_PET")) reject("INVALID_BREAKDOWN", "Unsupported canonical unit breakdown.");
    if (index > 0) {
      const pet = quote.pets?.[entry.petIndex];
      if (!Number.isInteger(entry.petIndex) || !pet || pet.name !== entry.petName || pet.species !== entry.species || petIndices.has(entry.petIndex)) reject("INVALID_BREAKDOWN", "Pet breakdown does not match ordered pets.");
      petIndices.add(entry.petIndex);
    }
  });
  const baseUnitCents = money(quote.breakdown[0].amountCents);
  if (baseUnitCents !== careOption.clientRate.baseRateCents) reject("INVALID_QUOTE", "Base does not match the canonical rate.");
  const additionalUnit = money(quote.breakdown.slice(1).reduce((sum, entry) => sum + entry.amountCents, 0));
  if (money(baseUnitCents + additionalUnit) !== money(quote.serviceSubtotalCents)) reject("INVALID_BREAKDOWN", "Unit subtotal differs from breakdown.");
  const unitEconomics = calculateClientEconomics(quote.serviceSubtotalCents);
  if (quote.clientFeeCents !== unitEconomics.clientFeeCents || quote.clientTotalCents !== unitEconomics.clientTotalCents) reject("INVALID_QUOTE", "Unit fee or total is invalid.");
  // Validate the complete existing breakdown language, including thresholds and
  // pet indices, with the existing engine rather than a second pricing policy.
  const expectedQuote = calculateCanonicalClientQuote({ careOption, pets: quote.pets });
  if (!isDeepStrictEqual(quote, expectedQuote)) reject("INVALID_QUOTE", "Quote differs from the authoritative canonical engine.");
  const baseAggregateCents = money(baseUnitCents * quantity);
  const additionalPetAggregateCents = money(additionalUnit * quantity);
  const economics = calculateClientEconomics(money(baseAggregateCents + additionalPetAggregateCents));
  return {
    economicsVersion: CANONICAL_ECONOMICS_VERSION, currency: quote.currency,
    careOfferingId: careOption.offering.id, careOfferingCode: quote.careOffering.code, careOfferingName: quote.careOffering.name,
    careOptionId: careOption.id, careOptionCode: quote.careOption.code, careOptionLabel: quote.careOption.label,
    primarySpecies: quote.careOption.primarySpecies, billingUnit: quote.careOffering.billingUnit,
    scheduleKind: quote.careOffering.scheduleKind, durationMinutes: quote.careOption.durationMinutes,
    quantity, clientRateId: quote.rate.id, clientRateVersion: quote.rate.version,
    baseUnitCents, baseAggregateCents, additionalPetAggregateCents,
    clientFeeBasisPoints: quote.clientFeeBasisPoints, ...economics,
    breakdown: quote.breakdown.map((entry) => ({ ...entry, quantity, amountCents: money(entry.amountCents * quantity) })),
  };
}

// Internal transaction participant, never a public money-accepting API. The
// owner loaded catalog + quote in this same transaction. Lock the parent to
// serialize direct writers before observing the one-per-Booking snapshot.
export async function createBookingPricingSnapshotWithDb({ tx, bookingId, careOption, quote, quantity }) {
  const data = aggregateCanonicalQuote({ careOption, quote, quantity });
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { bookingPets: { orderBy: { position: "asc" } }, pricingSnapshot: true } });
  if (!booking || !booking.canonicalCreationKey || !booking.canonicalInputHash) reject("INVALID_BOOKING_CONTRACT", "A canonical Booking is required.");
  for (const field of ["careOfferingId", "careOfferingCode", "careOptionId", "careOptionCode", "billingUnit", "scheduleKind", "durationMinutes", "quantity"]) {
    if (booking[field] !== data[field]) reject("INVALID_BOOKING_CONTRACT", `Booking ${field} differs from pricing.`);
  }
  if (["clientTotalCents", "platformFeeCents", "sitterPayoutCents"].some((field) => booking[field] !== null)) reject("INVALID_BOOKING_CONTRACT", "Canonical Booking must have null legacy money.");
  if (!isDeepStrictEqual(booking.bookingPets.map((pet, position) => {
    if (pet.position !== position) reject("INVALID_BOOKING_CONTRACT", "Pet positions must be contiguous.");
    return { name: pet.nameSnapshot, species: pet.speciesSnapshot };
  }), quote.pets)) reject("INVALID_BOOKING_CONTRACT", "BookingPets differ from the quoted pets.");
  if (booking.pricingSnapshot) {
    if (!Object.entries(data).every(([key, value]) => isDeepStrictEqual(booking.pricingSnapshot[key], value))) reject("PRICING_SNAPSHOT_CONFLICT", "A different pricing contract is already committed.");
    return booking.pricingSnapshot;
  }
  const [clock] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  if (!(clock?.now instanceof Date) || !Number.isFinite(clock.now.getTime())) reject("INVALID_DATABASE_TIME", "Database time is unavailable.");
  return tx.bookingPricingSnapshot.create({ data: { bookingId, ...data, committedAt: clock.now } });
}
