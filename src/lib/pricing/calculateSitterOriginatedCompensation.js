import {
  CLIENT_FEE_BPS,
  MAX_MONEY_CENTS,
  SITTER_FEE_BPS,
  calculateClientEconomics,
  calculateSitterEconomics,
} from "./calculatePricing.js";

export const SITTER_ORIGINATED_COMPENSATION_LANE = "SITTER_ORIGINATED";
export const SITTER_ORIGINATED_COMPENSATION_SOURCE =
  "CLIENT_SERVICE_SUBTOTAL";

export const SITTER_ORIGINATED_COMPENSATION_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT",
  SITTER_NOT_FOUND: "SITTER_NOT_FOUND",
  INVALID_SITTER: "INVALID_SITTER",
  CARE_OPTION_NOT_FOUND: "CARE_OPTION_NOT_FOUND",
  CANONICAL_QUOTE_UNAVAILABLE: "CANONICAL_QUOTE_UNAVAILABLE",
  INVALID_COMPENSATION_LANE: "INVALID_COMPENSATION_LANE",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  INVALID_CONFIGURATION: "INVALID_CONFIGURATION",
  MONEY_OVERFLOW: "MONEY_OVERFLOW",
});

export class SitterOriginatedCompensationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "SitterOriginatedCompensationError";
    this.code = code;
    this.details = details;
  }
}

export function rejectSitterOriginatedCompensation(code, message, details) {
  throw new SitterOriginatedCompensationError(code, message, details);
}

function requireMoney(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      `${label} must be a non-negative integer-cent amount.`,
    );
  }
  if (value > MAX_MONEY_CENTS) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.MONEY_OVERFLOW,
      `${label} exceeds the supported monetary range.`,
    );
  }
}

function multiplyMoney(amountCents, quantity, label) {
  const result = amountCents * quantity;
  if (
    !Number.isSafeInteger(result) ||
    result < 0 ||
    result > MAX_MONEY_CENTS
  ) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.MONEY_OVERFLOW,
      `${label} exceeds the supported monetary range.`,
    );
  }
  return result;
}

function calculateEconomics(serviceSubtotalCents) {
  try {
    return {
      clientPricing: calculateClientEconomics(serviceSubtotalCents),
      sitterPricing: calculateSitterEconomics(serviceSubtotalCents),
    };
  } catch (error) {
    if (error instanceof RangeError) {
      rejectSitterOriginatedCompensation(
        SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.MONEY_OVERFLOW,
        "Aggregate compensation exceeds the supported monetary range.",
      );
    }
    throw error;
  }
}

function validateCanonicalClientQuote(canonicalClientQuote) {
  if (!canonicalClientQuote || typeof canonicalClientQuote !== "object") {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CANONICAL_QUOTE_UNAVAILABLE,
      "A server-derived canonical client quote is required.",
    );
  }
  const { careOption, currency, breakdown } = canonicalClientQuote;
  if (
    !careOption ||
    typeof careOption.code !== "string" ||
    !careOption.code ||
    typeof careOption.label !== "string" ||
    !careOption.label ||
    typeof currency !== "string" ||
    !currency
  ) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      "Canonical quote metadata is incomplete.",
    );
  }
  if (
    canonicalClientQuote.quantity !== 1 ||
    canonicalClientQuote.clientFeeBasisPoints !== CLIENT_FEE_BPS
  ) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      "The canonical quote must represent one billable unit at the standard client fee.",
    );
  }

  requireMoney(
    canonicalClientQuote.serviceSubtotalCents,
    "canonical serviceSubtotalCents",
  );
  requireMoney(canonicalClientQuote.clientFeeCents, "canonical clientFeeCents");
  requireMoney(
    canonicalClientQuote.clientTotalCents,
    "canonical clientTotalCents",
  );
  const expectedEconomics = calculateEconomics(
    canonicalClientQuote.serviceSubtotalCents,
  ).clientPricing;
  if (
    canonicalClientQuote.clientFeeCents !== expectedEconomics.clientFeeCents ||
    canonicalClientQuote.clientTotalCents !== expectedEconomics.clientTotalCents
  ) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      "Canonical client economics are inconsistent.",
    );
  }
  if (!Array.isArray(breakdown) || breakdown.length < 1) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      "Canonical service breakdown is unavailable.",
    );
  }

  let breakdownSubtotalCents = 0;
  for (const entry of breakdown) {
    if (!entry || typeof entry !== "object" || !entry.type || !entry.label) {
      rejectSitterOriginatedCompensation(
        SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
        "Canonical service breakdown is invalid.",
      );
    }
    requireMoney(entry.amountCents, "canonical breakdown amountCents");
    breakdownSubtotalCents += entry.amountCents;
  }
  if (breakdownSubtotalCents !== canonicalClientQuote.serviceSubtotalCents) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      "Canonical service breakdown does not match its subtotal.",
    );
  }
}

function aggregateBreakdown(breakdown, quantity) {
  return breakdown.map((entry) => {
    const {
      type: sourceType,
      amountCents: unitAmountCents,
      quantity: _sourceQuantity,
      ...metadata
    } = entry;
    return {
      type: "CLIENT_SERVICE_COMPENSATION",
      sourceType,
      ...metadata,
      unitAmountCents,
      quantity,
      totalAmountCents: multiplyMoney(
        unitAmountCents,
        quantity,
        "Compensation breakdown total",
      ),
    };
  });
}

export function validateSitterOriginatedSitter(sitter, sitterId) {
  if (!sitter) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.SITTER_NOT_FOUND,
      "The selected sitter does not exist.",
    );
  }
  if (sitter.id !== sitterId || sitter.role !== "SITTER") {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_SITTER,
      "The selected user is not a valid sitter.",
    );
  }
  return sitter;
}

export function calculateSitterOriginatedCompensation({
  canonicalClientQuote,
  sitterId,
  quantity,
  compensationLane,
  expectedCurrency = null,
}) {
  const normalizedSitterId =
    typeof sitterId === "string" ? sitterId.trim() : "";
  if (!normalizedSitterId || !Number.isInteger(quantity) || quantity < 1) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_INPUT,
      "sitterId and a positive integer quantity are required.",
    );
  }
  if (compensationLane !== SITTER_ORIGINATED_COMPENSATION_LANE) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_COMPENSATION_LANE,
      "Sitter-originated compensation requires a trusted sitter-originated lane.",
    );
  }

  validateCanonicalClientQuote(canonicalClientQuote);
  if (
    expectedCurrency != null &&
    (typeof expectedCurrency !== "string" ||
      !expectedCurrency ||
      expectedCurrency !== canonicalClientQuote.currency)
  ) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CURRENCY_MISMATCH,
      "Canonical client and sitter compensation currencies do not match.",
    );
  }

  const serviceSubtotalCents = multiplyMoney(
    canonicalClientQuote.serviceSubtotalCents,
    quantity,
    "Aggregate canonical service subtotal",
  );
  const { clientPricing, sitterPricing } =
    calculateEconomics(serviceSubtotalCents);

  return {
    compensationLane: SITTER_ORIGINATED_COMPENSATION_LANE,
    sitterId: normalizedSitterId,
    careOption: {
      code: canonicalClientQuote.careOption.code,
      label: canonicalClientQuote.careOption.label,
      primarySpecies: canonicalClientQuote.careOption.primarySpecies ?? null,
    },
    currency: canonicalClientQuote.currency,
    quantity,
    source: SITTER_ORIGINATED_COMPENSATION_SOURCE,
    clientPricing,
    sitterCompensationSubtotalCents:
      sitterPricing.sitterCompensationSubtotalCents,
    sitterFeeBasisPoints: SITTER_FEE_BPS,
    sitterFeeCents: sitterPricing.sitterFeeCents,
    sitterPayoutCents: sitterPricing.sitterPayoutCents,
    breakdown: aggregateBreakdown(canonicalClientQuote.breakdown, quantity),
  };
}

