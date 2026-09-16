import { createHash } from "node:crypto";
import { activeAuthorization, authorizationValid, reject } from "../visitCompensation/contract.js";
import { careReadiness } from "../visitCompensation/readiness.js";
import { validateVisitIntervals } from "../confirmation/confirmationContract.js";

export function normalizeHandoff({ bookingId, visitIds, sitterId, actorId, operationId, reason = "" }) {
  if ([bookingId, sitterId, actorId, operationId].some(v => typeof v !== "string" || !v.trim() || v.length > 200) ||
      !Array.isArray(visitIds) || !visitIds.length || visitIds.length > 366 ||
      visitIds.some(v => typeof v !== "string" || !v.trim()) || new Set(visitIds).size !== visitIds.length ||
      typeof reason !== "string" || reason.length > 1000) reject("INVALID_HANDOFF_INPUT");
  const input = { bookingId, visitIds: [...visitIds].sort(), sitterId, actorId, operationId: `handoff:${operationId}`, reason: reason.trim() };
  return { ...input, fingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex") };
}
export function validateHandoff(booking, input, now) {
  if (!booking || booking.status !== "CONFIRMED" || booking.canceledAt || booking.completedAt) reject("HANDOFF_REQUIRES_CONFIRMED_BOOKING");
  if (!careReadiness(booking).ok) reject("FINANCIAL_READINESS_MISSING");
  const selected = input.visitIds.map(id => booking.visits.find(v => v.id === id));
  if (selected.some(v => !v || v.bookingId !== booking.id || v.operatorId !== booking.operatorId ||
      v.status !== "CONFIRMED" || v.completedAt || v.performedBySitterId || v.compensationAllocation || !v.sitterId ||
      !authorizationValid(booking, v, activeAuthorization(v)))) reject("VISIT_NOT_HANDOFF_ELIGIBLE");
  validateVisitIntervals(selected);
  if (!(now instanceof Date) || !Number.isFinite(+now) || selected.some(v => v.startTime <= now)) reject("HANDOFF_AFTER_START_REQUIRES_REVIEW");
  if (selected.some(v => v.sitterId === input.sitterId)) reject("HANDOFF_ALREADY_ASSIGNED");
  const candidates = [...selected, ...booking.visits.filter(v => !input.visitIds.includes(v.id) && v.sitterId === input.sitterId && ["PENDING", "CONFIRMED"].includes(v.status))].sort((a,b) => a.startTime - b.startTime);
  if (candidates.some((v,i) => i && v.startTime < candidates[i-1].endTime)) reject("SITTER_UNAVAILABLE");
  return selected;
}
