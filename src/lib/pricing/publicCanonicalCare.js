import {
  CanonicalClientQuoteError,
  calculateCanonicalClientQuote,
  normalizeCanonicalQuotePets,
} from "./calculateCanonicalClientQuote.js";

const EXPECTED_ELIGIBILITY_CODES = new Set([
  "TOO_FEW_PETS",
  "TOO_MANY_PETS",
  "MIXED_SPECIES_NOT_ALLOWED",
  "PRIMARY_SPECIES_REQUIRED",
  "UNSUPPORTED_SPECIES",
  "SPECIES_MINIMUM",
  "SPECIES_MAXIMUM",
]);

const INVALID_PET_CODES = new Set([
  "INVALID_PETS",
  "INVALID_PET_COUNT",
  "INVALID_PET_NAME",
  "INVALID_PET_SPECIES",
]);

export class PublicCanonicalCareError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicCanonicalCareError";
    this.code = code;
  }
}

function displayLabelFor(option) {
  return option.durationMinutes == null
    ? option.label
    : `${option.durationMinutes} minutes`;
}

function publicQuoteAmounts(quote) {
  return {
    currency: quote.currency,
    serviceSubtotalCents: quote.serviceSubtotalCents,
    clientFeeCents: quote.clientFeeCents,
    clientTotalCents: quote.clientTotalCents,
  };
}

export function toPublicCanonicalQuote(quote) {
  return {
    careOffering: quote.careOffering,
    careOption: {
      ...quote.careOption,
      displayLabel: displayLabelFor(quote.careOption),
    },
    pets: quote.pets,
    quantity: quote.quantity,
    currency: quote.currency,
    clientFeeBasisPoints: quote.clientFeeBasisPoints,
    serviceSubtotalCents: quote.serviceSubtotalCents,
    clientFeeCents: quote.clientFeeCents,
    clientTotalCents: quote.clientTotalCents,
    breakdown: quote.breakdown,
  };
}

function isExpectedPackageIneligibility(error) {
  return (
    error.code === "MISSING_PET_PRICE" &&
    error.details?.isPrimarySpecies === false &&
    typeof error.details.species === "string" &&
    typeof error.details.primarySpecies === "string"
  );
}

function classifyQuoteError(error) {
  if (!(error instanceof CanonicalClientQuoteError)) {
    throw new PublicCanonicalCareError(
      "UNEXPECTED_SERVER_ERROR",
      "Unable to evaluate canonical care options.",
    );
  }
  if (INVALID_PET_CODES.has(error.code)) {
    throw new PublicCanonicalCareError("INVALID_PET_INPUT", error.message);
  }
  if (
    EXPECTED_ELIGIBILITY_CODES.has(error.code) ||
    error.code === "INACTIVE_OPTION" ||
    error.code === "INACTIVE_OFFERING" ||
    isExpectedPackageIneligibility(error)
  ) {
    return "INELIGIBLE";
  }
  throw new PublicCanonicalCareError(
    "CATALOG_CONFIGURATION_ERROR",
    "Canonical care configuration requires operator review.",
  );
}

export function buildPublicCanonicalCareCatalog({ careOptions, pets } = {}) {
  let normalizedPets;
  try {
    normalizedPets = normalizeCanonicalQuotePets(pets);
  } catch (error) {
    classifyQuoteError(error);
  }
  if (!Array.isArray(careOptions)) {
    throw new PublicCanonicalCareError(
      "CATALOG_CONFIGURATION_ERROR",
      "Canonical care options are unavailable.",
    );
  }

  const optionCodes = new Set();
  const offeringMetadata = new Map();
  const eligibleOptions = [];
  const sortedOptions = [...careOptions].sort(
    (left, right) =>
      left.offering.sortOrder - right.offering.sortOrder ||
      left.sortOrder - right.sortOrder ||
      left.code.localeCompare(right.code),
  );

  for (const careOption of sortedOptions) {
    if (optionCodes.has(careOption.code)) {
      throw new PublicCanonicalCareError(
        "CATALOG_CONFIGURATION_ERROR",
        "Canonical care options contain a duplicate code.",
      );
    }
    optionCodes.add(careOption.code);

    let quote;
    try {
      quote = calculateCanonicalClientQuote({
        careOption,
        pets: normalizedPets,
      });
    } catch (error) {
      if (classifyQuoteError(error) === "INELIGIBLE") {
        continue;
      }
    }

    const offering = careOption.offering;
    const existingOffering = offeringMetadata.get(offering.code);
    const metadata = {
      code: offering.code,
      name: offering.name,
      description: offering.description,
      billingUnit: offering.billingUnit,
      scheduleKind: offering.scheduleKind,
      sortOrder: offering.sortOrder,
    };
    if (existingOffering && JSON.stringify(existingOffering) !== JSON.stringify(metadata)) {
      throw new PublicCanonicalCareError(
        "CATALOG_CONFIGURATION_ERROR",
        "Canonical offering metadata is inconsistent.",
      );
    }
    offeringMetadata.set(offering.code, metadata);
    eligibleOptions.push({
      offeringCode: offering.code,
      code: careOption.code,
      label: careOption.label,
      displayLabel: displayLabelFor(careOption),
      primarySpecies: careOption.primarySpecies,
      durationMinutes: careOption.durationMinutes,
      sortOrder: careOption.sortOrder,
      quote: publicQuoteAmounts(quote),
    });
  }

  const offerings = [...offeringMetadata.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
    .map(({ sortOrder: _sortOrder, ...offering }) => ({
      ...offering,
      options: eligibleOptions
        .filter((option) => option.offeringCode === offering.code)
        .map(({ offeringCode: _offeringCode, sortOrder: _optionSortOrder, ...option }) => option),
    }));

  if (offerings.length === 0) {
    throw new PublicCanonicalCareError(
      "NO_ELIGIBLE_CARE_OPTIONS",
      "No canonical care options support this household.",
    );
  }
  return { pets: normalizedPets, offerings };
}

export function translatePublicQuoteError(error) {
  if (error instanceof PublicCanonicalCareError) return error;
  if (!(error instanceof CanonicalClientQuoteError)) {
    return new PublicCanonicalCareError(
      "UNEXPECTED_SERVER_ERROR",
      "Unable to quote canonical care.",
    );
  }
  if (INVALID_PET_CODES.has(error.code)) {
    return new PublicCanonicalCareError("INVALID_PET_INPUT", error.message);
  }
  if (
    EXPECTED_ELIGIBILITY_CODES.has(error.code) ||
    isExpectedPackageIneligibility(error)
  ) {
    return new PublicCanonicalCareError(
      "OPTION_NOT_ELIGIBLE",
      "The selected care option does not support this household.",
    );
  }
  if (
    [
      "INVALID_OPTION_CODE",
      "OPTION_NOT_FOUND",
      "INACTIVE_OPTION",
      "INACTIVE_OFFERING",
    ].includes(error.code)
  ) {
    return new PublicCanonicalCareError(
      "OPTION_NOT_FOUND_OR_INACTIVE",
      "The selected care option is unavailable.",
    );
  }
  return new PublicCanonicalCareError(
    "CATALOG_CONFIGURATION_ERROR",
    "Canonical care configuration requires operator review.",
  );
}
