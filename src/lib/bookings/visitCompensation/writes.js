import { careReadiness } from "./readiness.js";
import { createHash } from "node:crypto";
import { activeAuthorization, authorizationValid } from "./contract.js";

export async function financialDatabaseTime(tx) {
  const [row] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  if (!(row?.now instanceof Date) || !Number.isFinite(+row.now)) throw new Error("Financial database time unavailable.");
  return row.now;
}
export async function recordFinancialReview(tx, { visit, reason, actorUserId, authorization = activeAuthorization(visit) }) {
  const evidenceKey = createHash("sha256").update(JSON.stringify([authorization?.id ?? null, visit.performedBySitterId ?? null, visit.status, visit.completedAt])).digest("hex");
  const existing = await tx.visitFinancialReview.findUnique({ where: { visitId_reason_evidenceKey: { visitId: visit.id, reason, evidenceKey } } });
  if (existing) return existing;
  return tx.visitFinancialReview.create({ data: { visitId: visit.id, reason, evidenceKey,
    authorizationId: authorization?.id ?? null, performedBySitterId: visit.performedBySitterId ?? null,
    actorUserId, operationId: `completion:${visit.id}`, recordedAt: await financialDatabaseTime(tx) } });
}
// Only called with Booking/Visits locked, in the operational completion transaction.
export async function allocateCompletedVisit(tx, { booking, visit, actorUserId }) {
  const existing = await tx.visitSitterCompensationAllocation.findUnique({ where: { visitId: visit.id } });
  if (existing) return { allocation: existing };
  if (visit.status !== "COMPLETED" || !visit.completedAt) return { allocation: null };
  const authorization = activeAuthorization(visit);
  const reason = !visit.performedBySitterId ? "PERFORMER_REQUIRED_FOR_ALLOCATION"
    : !authorization ? (visit.compensationAuthorizations?.length ? "AUTHORIZATION_INVALID" : "AUTHORIZATION_MISSING")
    : authorization.sitterId !== visit.performedBySitterId ? "PERFORMER_AUTHORIZATION_MISMATCH"
    : (!authorizationValid(booking, visit, authorization) || !careReadiness(booking, visit.id).ok) ? "AUTHORIZATION_INVALID" : null;
  if (reason) return { allocation: null, financialReview: await recordFinancialReview(tx, { visit, reason, actorUserId, authorization }) };
  const data = { visitId: visit.id, authorizationId: authorization.id, performedBySitterId: visit.performedBySitterId,
    allocatedAt: await financialDatabaseTime(tx) };
  for (const key of ["compensationLane", "performerPolicy", "feePolicy", "currency", "sitterCompensationSubtotalCents", "sitterFeeBasisPoints", "sitterFeeCents", "sitterPayoutCents", "rewardReservationId", "rewardGrantId"]) data[key] = authorization[key];
  return { allocation: await tx.visitSitterCompensationAllocation.create({ data }) };
}
export async function voidVisitAuthorization(tx, { visit, actorUserId, reason, operationId }) {
  const authorization = activeAuthorization(visit);
  if (!authorization || visit.performedBySitterId || visit.completedAt || visit.compensationAllocation) return;
  await tx.visitCompensationAuthorizationVoid.create({ data: { authorizationId: authorization.id, actorUserId, reason, operationId, voidedAt: await financialDatabaseTime(tx) } });
}
