import {
  REFERRAL_CODE_ERROR_CODES,
  generatePublicReferralCode,
  hashPublicReferralCode,
  normalizeRequiredReferralId,
  normalizeRevocationReason,
  rejectReferralCode,
  validateReferralOperator,
  validateReferralSitter,
} from "./sitterReferralCodeContract.js";

const verifiedReferralIntents = new WeakMap();

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

function requireTransactionClient(db) {
  if (!db || typeof db.$transaction !== "function") {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_INPUT,
      "A transaction-capable database client is required.",
    );
  }
  return db;
}

async function loadAuthorizedUsers({ tx, sitterId, operatorUserId }) {
  const [operator, sitter] = await Promise.all([
    tx.user.findUnique({
      where: { id: operatorUserId },
      select: { id: true, role: true },
    }),
    tx.user.findUnique({
      where: { id: sitterId },
      select: { id: true, role: true },
    }),
  ]);
  validateReferralOperator(operator, operatorUserId);
  validateReferralSitter(sitter, sitterId);
}

function activeCodeData({ sitterId, codeHash, operatorUserId }) {
  return {
    sitterId,
    codeHash,
    activeSitterKey: sitterId,
    createdByUserId: operatorUserId,
  };
}

function revokedCodeData({ operatorUserId, reason, revokedAt }) {
  return {
    activeSitterKey: null,
    revokedByUserId: operatorUserId,
    revocationReason: reason,
    revokedAt,
  };
}

export async function createSitterReferralCode({
  db,
  sitterId,
  operatorUserId,
}) {
  requireTransactionClient(db);
  const normalizedSitterId = normalizeRequiredReferralId(sitterId, "sitterId");
  const normalizedOperatorId = normalizeRequiredReferralId(
    operatorUserId,
    "operatorUserId",
  );
  const publicCode = generatePublicReferralCode();
  const codeHash = hashPublicReferralCode(publicCode);

  try {
    const referralCode = await db.$transaction(async (tx) => {
      await loadAuthorizedUsers({
        tx,
        sitterId: normalizedSitterId,
        operatorUserId: normalizedOperatorId,
      });
      const existing = await tx.sitterReferralCode.findUnique({
        where: { activeSitterKey: normalizedSitterId },
        select: { id: true },
      });
      if (existing) {
        rejectReferralCode(
          REFERRAL_CODE_ERROR_CODES.REFERRAL_CODE_CONFLICT,
          "The sitter already has an active referral code.",
        );
      }
      return tx.sitterReferralCode.create({
        data: activeCodeData({
          sitterId: normalizedSitterId,
          codeHash,
          operatorUserId: normalizedOperatorId,
        }),
      });
    });
    return { referralCode, publicCode };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.REFERRAL_CODE_CONFLICT,
      "A concurrent request already created an active referral code.",
    );
  }
}

export async function verifySitterReferralCode({ db, publicCode }) {
  let codeHash;
  try {
    codeHash = hashPublicReferralCode(publicCode);
  } catch {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
      "The referral code is invalid or unavailable.",
    );
  }

  const referralCode = await db.sitterReferralCode.findUnique({
    where: { codeHash },
    include: {
      sitter: { select: { id: true, role: true } },
    },
  });
  if (
    !referralCode ||
    referralCode.revokedAt ||
    referralCode.activeSitterKey !== referralCode.sitterId ||
    referralCode.sitter?.id !== referralCode.sitterId ||
    referralCode.sitter?.role !== "SITTER"
  ) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
      "The referral code is invalid or unavailable.",
    );
  }

  const verifiedReferral = Object.freeze({});
  verifiedReferralIntents.set(verifiedReferral, {
    db,
    sitterId: referralCode.sitterId,
    source: "REFERRAL_LINK",
  });
  return verifiedReferral;
}

export function readVerifiedSitterReferralIntent({ db, verifiedReferral }) {
  const intent =
    verifiedReferral && verifiedReferralIntents.get(verifiedReferral);
  if (!intent || intent.db !== db) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
      "A server-verified referral code is required.",
    );
  }
  return Object.freeze({
    sitterId: intent.sitterId,
    source: intent.source,
  });
}

export async function revokeSitterReferralCode({
  db,
  codeId = null,
  sitterId = null,
  operatorUserId,
  reason,
}) {
  requireTransactionClient(db);
  const normalizedCodeId = codeId
    ? normalizeRequiredReferralId(codeId, "codeId")
    : null;
  const normalizedSitterId = sitterId
    ? normalizeRequiredReferralId(sitterId, "sitterId")
    : null;
  if (Boolean(normalizedCodeId) === Boolean(normalizedSitterId)) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_INPUT,
      "Exactly one codeId or sitterId is required.",
    );
  }
  const normalizedOperatorId = normalizeRequiredReferralId(
    operatorUserId,
    "operatorUserId",
  );
  const normalizedReason = normalizeRevocationReason(reason);

  return db.$transaction(async (tx) => {
    const operator = await tx.user.findUnique({
      where: { id: normalizedOperatorId },
      select: { id: true, role: true },
    });
    validateReferralOperator(operator, normalizedOperatorId);

    let referralCode;
    if (normalizedCodeId) {
      referralCode = await tx.sitterReferralCode.findUnique({
        where: { id: normalizedCodeId },
      });
    } else {
      referralCode = await tx.sitterReferralCode.findUnique({
        where: { activeSitterKey: normalizedSitterId },
      });
      referralCode ??= await tx.sitterReferralCode.findFirst({
        where: { sitterId: normalizedSitterId },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!referralCode) {
      rejectReferralCode(
        REFERRAL_CODE_ERROR_CODES.REFERRAL_CODE_NOT_FOUND,
        "The referral code was not found.",
      );
    }
    if (referralCode.revokedAt || !referralCode.activeSitterKey) {
      return { referralCode, revoked: false, idempotent: true };
    }

    const revokedAt = new Date();
    const update = await tx.sitterReferralCode.updateMany({
      where: {
        id: referralCode.id,
        activeSitterKey: referralCode.sitterId,
        revokedAt: null,
      },
      data: revokedCodeData({
        operatorUserId: normalizedOperatorId,
        reason: normalizedReason,
        revokedAt,
      }),
    });
    if (update.count === 1) {
      return {
        referralCode: {
          ...referralCode,
          ...revokedCodeData({
            operatorUserId: normalizedOperatorId,
            reason: normalizedReason,
            revokedAt,
          }),
        },
        revoked: true,
        idempotent: false,
      };
    }

    const current = await tx.sitterReferralCode.findUnique({
      where: { id: referralCode.id },
    });
    if (current?.revokedAt && !current.activeSitterKey) {
      return { referralCode: current, revoked: false, idempotent: true };
    }
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.REFERRAL_CODE_CONFLICT,
      "The referral code changed during revocation.",
    );
  });
}

export async function rotateSitterReferralCode({
  db,
  sitterId,
  operatorUserId,
  reason,
}) {
  requireTransactionClient(db);
  const normalizedSitterId = normalizeRequiredReferralId(sitterId, "sitterId");
  const normalizedOperatorId = normalizeRequiredReferralId(
    operatorUserId,
    "operatorUserId",
  );
  const normalizedReason = normalizeRevocationReason(reason);
  const publicCode = generatePublicReferralCode();
  const codeHash = hashPublicReferralCode(publicCode);

  try {
    const result = await db.$transaction(async (tx) => {
      await loadAuthorizedUsers({
        tx,
        sitterId: normalizedSitterId,
        operatorUserId: normalizedOperatorId,
      });
      const activeCode = await tx.sitterReferralCode.findUnique({
        where: { activeSitterKey: normalizedSitterId },
      });
      if (activeCode) {
        await tx.sitterReferralCode.update({
          where: { id: activeCode.id },
          data: revokedCodeData({
            operatorUserId: normalizedOperatorId,
            reason: normalizedReason,
            revokedAt: new Date(),
          }),
        });
      }
      const referralCode = await tx.sitterReferralCode.create({
        data: activeCodeData({
          sitterId: normalizedSitterId,
          codeHash,
          operatorUserId: normalizedOperatorId,
        }),
      });
      return { referralCode, revokedCodeId: activeCode?.id ?? null };
    });
    return { ...result, publicCode };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.REFERRAL_CODE_CONFLICT,
      "A concurrent request changed the sitter's active referral code.",
    );
  }
}
