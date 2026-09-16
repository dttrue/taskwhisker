import { visitFinancialInclude } from "../bookings/visitCompensation/contract.js";
import { voidVisitAuthorization, financialDatabaseTime } from "../bookings/visitCompensation/writes.js";
import { isRetryableRewardTransactionError } from "../rewards/rewardProgressGrantWrites.js";

export async function reviewMissedVisitWithDb({ db, visitId, actorId, status, note }) {
  if (!["EXCUSED", "SITTER_FAULT", "NEEDS_FOLLOW_UP"].includes(status)) return { ok: false, error: "Invalid review status." };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const identity = await tx.visit.findUnique({ where: { id: visitId }, select: { bookingId: true } });
        if (!identity) return { ok: false, error: "Visit not found." };
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${identity.bookingId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Visit" WHERE id = ${visitId} FOR UPDATE`;
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
        if (actor?.role !== "OPERATOR") return { ok: false, error: "Not authorized." };
        const visit = await tx.visit.findUnique({ where: { id: visitId }, include: visitFinancialInclude });
        const now = await financialDatabaseTime(tx);
        if (visit.status !== "CONFIRMED" || visit.completedAt || visit.performedBySitterId || visit.compensationAllocation) return { ok: false, code: "VISIT_NO_LONGER_REVIEWABLE", error: "Only unresolved confirmed visits can be reviewed." };
        if (!visit.endTime || visit.endTime >= now) return { ok: false, error: "This visit is not overdue yet." };
        const changed = await tx.visit.updateMany({ where: { id: visitId, status: "CONFIRMED", completedAt: null, performedBySitterId: null }, data: { status: "CANCELED" } });
        if (changed.count !== 1) throw new Error("Visit changed under review lock.");
        await voidVisitAuthorization(tx, { visit, actorUserId: actorId, reason: "MISSED_UNPERFORMED", operationId: `missed:${visitId}` });
        await tx.bookingHistory.create({ data: { bookingId: visit.bookingId, changedByUserId: actorId,
          note: note || "Operator reviewed overdue missed visit.", missedVisitReviewStatus: status,
          missedVisitReviewedAt: now, missedVisitReviewedById: actorId, missedVisitReviewNote: note || null } });
        return { ok: true, bookingId: visit.bookingId };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isRetryableRewardTransactionError(error) && attempt < 2) continue;
      return { ok: false, code: "MISSED_VISIT_REVIEW_CONFLICT", error: "Visit review conflicted with another update. Please retry." };
    }
  }
}
