import {
  ATTRIBUTION_ERROR_CODES,
  AttributionContractError,
  CLIENT_IDENTITY_STATUS,
  normalizeBookingAttributionSnapshot,
  normalizeClientIdentity,
  normalizeCorrectionReason,
  normalizeOptionalId,
  normalizeRequiredId,
  originsMatch,
  resolveClientIdentityCandidates,
  resolveClientOriginIntent,
  snapshotsMatch,
  validateOperator,
  validateOriginTarget,
  validateReferringSitter,
  validateRequestedSitter,
} from "./clientAttributionContract.js";
import {
  normalizeEmail,
  normalizePhone,
} from "../blocklist/normalizeBlockedClientInput.js";
import { readVerifiedSitterReferralIntent } from "../referrals/sitterReferralCodeWrites.js";

const authorizedWriteIntents = new WeakMap();

function reject(code, message) {
  throw new AttributionContractError(code, message);
}

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

async function inTransaction(db, work) {
  if (!db || typeof db.$transaction !== "function") {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_INPUT,
      "A transaction-capable database client is required.",
    );
  }
  return db.$transaction(work);
}

export async function findClientIdentity({ db, email, phone }) {
  const identity = normalizeClientIdentity({ email, phone });
  const candidates = await db.client.findMany({
    where: {
      OR: [
        identity.email
          ? { email: { equals: identity.email, mode: "insensitive" } }
          : undefined,
        identity.phone ? { phone: { not: null } } : undefined,
      ].filter(Boolean),
    },
    include: { origin: true },
  });

  return resolveClientIdentityCandidates({ ...identity, candidates });
}

export async function resolveClientOriginWriteIntent({
  db,
  email,
  phone,
  verifiedReferral = null,
}) {
  const identityResolution = await findClientIdentity({ db, email, phone });
  const trustedReferral = verifiedReferral
    ? readVerifiedSitterReferralIntent({ db, verifiedReferral })
    : null;
  const intent = resolveClientOriginIntent({
    identityResolution,
    verifiedReferral: trustedReferral,
  });
  authorizedWriteIntents.set(intent, {
    db,
    status: identityResolution.status,
    identity: { ...identityResolution.identity },
    existingClientId: identityResolution.client?.id ?? null,
    consumedClientId: null,
  });
  return intent;
}

function assertIntentTargetsClient({ authorization, client, clientId }) {
  if (
    authorization.consumedClientId &&
    authorization.consumedClientId !== clientId
  ) {
    reject(
      ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
      "The client-origin intent has already been used for another client.",
    );
  }

  if (authorization.status === CLIENT_IDENTITY_STATUS.EXISTING) {
    if (authorization.existingClientId !== clientId) {
      reject(
        ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
        "The existing-client intent does not belong to the target client.",
      );
    }
    return;
  }

  const expectedEmail = authorization.identity.email;
  const expectedPhone = authorization.identity.phone;
  const actualEmail = normalizeEmail(client.email) || null;
  const actualPhone = normalizePhone(client.phone) || null;

  if (
    (expectedEmail && actualEmail !== expectedEmail) ||
    (expectedPhone && actualPhone !== expectedPhone)
  ) {
    reject(
      ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
      "The newly created client does not match the identity resolved for this intent.",
    );
  }
}

async function assertNewIntentStillResolvesToTarget({
  tx,
  authorization,
  clientId,
}) {
  if (authorization.status !== CLIENT_IDENTITY_STATUS.NEW) return;

  const currentResolution = await findClientIdentity({
    db: tx,
    email: authorization.identity.email,
    phone: authorization.identity.phone,
  });
  if (
    currentResolution.status !== CLIENT_IDENTITY_STATUS.EXISTING ||
    currentResolution.client?.id !== clientId
  ) {
    reject(
      ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
      "The resolved identity no longer belongs exclusively to the target client.",
    );
  }
}

export async function createOrVerifyClientOrigin({
  db,
  clientId,
  intent,
  actorUserId = null,
}) {
  const normalizedClientId = normalizeRequiredId(clientId, "clientId");
  const authorization = intent ? authorizedWriteIntents.get(intent) : null;
  if (!authorization || authorization.db !== db) {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_INPUT,
      "A server-resolved client-origin intent is required.",
    );
  }

  const requested = {
    kind: intent.kind,
    source: intent.source,
    referringSitterId: intent.referringSitterId,
  };

  try {
    const result = await inTransaction(db, async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: normalizedClientId },
        include: { origin: true },
      });
      if (!client) {
        reject(
          ATTRIBUTION_ERROR_CODES.CLIENT_NOT_FOUND,
          "The client was not found.",
        );
      }
      assertIntentTargetsClient({
        authorization,
        client,
        clientId: normalizedClientId,
      });
      await assertNewIntentStillResolvesToTarget({
        tx,
        authorization,
        clientId: normalizedClientId,
      });

      if (client.origin && originsMatch(client.origin, requested)) {
        return { origin: client.origin, created: false, idempotent: true };
      }
      if (client.origin) {
        reject(
          ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
          "The client already has different authoritative origin attribution.",
        );
      }

      const target = validateOriginTarget({
        ...requested,
        clientStatus: intent.clientStatus,
        existingOrigin: client.origin,
      });

      let setterId = null;
      if (intent.source === "OPERATOR_VERIFIED") {
        const normalizedActorId = normalizeRequiredId(actorUserId, "actorUserId");
        const actor = await tx.user.findUnique({
          where: { id: normalizedActorId },
          select: { id: true, role: true },
        });
        validateOperator(actor, normalizedActorId);
        setterId = actor.id;
      }

      if (target.referringSitterId) {
        const sitter = await tx.user.findUnique({
          where: { id: target.referringSitterId },
          select: { id: true, role: true },
        });
        validateReferringSitter(sitter, target.referringSitterId);
      }

      const origin = await tx.clientOrigin.create({
        data: {
          clientId: normalizedClientId,
          ...target,
          setByUserId: setterId,
        },
      });
      return { origin, created: true, idempotent: false };
    });
    authorization.consumedClientId = normalizedClientId;
    return result;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const current = await db.clientOrigin.findUnique({
      where: { clientId: normalizedClientId },
    });
    if (originsMatch(current, requested)) {
      authorization.consumedClientId = normalizedClientId;
      return { origin: current, created: false, idempotent: true };
    }
    reject(
      ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
      "A concurrent write established different client origin attribution.",
    );
  }
}

export async function correctClientOrigin({
  db,
  clientId,
  toKind,
  toReferringSitterId = null,
  source,
  reason,
  operatorUserId,
}) {
  const normalizedClientId = normalizeRequiredId(clientId, "clientId");
  const normalizedOperatorId = normalizeRequiredId(
    operatorUserId,
    "operatorUserId",
  );
  const normalizedReason = normalizeCorrectionReason(reason);
  if (source !== "OPERATOR_VERIFIED") {
    reject(
      ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
      "Client-origin corrections must use OPERATOR_VERIFIED source.",
    );
  }

  return inTransaction(db, async (tx) => {
    const operator = await tx.user.findUnique({
      where: { id: normalizedOperatorId },
      select: { id: true, role: true },
    });
    validateOperator(operator, normalizedOperatorId);

    const client = await tx.client.findUnique({
      where: { id: normalizedClientId },
      include: { origin: true },
    });
    if (!client) {
      reject(
        ATTRIBUTION_ERROR_CODES.CLIENT_NOT_FOUND,
        "The client was not found.",
      );
    }

    const target = validateOriginTarget({
      kind: toKind,
      source,
      referringSitterId: toReferringSitterId,
      clientStatus: CLIENT_IDENTITY_STATUS.NEW,
    });
    if (target.referringSitterId) {
      const sitter = await tx.user.findUnique({
        where: { id: target.referringSitterId },
        select: { id: true, role: true },
      });
      validateReferringSitter(sitter, target.referringSitterId);
    }

    if (client.origin && originsMatch(client.origin, target)) {
      return {
        origin: client.origin,
        event: null,
        created: false,
        idempotent: true,
      };
    }

    if (!client.origin) {
      const origin = await tx.clientOrigin.create({
        data: {
          clientId: normalizedClientId,
          ...target,
          setByUserId: operator.id,
        },
      });
      const event = await tx.clientOriginEvent.create({
        data: {
          clientOriginId: origin.id,
          fromKind: null,
          toKind: target.kind,
          fromSource: null,
          toSource: target.source,
          fromSitterId: null,
          toSitterId: target.referringSitterId,
          reason: normalizedReason,
          changedByUserId: operator.id,
        },
      });
      return { origin, event, created: true, idempotent: false };
    }

    const event = await tx.clientOriginEvent.create({
      data: {
        clientOriginId: client.origin.id,
        fromKind: client.origin.kind,
        toKind: target.kind,
        fromSource: client.origin.source,
        toSource: target.source,
        fromSitterId: client.origin.referringSitterId,
        toSitterId: target.referringSitterId,
        reason: normalizedReason,
        changedByUserId: operator.id,
      },
    });
    const origin = await tx.clientOrigin.update({
      where: { id: client.origin.id },
      data: {
        ...target,
        setByUserId: operator.id,
        version: { increment: 1 },
      },
    });
    return { origin, event, created: false, idempotent: false };
  });
}

export async function resolveRequestedSitter({ db, requestedSitterId }) {
  const normalizedId = normalizeOptionalId(requestedSitterId);
  if (!normalizedId) return null;

  const sitter = await db.user.findUnique({
    where: { id: normalizedId },
    select: { id: true, name: true, role: true },
  });
  return validateRequestedSitter(sitter, normalizedId);
}

export async function createBookingAttributionSnapshot({
  db,
  bookingId,
  snapshot,
}) {
  const normalizedBookingId = normalizeRequiredId(bookingId, "bookingId");
  const normalizedSnapshot = normalizeBookingAttributionSnapshot(snapshot);

  try {
    return await inTransaction(db, async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: normalizedBookingId },
        select: { id: true, attributionSnapshot: true },
      });
      if (!booking) {
        reject(
          ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
          "The booking was not found for attribution snapshot creation.",
        );
      }
      if (booking.attributionSnapshot) {
        if (snapshotsMatch(booking.attributionSnapshot, normalizedSnapshot)) {
          return {
            snapshot: booking.attributionSnapshot,
            created: false,
            idempotent: true,
          };
        }
        reject(
          ATTRIBUTION_ERROR_CODES.ATTRIBUTION_SNAPSHOT_CONFLICT,
          "The booking already has a different immutable attribution snapshot.",
        );
      }

      const created = await tx.bookingAttributionSnapshot.create({
        data: { bookingId: normalizedBookingId, ...normalizedSnapshot },
      });
      return { snapshot: created, created: true, idempotent: false };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const current = await db.bookingAttributionSnapshot.findUnique({
      where: { bookingId: normalizedBookingId },
    });
    if (snapshotsMatch(current, normalizedSnapshot)) {
      return { snapshot: current, created: false, idempotent: true };
    }
    reject(
      ATTRIBUTION_ERROR_CODES.ATTRIBUTION_SNAPSHOT_CONFLICT,
      "A concurrent write established a different immutable booking snapshot.",
    );
  }
}
