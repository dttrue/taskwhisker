import {
  CanonicalClientQuoteError,
  calculateCanonicalClientQuote,
} from "./calculateCanonicalClientQuote.js";
import {
  SITTER_ORIGINATED_COMPENSATION_ERROR_CODES,
  SITTER_ORIGINATED_COMPENSATION_LANE,
  SitterOriginatedCompensationError,
  calculateSitterOriginatedCompensation,
  rejectSitterOriginatedCompensation,
  validateSitterOriginatedSitter,
} from "./calculateSitterOriginatedCompensation.js";

export function buildSitterOriginatedCompensationResolverInput(input, db) {
  const { careOptionCode, sitterId, pets, quantity } = input ?? {};

  return {
    careOptionCode,
    sitterId,
    pets,
    quantity,
    db,
  };
}

export async function quoteSitterOriginatedCompensationWithDb({
  db,
  careOptionCode,
  sitterId,
  pets,
  quantity,
}) {
  const normalizedCode =
    typeof careOptionCode === "string" ? careOptionCode.trim() : "";
  const normalizedSitterId =
    typeof sitterId === "string" ? sitterId.trim() : "";
  if (
    !db ||
    !normalizedCode ||
    !normalizedSitterId ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_INPUT,
      "careOptionCode, sitterId, and a positive integer quantity are required.",
    );
  }

  let sitter;
  try {
    sitter = await db.user.findUnique({
      where: { id: normalizedSitterId },
      select: { id: true, role: true },
    });
  } catch {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      "Sitter eligibility could not be verified.",
    );
  }
  validateSitterOriginatedSitter(sitter, normalizedSitterId);

  let careOption;
  try {
    careOption = await db.careOption.findUnique({
      where: { code: normalizedCode },
      include: {
        offering: { include: { speciesPolicies: true } },
        clientRate: { include: { petCharges: true } },
      },
    });
  } catch {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CANONICAL_QUOTE_UNAVAILABLE,
      "Canonical client pricing could not be loaded.",
    );
  }
  if (!careOption) {
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CARE_OPTION_NOT_FOUND,
      "The canonical care option does not exist.",
    );
  }

  let canonicalClientQuote;
  try {
    canonicalClientQuote = calculateCanonicalClientQuote({ careOption, pets });
  } catch (error) {
    if (error instanceof CanonicalClientQuoteError) {
      rejectSitterOriginatedCompensation(
        SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.CANONICAL_QUOTE_UNAVAILABLE,
        "Canonical client pricing is unavailable for this booking.",
        { canonicalQuoteCode: error.code },
      );
    }
    if (error instanceof SitterOriginatedCompensationError) throw error;
    rejectSitterOriginatedCompensation(
      SITTER_ORIGINATED_COMPENSATION_ERROR_CODES.INVALID_CONFIGURATION,
      "Canonical client pricing could not be evaluated.",
    );
  }

  return calculateSitterOriginatedCompensation({
    canonicalClientQuote,
    sitterId: sitter.id,
    quantity,
    compensationLane: SITTER_ORIGINATED_COMPENSATION_LANE,
    expectedCurrency: careOption.clientRate.currency,
  });
}
