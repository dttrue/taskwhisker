import { resolveEffectiveBookingCompensationLane, rewardReservationMatchesHistoricalAttribution } from "../compensation/effectiveCompensationLane.js";
// Frozen accounting read boundary. No rate lookup, quote engine, or writes.
const moneyFields = ["clientTotalCents", "platformFeeCents", "sitterPayoutCents"];
const money = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const text = (value) => typeof value === "string" && Boolean(value.trim());
const date = (value) => value != null && Number.isFinite(new Date(value).getTime());
export const economicsInclude = {
  pricingSnapshot: true,
  sitterCompensation: true,
  attributionSnapshot: true,
  rewardReservation: { select: { id: true, bookingId: true, sitterId: true, grantId: true, status: true, consumedAt: true, grant: { select: { id: true, sitterId: true, rewardLevel: true, feeBasisPoints: true } } } },
};
export const economicsSelect = {
  id: true, sitterId: true, canonicalCreationKey: true, canonicalInputHash: true,
  careOptionId: true, careOfferingId: true, careOptionCode: true, careOfferingCode: true,
  quantity: true, billingUnit: true, scheduleKind: true, durationMinutes: true,
  clientTotalCents: true, platformFeeCents: true, sitterPayoutCents: true,
  ...economicsInclude,
};
export function isCanonicalBooking(booking) {
  return Boolean(booking.pricingSnapshot || booking.sitterCompensation || booking.canonicalCreationKey ||
    booking.canonicalInputHash || booking.careOptionId || booking.careOfferingId || booking.careOptionCode ||
    booking.careOfferingCode || booking.quantity != null || booking.billingUnit || booking.scheduleKind);
}
function unavailable(reason) {
  return { status: "UNAVAILABLE", reason, totalCents: null, subtotalCents: null, feeCents: null,
    payoutCents: null, currency: null, compensationLane: null, rewardApplied: null };
}
export function readBookingEconomics(booking) {
  // Projected UI DTOs carry the same normalized contract, never remapped Booking columns.
  if (booking.economics) return booking.economics;
  if (!isCanonicalBooking(booking)) {
    const valid = moneyFields.every((key) => money(booking[key]));
    return { economicsKind: "LEGACY",
      client: valid ? { status: "AVAILABLE", totalCents: booking.clientTotalCents, subtotalCents: null, feeCents: null, currency: "USD" } : unavailable("LEGACY_MONEY_UNAVAILABLE"),
      sitter: valid ? { status: "COMMITTED", payoutCents: booking.sitterPayoutCents, subtotalCents: null, feeCents: null, currency: "USD", compensationLane: null, rewardApplied: null } : unavailable("LEGACY_MONEY_UNAVAILABLE"),
      legacyPlatformFeeCents: valid ? booking.platformFeeCents : null,
    };
  }
  const p = booking.pricingSnapshot;
  let reason = !p ? "PRICING_SNAPSHOT_REQUIRED" : null;
  if (p && (["canonicalCreationKey", "canonicalInputHash", "careOptionId", "careOfferingId", "careOptionCode", "careOfferingCode"].some((key) => !text(booking[key])) || moneyFields.some((key) => booking[key] !== null) || p.bookingId !== booking.id ||
      p.economicsVersion !== 1 || !Number.isInteger(p.clientRateVersion) || p.clientRateVersion < 1 || p.currency !== "USD" || !date(p.committedAt) ||
      !Number.isInteger(p.quantity) || p.quantity < 1 ||
      ["quantity", "billingUnit", "scheduleKind", "durationMinutes", "careOptionCode", "careOfferingCode"].some((key) => p[key] !== booking[key]) ||
      ["careOptionId", "careOfferingId"].some((key) => p[key] != null && p[key] !== booking[key]) ||
      ["baseUnitCents", "baseAggregateCents", "additionalPetAggregateCents", "serviceSubtotalCents", "clientFeeCents", "clientTotalCents"].some((key) => !money(p[key])) ||
      p.baseUnitCents * p.quantity !== p.baseAggregateCents || p.baseAggregateCents + p.additionalPetAggregateCents !== p.serviceSubtotalCents ||
      p.serviceSubtotalCents + p.clientFeeCents !== p.clientTotalCents)) reason = "PRICING_SNAPSHOT_INVALID";
  if (reason) return { economicsKind: "CANONICAL", client: unavailable(reason), sitter: unavailable(reason), legacyPlatformFeeCents: null };
  const client = { status: "AVAILABLE", totalCents: p.clientTotalCents, subtotalCents: p.serviceSubtotalCents, feeCents: p.clientFeeCents, currency: p.currency };
  const c = booking.sitterCompensation, a = booking.attributionSnapshot, r = booking.rewardReservation;
  const owner = c?.performerPolicy === "OWNER_OPERATOR";
  const policyValid = c && (c.performerPolicy == null && c.feePolicy == null ||
    c.performerPolicy === "ORDINARY" && c.feePolicy === (c.rewardApplied ? "REWARD_5_PERCENT" : "STANDARD_10_PERCENT") ||
    owner && c.feePolicy === "OWNER_0_PERCENT");
  const effective = c ? resolveEffectiveBookingCompensationLane(booking) : null;
  let sitter;
  if (c === undefined) sitter = unavailable("COMPENSATION_RELATION_NOT_LOADED");
  else if (!c) sitter = { ...unavailable("COMPENSATION_NOT_COMMITTED"), status: "PENDING", currency: p.currency };
  else if (r === undefined || c.bookingId !== booking.id || c.sitterId !== booking.sitterId || c.currency !== p.currency ||
      c.quantity !== p.quantity || !date(c.committedAt) || !a || a.bookingId !== booking.id ||
      !effective.ok || !["BUSINESS_ASSIGNED", "SITTER_ORIGINATED"].includes(c.compensationLane) ||
      ["sitterCompensationSubtotalCents", "sitterFeeCents", "sitterPayoutCents"].some((key) => !money(c[key])) ||
      c.sitterFeeCents + c.sitterPayoutCents !== c.sitterCompensationSubtotalCents ||
      typeof c.rewardApplied !== "boolean" || !policyValid ||
      (owner && (c.rateSource !== "OWNER_FROZEN_CLIENT_SERVICE" || c.clientServiceSubtotalCents !== p.serviceSubtotalCents || c.sitterCompensationSubtotalCents !== p.serviceSubtotalCents || c.sitterFeeBasisPoints !== 0 || c.sitterFeeCents !== 0 || c.sitterPayoutCents !== p.serviceSubtotalCents || c.sourceRateId !== null || c.rateVersion !== null || c.rewardApplied || c.rewardReservationId !== null || c.rewardGrantId !== null || c.rewardLevel !== null || (r && (r.status !== "RELEASED" || !rewardReservationMatchesHistoricalAttribution(booking, r))))) ||
      (!owner && c.compensationLane === "SITTER_ORIGINATED" && (c.rateSource !== "CANONICAL_CLIENT_SERVICE_SUBTOTAL" || c.sourceRateId !== null || c.rateVersion !== null || a.referringSitterId !== c.sitterId || a.requestedSitterId !== c.sitterId || c.clientServiceSubtotalCents !== p.serviceSubtotalCents || c.sitterCompensationSubtotalCents !== p.serviceSubtotalCents)) ||
      (!owner && c.compensationLane === "BUSINESS_ASSIGNED" && (!["SITTER_OVERRIDE", "DEFAULT_RATE"].includes(c.rateSource) || !text(c.sourceRateId) || !Number.isInteger(c.rateVersion) || c.rateVersion < 1 || c.clientBaseAggregateCents !== p.baseAggregateCents || (r && (r.status !== "RELEASED" || !rewardReservationMatchesHistoricalAttribution(booking, r))) || c.rewardApplied)) ||
      (c.rewardApplied ? (c.sitterFeeBasisPoints !== 500 || !Number.isInteger(c.rewardLevel) || c.rewardLevel < 1 || !r || !r.grant || r.grant.id !== c.rewardGrantId || r.grant.sitterId !== c.sitterId || r.grant.rewardLevel !== c.rewardLevel || r.grant.feeBasisPoints !== c.sitterFeeBasisPoints || r.status !== "CONSUMED" || r.id !== c.rewardReservationId || r.grantId !== c.rewardGrantId || r.sitterId !== c.sitterId || r.bookingId !== booking.id || !date(r.consumedAt) || +new Date(r.consumedAt) !== +new Date(c.committedAt)) :
        (!owner && c.sitterFeeBasisPoints !== 1000 || c.rewardReservationId != null || c.rewardGrantId != null || c.rewardLevel != null || (r && r.status !== "RELEASED")))) {
    sitter = unavailable("COMPENSATION_SNAPSHOT_INVALID");
  } else sitter = { status: "COMMITTED", payoutCents: c.sitterPayoutCents, subtotalCents: c.sitterCompensationSubtotalCents,
    feeCents: c.sitterFeeCents, currency: c.currency, compensationLane: c.compensationLane, rewardApplied: c.rewardApplied };
  return { economicsKind: "CANONICAL", client, sitter, legacyPlatformFeeCents: null };
}
export function formatFinancialCents(cents, currency = "USD", missing = "Unavailable") {
  if (!Number.isSafeInteger(cents)) return missing;
  return currency === "USD" ? `$${(cents / 100).toFixed(2)}` : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
export function clientTotalDisplay(booking, legacyFormat = formatFinancialCents) {
  const e = readBookingEconomics(booking);
  if (e.client.status !== "AVAILABLE") return "Unavailable";
  if (e.economicsKind === "LEGACY") return legacyFormat(e.client.totalCents);
  return formatFinancialCents(e.client.totalCents, e.client.currency);
}
export function sitterPayoutDisplay(booking) {
  const { sitter } = readBookingEconomics(booking);
  return formatFinancialCents(sitter.payoutCents, sitter.currency, sitter.status === "PENDING" ? "Pending" : "Unavailable");
}
// Canonical per-Visit earnings/allocation are undefined in V1, even when committed.
export function visitPayoutStatus(booking) {
  const e = readBookingEconomics(booking);
  return e.economicsKind === "LEGACY" ? "LEGACY" : e.sitter.status === "PENDING" ? "PENDING" : "UNAVAILABLE";
}
export function visitPayoutEstimate(booking, visitCount, { round = true } = {}) {
  const e = readBookingEconomics(booking);
  if (e.economicsKind === "CANONICAL" || e.sitter.status !== "COMMITTED" || visitCount < 1) return null;
  const amount = e.sitter.payoutCents / visitCount;
  return round ? Math.round(amount) : amount;
}
export function sumKnownAmounts(values) {
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) && Math.abs(total) <= Number.MAX_SAFE_INTEGER ? total : null;
}
export function aggregateBookingAmounts(bookings, side = "client") {
  if (!["client", "sitter"].includes(side)) throw new Error("Unsupported financial metric.");
  const views = bookings.map(readBookingEconomics);
  const available = views.filter((e) => e[side].status === (side === "client" ? "AVAILABLE" : "COMMITTED"));
  const pendingCount = views.filter((e) => e[side].status === "PENDING").length;
  const unavailableCount = views.length - available.length - pendingCount;
  const knownTotalCents = sumKnownAmounts(available.map((e) => e[side][side === "client" ? "totalCents" : "payoutCents"]));
  return { totalCents: pendingCount || unavailableCount ? null : knownTotalCents, knownTotalCents, pendingCount, unavailableCount };
}
export function cancellationGuard(booking) {
  if (isCanonicalBooking(booking)) return { ok: false, reason: "CANONICAL_CANCELLATION_REQUIRES_REVIEW", error: "Canonical cancellation requires manual review; cancellation and refund policy is not defined." };
  if (readBookingEconomics(booking).client.status !== "AVAILABLE") return { ok: false, reason: "LEGACY_MONEY_UNAVAILABLE", error: "Booking money is unavailable. Manual review is required." };
  return { ok: true };
}
export function completionGuard(booking, { legacyInvariant = true } = {}) {
  const e = readBookingEconomics(booking);
  if (e.economicsKind === "CANONICAL") {
    if (e.client.status !== "AVAILABLE") return { ok: false, code: e.client.reason, error: "Canonical pricing is unavailable. Booking completion requires manual review." };
    if (e.sitter.status !== "COMMITTED") return { ok: false, code: "COMPENSATION_REQUIRED_FOR_COMPLETION", error: "Valid sitter compensation is required for booking completion. Manual review is required." };
    if (booking.visits && (booking.visits.length !== booking.quantity || booking.visits.some((v) => v.sitterId !== booking.sitterId || (v.performedBySitterId && v.performedBySitterId !== booking.sitterId)))) return { ok: false, code: "COMPENSATION_REQUIRED_FOR_COMPLETION", error: "Compensation and visit assignment disagree. Manual review is required." };
  } else if (e.client.status !== "AVAILABLE" || (legacyInvariant && booking.platformFeeCents + booking.sitterPayoutCents !== booking.clientTotalCents)) {
    return { ok: false, code: "LEGACY_PAYMENT_INCONSISTENT", error: "Payment breakdown is inconsistent (total != fee + payout). Please review this booking." };
  }
  return { ok: true };
}

// Pending compensation before care is normal. Flag manual review once operations
// are finished and the nonterminal Booking cannot pass its financial gate.
export function bookingCompletionReview(booking) {
  if (["COMPLETED", "CANCELED"].includes(booking.status) || !booking.visits?.length ||
      booking.visits.some((v) => !["COMPLETED", "CANCELED"].includes(v.status))) return null;
  const gate = completionGuard(booking, { legacyInvariant: false });
  return gate.ok ? null : gate;
}
