import { visitFinancialInclude } from "../visitCompensation/contract.js";
import { careReadiness } from "../visitCompensation/readiness.js";
import { allocateCompletedVisit, recordFinancialReview } from "../visitCompensation/writes.js";
import { economicsInclude, completionGuard, isCanonicalBooking } from "./bookingEconomics.js";
import { buildOperatorCompletionData, buildSitterCompletionData, resolveSitterCompletionOutcome } from "../../visits/visitPerformerAttribution.js";

async function transaction(db, work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (!["P2034", "40001", "40P01"].includes(error.code) && !(error.code === "P2010" && ["40001", "40P01"].includes(error.meta?.code))) throw error;
      if (attempt === 2) return { ok: false, code: "COMPLETION_TRANSACTION_CONFLICT", error: "Completion conflicted with another update. Please retry." };
    }
  }
}
async function loadLockedBooking(tx, bookingId) {
  await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Visit" WHERE "bookingId" = ${bookingId} ORDER BY id FOR UPDATE`;
  return tx.booking.findUnique({ where: { id: bookingId }, include: { ...economicsInclude, visits: { include: visitFinancialInclude } } });
}
export function blockedBookingCompletion(booking) {
  const gate = completionGuard(booking, { legacyInvariant: false });
  return gate.ok ? {} : { completionBlocked: true, code: gate.code, bookingCompletion: gate };
}
async function markBookingCompleted(tx, booking, actorId, now, note) {
  await tx.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED", completedAt: now } });
  await tx.bookingHistory.create({ data: { bookingId: booking.id, fromStatus: booking.status, toStatus: "COMPLETED", changedByUserId: actorId, note } });
}
export async function completeWholeBookingWithDb({ db, bookingId, actorId }) {
  return transaction(db, async (tx) => {
    const booking = await loadLockedBooking(tx, bookingId);
    if (!booking) return { ok: false, error: "Booking not found." };
    if (booking.status === "CANCELED") return { ok: false, error: "Cannot complete a canceled booking." };
    if (booking.status === "COMPLETED") return { ok: false, error: "Booking is already completed." };
    if (booking.status !== "CONFIRMED") return { ok: false, error: `Only CONFIRMED bookings can be completed (current: ${booking.status}).` };
    if (!booking.visits.length || booking.visits.some((v) => v.status !== "COMPLETED")) return { ok: false, error: "All visits must be completed before the booking can be completed." };
    const gate = completionGuard(booking);
    if (!gate.ok) return gate;
    await markBookingCompleted(tx, booking, actorId, new Date(), "Operator marked booking complete");
    return { ok: true };
  });
}
export async function completeVisitWithDb({ db, visitId, actorId, actorRole, lateReason = "", now = new Date() }) {
  if (!["SITTER", "OPERATOR"].includes(actorRole)) return { ok: false, error: "Not authorized." };
  return transaction(db, async (tx) => {
    const identity = await tx.visit.findUnique({ where: { id: visitId }, select: { bookingId: true } });
    if (!identity) return { ok: false, error: "Visit not found." };
    const booking = await loadLockedBooking(tx, identity.bookingId);
    const visit = booking?.visits.find((v) => v.id === visitId);
    if (!visit) return { ok: false, error: "Visit not found." };
    if (actorRole === "SITTER") {
      const outcome = resolveSitterCompletionOutcome(visit, actorId);
      if (!["COMPLETE", "ALREADY_COMPLETED"].includes(outcome)) return { ok: false, error: outcome === "NOT_AUTHORIZED" ? "Not authorized for this visit." : outcome === "PERFORMER_CONFLICT" ? "This visit was already completed by another sitter." : "Only confirmed visits can be marked complete." };
    }
    const canonical = isCanonicalBooking(booking);
    if (actorRole === "SITTER" && canonical) {
      const readiness = careReadiness(booking, visitId);
      if (!readiness.ok) {
        await recordFinancialReview(tx, { visit, actorUserId: actorId, reason: "FINANCIAL_READINESS_MISSING" });
        return readiness;
      }
    }
    // A retry reports the same financial block without rewriting operational history.
    if (visit.status === "COMPLETED") {
      const finance = canonical ? await allocateCompletedVisit(tx, { booking, visit, actorUserId: actorId }) : {};
      return { ok: true, alreadyCompleted: true, bookingId: booking.id, ...finance, ...blockedBookingCompletion(booking) };
    }
    if (visit.status !== "CONFIRMED") return { ok: false, error: "Only confirmed visits can be completed." };
    const missed = visit.endTime && new Date(visit.endTime) < now;
    if (actorRole === "SITTER") {
      if (new Date(visit.startTime) > now) return { ok: false, error: "This visit cannot be completed before it starts." };
      if (missed && lateReason.length < 10) return { ok: false, error: "Please explain why this missed visit is being completed late." };
    }
    if (actorRole === "SITTER" && visit.performedBySitterId) return { ok: false, error: "Only confirmed visits can be marked complete." };
    const data = actorRole === "SITTER" ? buildSitterCompletionData(actorId, now) : buildOperatorCompletionData(now);
    await tx.visit.update({ where: { id: visitId }, data });
    Object.assign(visit, data);
    if (actorRole === "SITTER") await tx.bookingHistory.create({ data: { bookingId: booking.id, fromStatus: null, toStatus: null, changedByUserId: actorId,
      note: missed ? `Sitter completed missed visit late. Reason: ${lateReason}` : "Sitter completed visit." } });
    const finance = canonical ? await allocateCompletedVisit(tx, { booking, visit, actorUserId: actorId }) : {};
    const allDone = booking.visits.every((v) => ["COMPLETED", "CANCELED"].includes(v.status));
    if (allDone && !["COMPLETED", "CANCELED"].includes(booking.status)) {
      const blocked = blockedBookingCompletion(booking);
      if (blocked.completionBlocked) return { ok: true, bookingId: booking.id, ...finance, ...blocked };
      await markBookingCompleted(tx, booking, actorId, now, actorRole === "SITTER" ? "Auto-completed after all visits finished." : "Operator completed overdue visit and auto-completed booking.");
    }
    return { ok: true, bookingId: booking.id, ...finance };
  });
}
