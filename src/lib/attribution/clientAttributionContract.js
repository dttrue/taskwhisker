import {
  normalizeEmail,
  normalizePhone,
} from "../blocklist/normalizeBlockedClientInput.js";

export const ATTRIBUTION_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT",
  CLIENT_NOT_FOUND: "CLIENT_NOT_FOUND",
  CLIENT_ORIGIN_CONFLICT: "CLIENT_ORIGIN_CONFLICT",
  CLIENT_IDENTITY_AMBIGUOUS: "CLIENT_IDENTITY_AMBIGUOUS",
  REFERRING_SITTER_NOT_FOUND: "REFERRING_SITTER_NOT_FOUND",
  INVALID_REFERRING_SITTER: "INVALID_REFERRING_SITTER",
  REQUESTED_SITTER_NOT_FOUND: "REQUESTED_SITTER_NOT_FOUND",
  INVALID_REQUESTED_SITTER: "INVALID_REQUESTED_SITTER",
  OPERATOR_REQUIRED: "OPERATOR_REQUIRED",
  CORRECTION_REASON_REQUIRED: "CORRECTION_REASON_REQUIRED",
  ATTRIBUTION_SNAPSHOT_CONFLICT: "ATTRIBUTION_SNAPSHOT_CONFLICT",
  INVALID_ATTRIBUTION_STATE: "INVALID_ATTRIBUTION_STATE",
});

export const CLIENT_IDENTITY_STATUS = Object.freeze({
  NEW: "NEW",
  EXISTING: "EXISTING",
});

const CLIENT_ORIGIN_KINDS = new Set(["BUSINESS", "SITTER_REFERRAL"]);
const ATTRIBUTION_SOURCES = new Set([
  "BUSINESS_DEFAULT",
  "REFERRAL_LINK",
  "OPERATOR_VERIFIED",
]);

export class AttributionContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AttributionContractError";
    this.code = code;
  }
}

function reject(code, message) {
  throw new AttributionContractError(code, message);
}

function normalizeRequiredId(value, label = "id") {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    reject(ATTRIBUTION_ERROR_CODES.INVALID_INPUT, `${label} is required.`);
  }
  return normalized;
}

function normalizeOptionalId(value) {
  if (value == null) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeFrozenName(value) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

export function normalizeClientIdentity(input = {}) {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (!email && !phone) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_INPUT,
      "At least one client email or phone number is required.",
    );
  }
  return { email: email || null, phone: phone || null };
}

export function resolveClientIdentityCandidates({ candidates, email, phone }) {
  const identity = normalizeClientIdentity({ email, phone });
  const matchesById = new Map();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate?.id) continue;
    const emailMatches = Boolean(
      identity.email && normalizeEmail(candidate.email) === identity.email,
    );
    const phoneMatches = Boolean(
      identity.phone && normalizePhone(candidate.phone) === identity.phone,
    );
    if (emailMatches || phoneMatches) matchesById.set(candidate.id, candidate);
  }

  const matches = [...matchesById.values()];
  if (matches.length > 1) {
    reject(
      ATTRIBUTION_ERROR_CODES.CLIENT_IDENTITY_AMBIGUOUS,
      "Client identity matches multiple records and requires operator review.",
    );
  }

  if (matches.length === 1) {
    return {
      status: CLIENT_IDENTITY_STATUS.EXISTING,
      client: matches[0],
      identity,
    };
  }

  return { status: CLIENT_IDENTITY_STATUS.NEW, client: null, identity };
}

export function resolveClientOriginIntent({
  identityResolution,
  verifiedReferral = null,
}) {
  if (!identityResolution || !Object.values(CLIENT_IDENTITY_STATUS).includes(
    identityResolution.status,
  )) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_INPUT,
      "A server-resolved client identity is required.",
    );
  }

  if (identityResolution.status === CLIENT_IDENTITY_STATUS.EXISTING) {
    const existingOrigin = identityResolution.client?.origin ?? null;
    if (existingOrigin) {
      if (
        verifiedReferral &&
        (existingOrigin.kind !== "SITTER_REFERRAL" ||
          existingOrigin.source !== verifiedReferral.source ||
          existingOrigin.referringSitterId !== verifiedReferral.sitterId)
      ) {
        reject(
          ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
          "The verified referral conflicts with the client's authoritative origin.",
        );
      }
      return Object.freeze({
        clientStatus: CLIENT_IDENTITY_STATUS.EXISTING,
        kind: existingOrigin.kind,
        source: existingOrigin.source,
        referringSitterId: existingOrigin.referringSitterId ?? null,
        existingOrigin,
      });
    }

    if (verifiedReferral) {
      reject(
        ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
        "An existing client without origin attribution requires operator review before referral attribution.",
      );
    }

    return Object.freeze({
      clientStatus: CLIENT_IDENTITY_STATUS.EXISTING,
      kind: "BUSINESS",
      source: "BUSINESS_DEFAULT",
      referringSitterId: null,
      existingOrigin: null,
    });
  }

  if (!verifiedReferral) {
    return Object.freeze({
      clientStatus: CLIENT_IDENTITY_STATUS.NEW,
      kind: "BUSINESS",
      source: "BUSINESS_DEFAULT",
      referringSitterId: null,
      existingOrigin: null,
    });
  }

  const sitterId = normalizeRequiredId(
    verifiedReferral.sitterId,
    "verifiedReferral.sitterId",
  );
  if (verifiedReferral.source !== "REFERRAL_LINK") {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "A verified referral must come from the server referral-link verifier.",
    );
  }

  return Object.freeze({
    clientStatus: CLIENT_IDENTITY_STATUS.NEW,
    kind: "SITTER_REFERRAL",
    source: "REFERRAL_LINK",
    referringSitterId: sitterId,
    existingOrigin: null,
  });
}

export function validateOriginTarget({
  kind,
  source,
  referringSitterId,
  clientStatus,
  existingOrigin = null,
}) {
  if (!CLIENT_ORIGIN_KINDS.has(kind) || !ATTRIBUTION_SOURCES.has(source)) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Client origin kind or attribution source is invalid.",
    );
  }

  const sitterId = normalizeOptionalId(referringSitterId);
  if (kind === "BUSINESS") {
    if (sitterId || !["BUSINESS_DEFAULT", "OPERATOR_VERIFIED"].includes(source)) {
      reject(
        ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
        "Business origin cannot carry a referring sitter or referral-link source.",
      );
    }
    return { kind, source, referringSitterId: null };
  }

  if (!sitterId || !["REFERRAL_LINK", "OPERATOR_VERIFIED"].includes(source)) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Sitter-referral origin requires a referring sitter and verified source.",
    );
  }

  const matchingExistingOrigin =
    existingOrigin &&
    existingOrigin.kind === kind &&
    existingOrigin.source === source &&
    (existingOrigin.referringSitterId ?? null) === sitterId;
  if (clientStatus !== CLIENT_IDENTITY_STATUS.NEW && !matchingExistingOrigin) {
    reject(
      ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
      "An existing client cannot be claimed by a new sitter referral.",
    );
  }

  return { kind, source, referringSitterId: sitterId };
}

export function validateReferringSitter(user, expectedId) {
  if (!user) {
    reject(
      ATTRIBUTION_ERROR_CODES.REFERRING_SITTER_NOT_FOUND,
      "The referring sitter was not found.",
    );
  }
  if (user.id !== expectedId || user.role !== "SITTER") {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_REFERRING_SITTER,
      "The referring user is not a valid sitter.",
    );
  }
  return user;
}

export function validateRequestedSitter(user, expectedId) {
  if (!user) {
    reject(
      ATTRIBUTION_ERROR_CODES.REQUESTED_SITTER_NOT_FOUND,
      "The requested sitter was not found.",
    );
  }
  if (user.id !== expectedId || user.role !== "SITTER") {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_REQUESTED_SITTER,
      "The requested user is not a valid sitter.",
    );
  }
  return user;
}

export function validateOperator(user, expectedId) {
  if (!user || user.id !== expectedId || user.role !== "OPERATOR") {
    reject(
      ATTRIBUTION_ERROR_CODES.OPERATOR_REQUIRED,
      "An authenticated operator is required.",
    );
  }
  return user;
}

export function originsMatch(first, second) {
  return Boolean(
    first &&
      second &&
      first.kind === second.kind &&
      first.source === second.source &&
      (first.referringSitterId ?? null) ===
        (second.referringSitterId ?? null),
  );
}

export function resolveBookingCompensationLane({
  clientOrigin,
  requestedSitterId,
  assignedSitterId,
}) {
  const referringSitterId = clientOrigin?.referringSitterId ?? null;
  if (
    clientOrigin?.kind === "SITTER_REFERRAL" &&
    referringSitterId &&
    requestedSitterId === referringSitterId &&
    assignedSitterId === referringSitterId
  ) {
    return "SITTER_ORIGINATED";
  }
  return "BUSINESS_ASSIGNED";
}

export function buildBookingAttributionSnapshot({
  clientOrigin,
  referringSitter = null,
  requestedSitter = null,
  assignedSitter = null,
}) {
  if (!clientOrigin) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Client origin is required to build a booking snapshot.",
    );
  }

  const target = validateOriginTarget({
    ...clientOrigin,
    clientStatus: CLIENT_IDENTITY_STATUS.NEW,
    existingOrigin: clientOrigin,
  });
  if (target.referringSitterId) {
    validateReferringSitter(referringSitter, target.referringSitterId);
  } else if (referringSitter) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Business origin cannot include a referring sitter snapshot.",
    );
  }

  const requestedSitterId = requestedSitter?.id ?? null;
  if (requestedSitterId) validateRequestedSitter(requestedSitter, requestedSitterId);
  const assignedSitterId = assignedSitter?.id ?? null;
  if (assignedSitterId && assignedSitter.role !== "SITTER") {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Assigned attribution user must be a sitter.",
    );
  }

  return normalizeBookingAttributionSnapshot({
    clientOriginKind: target.kind,
    attributionSource: target.source,
    referringSitterId: target.referringSitterId,
    referringSitterName: normalizeFrozenName(referringSitter?.name),
    requestedSitterId,
    requestedSitterName: normalizeFrozenName(requestedSitter?.name),
    compensationLane: resolveBookingCompensationLane({
      clientOrigin: target,
      requestedSitterId,
      assignedSitterId,
    }),
  });
}

export function normalizeBookingAttributionSnapshot(input = {}) {
  const clientOriginKind = input.clientOriginKind;
  const attributionSource = input.attributionSource;
  const compensationLane = input.compensationLane;
  if (
    !CLIENT_ORIGIN_KINDS.has(clientOriginKind) ||
    !ATTRIBUTION_SOURCES.has(attributionSource) ||
    !["BUSINESS_ASSIGNED", "SITTER_ORIGINATED"].includes(compensationLane)
  ) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Booking attribution snapshot contains invalid frozen values.",
    );
  }

  const normalized = {
    clientOriginKind,
    attributionSource,
    referringSitterId: normalizeOptionalId(input.referringSitterId),
    referringSitterName: normalizeFrozenName(input.referringSitterName),
    requestedSitterId: normalizeOptionalId(input.requestedSitterId),
    requestedSitterName: normalizeFrozenName(input.requestedSitterName),
    compensationLane,
  };
  validateBookingAttributionSnapshotSemantics(normalized);
  return normalized;
}

export function validateBookingAttributionSnapshotSemantics(snapshot) {
  const {
    clientOriginKind,
    attributionSource,
    referringSitterId,
    referringSitterName,
    requestedSitterId,
    requestedSitterName,
    compensationLane,
  } = snapshot;

  if (referringSitterName && !referringSitterId) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "A frozen referring-sitter name requires a referring sitter ID.",
    );
  }
  if (requestedSitterName && !requestedSitterId) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "A frozen requested-sitter name requires a requested sitter ID.",
    );
  }

  if (clientOriginKind === "BUSINESS") {
    if (
      referringSitterId ||
      attributionSource === "REFERRAL_LINK" ||
      compensationLane !== "BUSINESS_ASSIGNED"
    ) {
      reject(
        ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
        "Business-origin snapshots cannot carry referral ownership or sitter-originated economics.",
      );
    }
    return snapshot;
  }

  if (
    !referringSitterId ||
    !["REFERRAL_LINK", "OPERATOR_VERIFIED"].includes(attributionSource)
  ) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Sitter-referral snapshots require a referring sitter and verified source.",
    );
  }

  if (
    compensationLane === "SITTER_ORIGINATED" &&
    (!requestedSitterId || requestedSitterId !== referringSitterId)
  ) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Sitter-originated snapshots require the requested sitter to equal the referring sitter.",
    );
  }

  return snapshot;
}

export function snapshotsMatch(first, second) {
  if (!first || !second) return false;
  const left = normalizeBookingAttributionSnapshot(first);
  const right = normalizeBookingAttributionSnapshot(second);
  return Object.keys(left).every((key) => left[key] === right[key]);
}

export function normalizeCorrectionReason(value) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason) {
    reject(
      ATTRIBUTION_ERROR_CODES.CORRECTION_REASON_REQUIRED,
      "A correction reason is required.",
    );
  }
  return reason;
}

export { normalizeOptionalId, normalizeRequiredId };
