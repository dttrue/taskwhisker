import { careReadiness } from "../visitCompensation/readiness.js";
import { visitFinancialInclude } from "../visitCompensation/contract.js";
import { voidVisitAuthorization } from "../visitCompensation/writes.js";
import { resolveEffectiveBookingCompensationLane, rewardReservationMatchesHistoricalAttribution } from "../compensation/effectiveCompensationLane.js";
import { economicsInclude, isCanonicalBooking, readBookingEconomics } from "../economics/bookingEconomics.js";
import { releaseRewardReservationInTransaction, RewardReservationError } from "../../rewards/rewardReservationWrites.js";
import { isRetryableRewardTransactionError } from "../../rewards/rewardProgressGrantWrites.js";
import { createSystemMessage } from "../../messaging/createSystemMessage.js";

export const CANCELLATION_REVIEW = "CANONICAL_CANCELLATION_REQUIRES_REVIEW";
export const CANCELLATION_REVIEW_MESSAGE = "Cancellation fees, refunds, and sitter payable amounts require manual review. No financial amounts have been decided.";
const validDate = (value) => value instanceof Date && Number.isFinite(value.getTime());

// Pure classification of locked, persisted records. The clock is database time.
export function inspectCanonicalCancellation(booking, now, { waiveFee = false } = {}) {
  if (!booking) return { ok: false, status: "NOT_FOUND", reasonCode: "NOT_FOUND", error: "Booking not found." };
  const canonical = isCanonicalBooking(booking);
  const visits = booking.visits || [];
  const at = booking.status === "CANCELED" && validDate(booking.canceledAt) ? booking.canceledAt : now;
  const careStarted = visits.some((v) => v.status === "COMPLETED" || v.completedAt != null || v.performedBySitterId != null ||
    (validDate(v.startTime) && validDate(at) && v.startTime <= at));
  const base = { bookingId: booking.id, economicsKind: canonical ? "CANONICAL" : "LEGACY", careStarted,
    completedVisitCount: visits.filter((v) => v.status === "COMPLETED").length,
    compensationCommitted: Boolean(booking.sitterCompensation), rewardReservationStatus: booking.rewardReservation?.status ?? null,
    financialReviewRequired: canonical, reasonCode: canonical ? CANCELLATION_REVIEW : null };
  const review = (reviewReason) => ({ ...base, ok: false, status: CANCELLATION_REVIEW, reviewReason, error: CANCELLATION_REVIEW_MESSAGE });
  if (!canonical) return { ...base, ok: false, status: "NOT_CANONICAL", reasonCode: "NOT_CANONICAL" };
  if (booking.status === "CANCELED") return { ...base, ok: true, status: "ALREADY_CANCELED", message: CANCELLATION_REVIEW_MESSAGE };
  if (booking.status === "COMPLETED" || !["REQUESTED", "CONFIRMED"].includes(booking.status)) return { ...base, ok: false, status: "INVALID_STATUS", error: "Completed or terminal bookings cannot be canceled." };
  if (waiveFee) return review("CANONICAL_WAIVER_UNDEFINED");
  if (careStarted) return review("CARE_STARTED_OR_PERFORMED");
  if (!validDate(now) || booking.canceledAt || booking.completedAt || !visits.length || visits.length !== booking.quantity ||
      visits.some((v) => !validDate(v.startTime) || !validDate(v.endTime) || v.endTime <= v.startTime ||
        v.bookingId !== booking.id || v.operatorId !== booking.operatorId || (!booking.sitterCompensation && v.sitterId !== booking.sitterId) ||
        v.status !== (booking.status === "REQUESTED" ? "PENDING" : "CONFIRMED"))) return review("OPERATIONAL_STATE_INVALID");
  if (booking.visits.some(v => v.sitterId !== booking.sitterId) && !careReadiness(booking).ok) return review("FINANCIAL_READINESS_MISSING");
  const economics = readBookingEconomics(booking);
  if (economics.client.status !== "AVAILABLE") return review(economics.client.reason);
  if (booking.status === "REQUESTED" && booking.sitterCompensation) return review("COMPENSATION_STATUS_CONTRADICTION");
  if (booking.sitterCompensation && economics.sitter.status !== "COMMITTED") return review(economics.sitter.reason);
  if (booking.sitterCompensation === undefined || booking.rewardReservation === undefined) return review("REQUIRED_RELATION_NOT_LOADED");
  if (booking.pricingSnapshot.committedAt > now || booking.sitterCompensation?.committedAt > now) return review("COMMITMENT_TIME_INVALID");
  const r = booking.rewardReservation;
  const effective = resolveEffectiveBookingCompensationLane(booking.sitterCompensation ? { ...booking, visits: undefined } : booking, { requireVisits: !booking.sitterCompensation, allowUnassigned: true });
  if (!effective.ok) return review("ATTRIBUTION_STATE_INVALID");
  if (r && (!rewardReservationMatchesHistoricalAttribution(booking, r) ||
      (r.status !== "RELEASED" && (effective.compensationLane !== "SITTER_ORIGINATED" || r.sitterId !== booking.sitterId)) ||
      !validDate(r.reservedAt) || r.reservedAt > now ||
      !["RESERVED", "RELEASED", "CONSUMED"].includes(r.status) ||
      (r.status === "RESERVED" && (r.consumedAt !== null || r.releasedAt !== null)) ||
      (r.status === "RELEASED" && (!validDate(r.releasedAt) || r.releasedAt > now || r.consumedAt !== null)) ||
      (r.status === "CONSUMED" && (!validDate(r.consumedAt) || r.consumedAt > now || r.releasedAt !== null)))) return review("REWARD_STATE_INVALID");
  if (r?.status === "CONSUMED" && !booking.sitterCompensation) return review("CONSUMED_WITHOUT_COMPENSATION");
  return { ...base, ok: true, status: "CANCELED", releaseReservation: r?.status === "RESERVED" && !booking.sitterCompensation,
    message: `Booking canceled operationally. ${CANCELLATION_REVIEW_MESSAGE}` };
}

class CancellationRollback extends Error {
  constructor(outcome) { super(outcome.reviewReason || outcome.status); this.outcome = outcome; }
}
async function clock(tx) {
  const [row] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  return row?.now;
}
const include = { ...economicsInclude, visits: { orderBy: { id: "asc" }, include: visitFinancialInclude }, rewardReservation: { include: { grant: true } } };

// No fee, refund, compensation or caller clock enters this server-internal API.
export async function cancelCanonicalBookingWithDb({ db, bookingId, actorId, reason = "", requireClientRequest = false, waiveFee = false } = {}) {
  if (typeof bookingId !== "string" || !bookingId.trim() || typeof actorId !== "string" || !actorId.trim()) return { ok: false, status: "INVALID_INPUT", error: "Booking and actor are required." };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Visit" WHERE "bookingId" = ${bookingId} ORDER BY id FOR UPDATE`;
        let booking = await tx.booking.findUnique({ where: { id: bookingId }, include });
        if (!booking) return inspectCanonicalCancellation(null);
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
        if (!actor || (actor.role !== "OPERATOR" && !(actor.role === "SITTER" && booking.sitterId === actorId))) return { ok: false, status: "NOT_AUTHORIZED", error: "Only an operator or the assigned sitter may cancel this booking." };
        // Standalone reward transitions lock the account and never subsequently
        // lock Booking. Taking it here cannot invert their lock ordering.
        if (booking.rewardReservation) {
          const sitterId = booking.rewardReservation.sitterId;
          await tx.$queryRaw`SELECT id FROM "SitterRewardAccount" WHERE "sitterId" = ${sitterId} FOR UPDATE`;
          if (!await tx.sitterRewardAccount.findUnique({ where: { sitterId } })) return { ok: false, status: CANCELLATION_REVIEW, reasonCode: CANCELLATION_REVIEW, reviewReason: "REWARD_ACCOUNT_MISSING", error: CANCELLATION_REVIEW_MESSAGE };
          booking = await tx.booking.findUnique({ where: { id: bookingId }, include });
        }
        const now = await clock(tx);
        const outcome = inspectCanonicalCancellation(booking, now, { waiveFee });
        if (!outcome.ok || outcome.status === "ALREADY_CANCELED") return outcome;
        const normalizedReason = typeof reason === "string" ? reason.trim().slice(0, 1000) : "";
        if (requireClientRequest || actor.role === "SITTER") {
          const request = await tx.message.findFirst({ where: { conversation: { bookingId }, senderType: "CLIENT", body: { startsWith: "Cancellation request:", mode: "insensitive" } }, select: { id: true } });
          if (!request) return { ...outcome, ok: false, status: "REQUEST_REQUIRED", error: "No client cancellation request was found." };
        } else if (!normalizedReason) return { ...outcome, ok: false, status: "REASON_REQUIRED", error: "A cancellation reason is required." };
        // Only operational columns. Legacy fee/waiver/review columns stay untouched.
        await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELED", canceledAt: now } });
        await tx.visit.updateMany({ where: { bookingId, status: { in: ["PENDING", "CONFIRMED"] }, completedAt: null, performedBySitterId: null, startTime: { gt: now } }, data: { status: "CANCELED" } });
        for (const visit of booking.visits) await voidVisitAuthorization(tx, { visit, actorUserId: actorId, reason: "CANCELED_UNPERFORMED", operationId: `cancel:${bookingId}` });
        let rewardReservationStatus = outcome.rewardReservationStatus;
        if (outcome.releaseReservation) {
          const released = await releaseRewardReservationInTransaction({ tx, bookingId, reason: "Canonical pre-service operational cancellation; no committed compensation or performed care." });
          if (released.status !== "RELEASED") throw new CancellationRollback({ ...outcome, ok: false, status: CANCELLATION_REVIEW, reviewReason: "REWARD_RELEASE_CONFLICT", error: CANCELLATION_REVIEW_MESSAGE });
          rewardReservationStatus = "RELEASED";
        }
        await tx.bookingHistory.create({ data: { bookingId, fromStatus: booking.status, toStatus: "CANCELED", changedByUserId: actorId,
          note: `Canonical operational cancellation. ${normalizedReason || "Approved client cancellation request."} [${CANCELLATION_REVIEW}] ${CANCELLATION_REVIEW_MESSAGE}` } });
        await createSystemMessage({ tx, bookingId, body: `Booking canceled before care started. ${CANCELLATION_REVIEW_MESSAGE}` });
        // If lock/DB work crossed care start, roll EVERYTHING back, including release.
        const after = inspectCanonicalCancellation(booking, await clock(tx), { waiveFee });
        if (!after.ok) throw new CancellationRollback(after);
        return { ...outcome, rewardReservationStatus, clientLinkToken: booking.clientLinkToken };
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof CancellationRollback) return error.outcome;
      if (isRetryableRewardTransactionError(error) && attempt < 2) continue;
      if (isRetryableRewardTransactionError(error)) return { ok: false, status: "CANCELLATION_TRANSACTION_CONFLICT", error: "Cancellation conflicted with another update. Please retry." };
      if (error instanceof RewardReservationError) return { ok: false, status: CANCELLATION_REVIEW, reasonCode: CANCELLATION_REVIEW, reviewReason: error.code, error: CANCELLATION_REVIEW_MESSAGE };
      return { ok: false, status: "CANCELLATION_PERSISTENCE_ERROR", error: "Cancellation could not be saved. Please retry." };
    }
  }
}
