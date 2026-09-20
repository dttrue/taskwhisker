import { resolveBusinessOwnerIdentityWithDb } from "../bookings/businessOwnerIdentityContract.js";

export class ScheduleError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function fail(code, message) { throw new ScheduleError(code, message); }

// One explicit policy boundary, shared by queries, quotes and writes. No browser
// supplied operator/sitter IDs or JWT role can establish ownership.
export async function scheduleAccess(db, actorId) {
  if (typeof actorId !== "string" || !actorId) fail("NOT_AUTHORIZED", "Sign in to view this schedule.");
  const owner = await resolveBusinessOwnerIdentityWithDb({ db });
  if (![owner.operatorId, owner.sitterId].includes(actorId)) fail("NOT_AUTHORIZED", "This schedule is available only to the configured business owner.");
  return { ...owner, actorId, role: actorId === owner.operatorId ? "OPERATOR" : "SITTER" };
}

export function clientScope(access) {
  return { bookings: { some: { operatorId: access.operatorId } } };
}
