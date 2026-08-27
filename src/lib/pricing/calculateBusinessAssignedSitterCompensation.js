import {
  CanonicalClientQuoteError,
  normalizeCanonicalQuotePets,
} from "./calculateCanonicalClientQuote.js";
import {
  MAX_MONEY_CENTS,
  SITTER_FEE_BPS,
  calculateSitterEconomics,
} from "./calculatePricing.js";

export const BUSINESS_ASSIGNED_BASE_CEILING_BPS = 9000;

export class BusinessAssignedSitterCompensationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "BusinessAssignedSitterCompensationError";
    this.code = code;
    this.details = details;
  }
}

function reject(code, message, details) {
  throw new BusinessAssignedSitterCompensationError(code, message, details);
}

function requireMoney(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_MONEY_CENTS) {
    reject(
      "INVALID_MONEY_CONFIGURATION",
      `${label} must be a supported non-negative integer-cent amount.`,
    );
  }
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    reject("INVALID_CONFIGURATION", `${label} must be a non-negative integer.`);
  }
}

function multiplyMoney(amountCents, quantity, label) {
  const result = amountCents * quantity;
  if (!Number.isSafeInteger(result) || result > MAX_MONEY_CENTS) {
    reject(
      "INVALID_MONEY_CONFIGURATION",
      `${label} exceeds the supported monetary range.`,
    );
  }
  return result;
}

function validateRate(rate) {
  if (!rate || typeof rate !== "object") {
    reject("NO_COMPENSATION_RATE", "No sitter compensation rate is configured.");
  }
  if (!rate.isActive) {
    reject(
      "INACTIVE_COMPENSATION_RATE",
      "The selected sitter compensation rate is inactive.",
    );
  }
  if (
    typeof rate.id !== "string" ||
    !rate.id ||
    !Number.isInteger(rate.version) ||
    rate.version < 1 ||
    typeof rate.currency !== "string" ||
    !rate.currency
  ) {
    reject("INVALID_CONFIGURATION", "Sitter compensation metadata is invalid.");
  }
  requireMoney(rate.baseCompensationCents, "baseCompensationCents");
  requireNonNegativeInteger(rate.includedPetCount, "includedPetCount");
  if (rate.defaultAdditionalCents != null) {
    requireMoney(rate.defaultAdditionalCents, "defaultAdditionalCents");
  }
  if (!Array.isArray(rate.petCharges)) {
    reject("INVALID_CONFIGURATION", "Sitter pet-charge rules are unavailable.");
  }

  const chargeKeys = new Set();
  for (const charge of rate.petCharges) {
    const key = `${charge?.species}:${charge?.includedCount}`;
    if (
      !charge ||
      typeof charge.species !== "string" ||
      !charge.species.trim() ||
      chargeKeys.has(key)
    ) {
      reject("INVALID_CONFIGURATION", "Sitter pet-charge rules are invalid.");
    }
    chargeKeys.add(key);
    requireNonNegativeInteger(charge.includedCount, "pet charge includedCount");
    requireMoney(charge.additionalCents, "pet charge additionalCents");
  }
}

function validateCareOption(careOption) {
  if (!careOption || typeof careOption !== "object") {
    reject("CARE_OPTION_NOT_FOUND", "The canonical care option does not exist.");
  }
  if (!careOption.isActive) {
    reject("INACTIVE_CARE_OPTION", "The canonical care option is inactive.");
  }
  if (
    typeof careOption.code !== "string" ||
    !careOption.code ||
    typeof careOption.label !== "string" ||
    !careOption.label
  ) {
    reject("INVALID_CONFIGURATION", "Care option metadata is invalid.");
  }
  if (
    careOption.primarySpecies != null &&
    (typeof careOption.primarySpecies !== "string" ||
      !careOption.primarySpecies.trim())
  ) {
    reject("INVALID_CONFIGURATION", "Care option primary species is invalid.");
  }

  const clientRate = careOption.clientRate;
  if (!clientRate || !clientRate.isActive) {
    reject(
      "CLIENT_RATE_UNAVAILABLE",
      "An active client rate is required for compensation ceiling validation.",
    );
  }
  requireMoney(clientRate.baseRateCents, "client baseRateCents");
  if (typeof clientRate.currency !== "string" || !clientRate.currency) {
    reject("INVALID_CONFIGURATION", "Client rate currency is invalid.");
  }
}

function findCharge(petCharges, species, ordinal) {
  return petCharges
    .filter(
      (charge) => charge.species === species && charge.includedCount < ordinal,
    )
    .sort((left, right) => right.includedCount - left.includedCount)[0];
}

export function calculateMaximumOrdinaryBaseCompensationCents(
  clientBaseRateCents,
) {
  requireMoney(clientBaseRateCents, "client baseRateCents");
  return Math.floor(
    (clientBaseRateCents * BUSINESS_ASSIGNED_BASE_CEILING_BPS) / 10_000,
  );
}

export function selectBusinessAssignedSitterRate({
  sitterRate,
  defaultRate,
}) {
  if (sitterRate?.isActive) {
    return { rate: sitterRate, rateSource: "SITTER_OVERRIDE" };
  }
  if (defaultRate?.isActive) {
    return { rate: defaultRate, rateSource: "DEFAULT_RATE" };
  }
  if (sitterRate || defaultRate) {
    reject(
      "INACTIVE_COMPENSATION_RATE",
      "No active sitter compensation rate is available.",
    );
  }
  reject("NO_COMPENSATION_RATE", "No sitter compensation rate is configured.");
}

export function validateBusinessAssignedSitter(sitter, sitterId) {
  if (!sitter) {
    reject("SITTER_NOT_FOUND", "The selected sitter does not exist.");
  }
  if (sitter.id !== sitterId || sitter.role !== "SITTER") {
    reject("INVALID_SITTER", "The selected user is not a valid sitter.");
  }
  return sitter;
}

export function calculateBusinessAssignedSitterCompensation({
  careOption,
  rate,
  rateSource,
  sitterId,
  pets,
  quantity,
}) {
  if (typeof sitterId !== "string" || !sitterId.trim()) {
    reject("INVALID_INPUT", "sitterId is required.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    reject("INVALID_INPUT", "quantity must be a positive integer.");
  }
  if (!new Set(["SITTER_OVERRIDE", "DEFAULT_RATE"]).has(rateSource)) {
    reject("INVALID_INPUT", "rateSource is invalid.");
  }

  validateCareOption(careOption);
  validateRate(rate);
  let normalizedPets;
  try {
    normalizedPets = normalizeCanonicalQuotePets(pets);
  } catch (error) {
    if (error instanceof CanonicalClientQuoteError) {
      reject("INVALID_INPUT", error.message);
    }
    throw error;
  }

  if (rate.currency !== careOption.clientRate.currency) {
    reject(
      "CURRENCY_MISMATCH",
      "Client and sitter compensation currencies do not match.",
    );
  }

  const maximumBaseCompensationCents =
    calculateMaximumOrdinaryBaseCompensationCents(
      careOption.clientRate.baseRateCents,
    );
  if (rate.baseCompensationCents > maximumBaseCompensationCents) {
    reject(
      "COMPENSATION_CEILING_EXCEEDED",
      "The configured sitter base compensation exceeds the ordinary 90% ceiling.",
      { maximumBaseCompensationCents },
    );
  }

  const speciesOrdinals = new Map();
  const breakdown = [
    {
      type: "BASE_COMPENSATION",
      label: careOption.label,
      unitAmountCents: rate.baseCompensationCents,
      quantity,
      totalAmountCents: multiplyMoney(
        rate.baseCompensationCents,
        quantity,
        "Base compensation total",
      ),
    },
  ];
  let unitCompensationCents = rate.baseCompensationCents;

  normalizedPets.forEach((pet, petIndex) => {
    const ordinal = (speciesOrdinals.get(pet.species) ?? 0) + 1;
    speciesOrdinals.set(pet.species, ordinal);

    const includedByBase = careOption.primarySpecies
      ? pet.species === careOption.primarySpecies &&
        ordinal <= rate.includedPetCount
      : petIndex < rate.includedPetCount;
    if (includedByBase) return;

    const charge = findCharge(rate.petCharges, pet.species, ordinal);
    const amountCents =
      charge?.additionalCents ?? rate.defaultAdditionalCents;
    if (amountCents == null) {
      reject(
        "INCOMPLETE_PET_COMPENSATION",
        `No sitter compensation rule exists for ${pet.species} #${ordinal}.`,
        { species: pet.species, speciesOrdinal: ordinal },
      );
    }

    unitCompensationCents += amountCents;
    breakdown.push({
      type: "ADDITIONAL_PET_COMPENSATION",
      label: `${pet.name} · ${pet.species}`,
      petIndex,
      petName: pet.name,
      species: pet.species,
      speciesOrdinal: ordinal,
      thresholdIncludedCount: charge?.includedCount ?? null,
      unitAmountCents: amountCents,
      quantity,
      totalAmountCents: multiplyMoney(
        amountCents,
        quantity,
        "Additional-pet compensation total",
      ),
    });
  });

  if (
    !Number.isSafeInteger(unitCompensationCents) ||
    unitCompensationCents > MAX_MONEY_CENTS
  ) {
    reject(
      "INVALID_MONEY_CONFIGURATION",
      "Unit sitter compensation exceeds the supported monetary range.",
    );
  }
  const sitterCompensationSubtotalCents = multiplyMoney(
    unitCompensationCents,
    quantity,
    "Aggregate sitter compensation",
  );
  let economics;
  try {
    economics = calculateSitterEconomics(sitterCompensationSubtotalCents);
  } catch (error) {
    if (error instanceof RangeError) {
      reject(
        "INVALID_MONEY_CONFIGURATION",
        "Aggregate sitter compensation exceeds the supported monetary range.",
      );
    }
    throw error;
  }

  return {
    careOption: {
      code: careOption.code,
      label: careOption.label,
      primarySpecies: careOption.primarySpecies ?? null,
    },
    sitterId: sitterId.trim(),
    rateSource,
    currency: rate.currency,
    sourceRate: { id: rate.id, version: rate.version },
    pets: normalizedPets,
    quantity,
    unitCompensationCents,
    ...economics,
    sitterFeeBasisPoints: SITTER_FEE_BPS,
    maximumBaseCompensationCents,
    breakdown,
  };
}
