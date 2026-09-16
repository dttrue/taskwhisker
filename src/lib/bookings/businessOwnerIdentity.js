import "server-only";
import { prisma } from "../db.js";
import { resolveBusinessOwnerIdentityWithDb, isBusinessOwnerSitterWithDb, resolveBusinessOwnerSelfAssignmentWithDb } from "./businessOwnerIdentityContract.js";

// Explicit arguments only. No caller config, DB, role or owner overrides.
export function resolveBusinessOwnerIdentity() {
  return resolveBusinessOwnerIdentityWithDb({ db: prisma });
}
export function isBusinessOwnerSitter(userId) {
  return isBusinessOwnerSitterWithDb({ db: prisma, userId });
}
export function resolveBusinessOwnerSelfAssignment(actorId) {
  return resolveBusinessOwnerSelfAssignmentWithDb({ db: prisma, actorId });
}
