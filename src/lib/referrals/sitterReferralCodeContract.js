import { createHash, randomBytes } from "node:crypto";

export const REFERRAL_CODE_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_REFERRAL_CODE: "INVALID_REFERRAL_CODE",
  REFERRAL_CODE_CONFLICT: "REFERRAL_CODE_CONFLICT",
  REFERRAL_CODE_NOT_FOUND: "REFERRAL_CODE_NOT_FOUND",
  REFERRAL_SITTER_NOT_FOUND: "REFERRAL_SITTER_NOT_FOUND",
  REFERRAL_SITTER_INVALID: "REFERRAL_SITTER_INVALID",
  OPERATOR_REQUIRED: "OPERATOR_REQUIRED",
  REVOCATION_REASON_REQUIRED: "REVOCATION_REASON_REQUIRED",
});

export const REFERRAL_CODE_BYTES = 32;
export const REFERRAL_CODE_LENGTH = 43;

const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class SitterReferralCodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SitterReferralCodeError";
    this.code = code;
  }
}

export function rejectReferralCode(code, message) {
  throw new SitterReferralCodeError(code, message);
}

export function normalizeRequiredReferralId(value, label = "id") {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_INPUT,
      `${label} is required.`,
    );
  }
  return normalized;
}

export function normalizeRevocationReason(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.REVOCATION_REASON_REQUIRED,
      "A revocation reason is required.",
    );
  }
  if (normalized.length > 500) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_INPUT,
      "The revocation reason must be 500 characters or fewer.",
    );
  }
  return normalized;
}

export function generatePublicReferralCode() {
  return randomBytes(REFERRAL_CODE_BYTES).toString("base64url");
}

export function normalizePublicReferralCode(value) {
  if (
    typeof value !== "string" ||
    value.length !== REFERRAL_CODE_LENGTH ||
    !REFERRAL_CODE_PATTERN.test(value)
  ) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.INVALID_REFERRAL_CODE,
      "The referral code is invalid or unavailable.",
    );
  }
  return value;
}

export function hashPublicReferralCode(value) {
  const normalized = normalizePublicReferralCode(value);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function validateReferralOperator(user, expectedId) {
  if (!user || user.id !== expectedId || user.role !== "OPERATOR") {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.OPERATOR_REQUIRED,
      "An authenticated operator is required.",
    );
  }
  return user;
}
export function validateReferralSitter(user, expectedId) {
  if (!user) {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.REFERRAL_SITTER_NOT_FOUND,
      "The referral sitter was not found.",
    );
  }
  if (user.id !== expectedId || user.role !== "SITTER") {
    rejectReferralCode(
      REFERRAL_CODE_ERROR_CODES.REFERRAL_SITTER_INVALID,
      "The referral owner is not an eligible sitter.",
    );
  }
  return user;
}
