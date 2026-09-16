// Internal database/configuration seam. Browser-facing callers must use the
// server-only service, which never accepts owner identities from its arguments.
export class BusinessOwnerIdentityError extends Error {
  constructor(code, message) { super(message); this.name = "BusinessOwnerIdentityError"; this.code = code; }
}

export function businessOwnerConfiguration() {
  return {
    operatorId: process.env.BUSINESS_OWNER_OPERATOR_USER_ID,
    sitterId: process.env.BUSINESS_OWNER_SITTER_USER_ID,
  };
}

export async function resolveBusinessOwnerIdentityWithDb({ db, configuration = businessOwnerConfiguration() } = {}) {
  const operatorId = typeof configuration?.operatorId === "string" ? configuration.operatorId.trim() : "";
  const sitterId = typeof configuration?.sitterId === "string" ? configuration.sitterId.trim() : "";
  if (!operatorId || !sitterId) throw new BusinessOwnerIdentityError("OWNER_CONFIGURATION_MISSING", "Both business owner accounts must be configured.");
  if (operatorId === sitterId || typeof db?.user?.findUnique !== "function") {
    throw new BusinessOwnerIdentityError("OWNER_CONFIGURATION_INCONSISTENT", "Business owner account configuration is inconsistent.");
  }
  const operator = await db.user.findUnique({ where: { id: operatorId }, select: { id: true, role: true } });
  if (!operator || operator.id !== operatorId || operator.role !== "OPERATOR") {
    throw new BusinessOwnerIdentityError("OWNER_OPERATOR_INVALID", "The configured business owner operator account is invalid.");
  }
  const sitter = await db.user.findUnique({ where: { id: sitterId }, select: { id: true, role: true } });
  if (!sitter || sitter.id !== sitterId || sitter.role !== "SITTER") {
    throw new BusinessOwnerIdentityError("OWNER_SITTER_INVALID", "The configured business owner sitter account is invalid.");
  }
  return Object.freeze({ operatorId, sitterId });
}

export async function isBusinessOwnerSitterWithDb({ db, userId, configuration } = {}) {
  const owner = await resolveBusinessOwnerIdentityWithDb({ db, configuration });
  return typeof userId === "string" && userId === owner.sitterId;
}

export async function resolveBusinessOwnerSelfAssignmentWithDb({ db, actorId, configuration } = {}) {
  const owner = await resolveBusinessOwnerIdentityWithDb({ db, configuration });
  if (actorId !== owner.operatorId) {
    throw new BusinessOwnerIdentityError("OWNER_OPERATOR_REQUIRED", "Only the configured business owner can assign their linked sitter account to themselves.");
  }
  return owner.sitterId;
}
