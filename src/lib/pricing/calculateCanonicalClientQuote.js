import {
  MAX_PET_FIELD_LENGTH,
  MAX_PUBLIC_BOOKING_PETS,
  OTHER_SPECIES_VALUE,
  buildCanonicalPets,
} from "../../app/book/structuredPets.js";
import {
  CLIENT_FEE_BPS,
  calculateClientEconomics,
} from "./calculatePricing.js";

export class CanonicalClientQuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CanonicalClientQuoteError";
    this.code = code;
  }
}

function reject(code, message) {
  throw new CanonicalClientQuoteError(code, message);
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    reject("INVALID_CONFIGURATION", `${label} must be a non-negative integer.`);
  }
}

function normalizePets(pets) {
  if (!Array.isArray(pets)) {
    reject("INVALID_PETS", "pets must be an array.");
  }
  if (pets.length < 1 || pets.length > MAX_PUBLIC_BOOKING_PETS) {
    reject(
      "INVALID_PET_COUNT",
      `pets must contain between 1 and ${MAX_PUBLIC_BOOKING_PETS} entries.`,
    );
  }
  if (pets.some((pet) => !pet || typeof pet !== "object" || Array.isArray(pet))) {
    reject("INVALID_PETS", "Every pet must be an object.");
  }

  const normalizedPets = buildCanonicalPets(pets);
  normalizedPets.forEach((pet, index) => {
    if (!pet.name || pet.name.length > MAX_PET_FIELD_LENGTH) {
      reject("INVALID_PET_NAME", `Pet ${index + 1} has an invalid name.`);
    }
    if (
      !pet.species ||
      pet.species === OTHER_SPECIES_VALUE ||
      pet.species.length > MAX_PET_FIELD_LENGTH
    ) {
      reject("INVALID_PET_SPECIES", `Pet ${index + 1} has an invalid species.`);
    }
  });
  return normalizedPets;
}

function validateConfiguration(careOption) {
  if (!careOption || typeof careOption !== "object") {
    reject("OPTION_NOT_FOUND", "The canonical care option does not exist.");
  }
  if (!careOption.isActive) {
    reject("INACTIVE_OPTION", "The canonical care option is inactive.");
  }

  const { offering, clientRate } = careOption;
  if (!offering || typeof offering !== "object" || !offering.isActive) {
    reject("INACTIVE_OFFERING", "The canonical care offering is inactive.");
  }
  if (!clientRate || typeof clientRate !== "object" || !clientRate.isActive) {
    reject("INACTIVE_RATE", "No active canonical client rate is available.");
  }
  if (!careOption.code || !offering.code || !clientRate.id) {
    reject("INVALID_CONFIGURATION", "Canonical identifiers are incomplete.");
  }
  if (
    !clientRate.currency ||
    !Number.isInteger(clientRate.version) ||
    clientRate.version < 1
  ) {
    reject("INVALID_CONFIGURATION", "Canonical rate metadata is invalid.");
  }
  requireNonNegativeInteger(clientRate.baseRateCents, "baseRateCents");
  requireNonNegativeInteger(clientRate.includedPetCount, "includedPetCount");
  if (clientRate.defaultAdditionalCents != null) {
    requireNonNegativeInteger(
      clientRate.defaultAdditionalCents,
      "defaultAdditionalCents",
    );
  }
  if (
    !Number.isInteger(offering.minimumPetCount) ||
    offering.minimumPetCount < 0 ||
    (offering.maximumPetCount != null &&
      (!Number.isInteger(offering.maximumPetCount) ||
        offering.maximumPetCount < offering.minimumPetCount))
  ) {
    reject("INVALID_CONFIGURATION", "Offering pet-count limits are invalid.");
  }
  if (!Array.isArray(offering.speciesPolicies) || !Array.isArray(clientRate.petCharges)) {
    reject("INVALID_CONFIGURATION", "Canonical pricing relations are incomplete.");
  }
  if (
    careOption.primarySpecies != null &&
    (typeof careOption.primarySpecies !== "string" ||
      !careOption.primarySpecies.trim())
  ) {
    reject("INVALID_CONFIGURATION", "The option primary species is invalid.");
  }

  const policySpecies = new Set();
  for (const policy of offering.speciesPolicies) {
    if (!policy.species || policySpecies.has(policy.species)) {
      reject("INVALID_CONFIGURATION", "Species policies are invalid or duplicated.");
    }
    policySpecies.add(policy.species);
    requireNonNegativeInteger(policy.minimumCount, "policy minimumCount");
    if (
      policy.maximumCount != null &&
      (!Number.isInteger(policy.maximumCount) ||
        policy.maximumCount < policy.minimumCount)
    ) {
      reject("INVALID_CONFIGURATION", "A species-policy maximum is invalid.");
    }
  }

  const chargeKeys = new Set();
  for (const charge of clientRate.petCharges) {
    const key = `${charge.species}:${charge.includedCount}`;
    if (!charge.species || chargeKeys.has(key)) {
      reject("INVALID_CONFIGURATION", "Pet-charge thresholds are invalid or duplicated.");
    }
    chargeKeys.add(key);
    requireNonNegativeInteger(charge.includedCount, "charge includedCount");
    requireNonNegativeInteger(charge.additionalCents, "charge additionalCents");
  }
}

function countSpecies(pets) {
  const counts = new Map();
  for (const pet of pets) {
    counts.set(pet.species, (counts.get(pet.species) ?? 0) + 1);
  }
  return counts;
}

function validateCompatibility(careOption, pets, speciesCounts) {
  const { offering, primarySpecies } = careOption;
  if (pets.length < offering.minimumPetCount) {
    reject("TOO_FEW_PETS", "The booking does not meet the minimum pet count.");
  }
  if (offering.maximumPetCount != null && pets.length > offering.maximumPetCount) {
    reject("TOO_MANY_PETS", "The booking exceeds the maximum pet count.");
  }
  if (!offering.allowsMixedSpecies && speciesCounts.size > 1) {
    reject("MIXED_SPECIES_NOT_ALLOWED", "This offering does not allow mixed species.");
  }
  if (primarySpecies && !speciesCounts.has(primarySpecies)) {
    reject(
      "PRIMARY_SPECIES_REQUIRED",
      `This option requires at least one ${primarySpecies}.`,
    );
  }

  const policies = new Map(
    offering.speciesPolicies.map((policy) => [policy.species, policy]),
  );
  for (const [species, count] of speciesCounts) {
    const policy = policies.get(species);
    if (!policy) {
      if (!offering.allowsUnlistedSpecies) {
        reject("UNSUPPORTED_SPECIES", `${species} is not supported by this offering.`);
      }
      continue;
    }
    if (!policy.isSupported) {
      reject("UNSUPPORTED_SPECIES", `${species} is not supported by this offering.`);
    }
    if (count < policy.minimumCount) {
      reject("SPECIES_MINIMUM", `${species} does not meet the required minimum count.`);
    }
    if (policy.maximumCount != null && count > policy.maximumCount) {
      reject("SPECIES_MAXIMUM", `${species} exceeds the supported maximum count.`);
    }
  }
  for (const policy of offering.speciesPolicies) {
    const count = speciesCounts.get(policy.species) ?? 0;
    if (policy.isSupported && count < policy.minimumCount) {
      reject(
        "SPECIES_MINIMUM",
        `${policy.species} does not meet the required minimum count.`,
      );
    }
  }
}

function findCharge(petCharges, species, ordinal) {
  return petCharges
    .filter(
      (charge) => charge.species === species && charge.includedCount < ordinal,
    )
    .sort((left, right) => right.includedCount - left.includedCount)[0];
}

export function calculateCanonicalClientQuote({ careOption, pets }) {
  validateConfiguration(careOption);
  const normalizedPets = normalizePets(pets);
  const speciesCounts = countSpecies(normalizedPets);
  validateCompatibility(careOption, normalizedPets, speciesCounts);

  const { offering, clientRate, primarySpecies } = careOption;
  const speciesOrdinals = new Map();
  const breakdown = [
    {
      type: "BASE_CARE",
      label: careOption.label,
      quantity: 1,
      amountCents: clientRate.baseRateCents,
    },
  ];
  let serviceSubtotalCents = clientRate.baseRateCents;

  normalizedPets.forEach((pet, petIndex) => {
    const ordinal = (speciesOrdinals.get(pet.species) ?? 0) + 1;
    speciesOrdinals.set(pet.species, ordinal);

    const includedByBase = primarySpecies
      ? pet.species === primarySpecies && ordinal <= clientRate.includedPetCount
      : petIndex < clientRate.includedPetCount;
    if (includedByBase) return;

    const charge = findCharge(clientRate.petCharges, pet.species, ordinal);
    const amountCents = charge?.additionalCents ?? clientRate.defaultAdditionalCents;
    if (amountCents == null) {
      reject(
        "MISSING_PET_PRICE",
        `No additional-pet price exists for ${pet.species} #${ordinal}.`,
      );
    }

    serviceSubtotalCents += amountCents;
    breakdown.push({
      type: "ADDITIONAL_PET",
      label: `${pet.name} · ${pet.species}`,
      petIndex,
      petName: pet.name,
      species: pet.species,
      speciesOrdinal: ordinal,
      thresholdIncludedCount: charge?.includedCount ?? null,
      quantity: 1,
      amountCents,
    });
  });

  const economics = calculateClientEconomics(serviceSubtotalCents);
  return {
    careOffering: {
      code: offering.code,
      name: offering.name,
      billingUnit: offering.billingUnit,
      scheduleKind: offering.scheduleKind,
    },
    careOption: {
      code: careOption.code,
      label: careOption.label,
      primarySpecies,
      durationMinutes: careOption.durationMinutes,
    },
    pets: normalizedPets,
    quantity: 1,
    currency: clientRate.currency,
    rate: { id: clientRate.id, version: clientRate.version },
    clientFeeBasisPoints: CLIENT_FEE_BPS,
    ...economics,
    breakdown,
  };
}
