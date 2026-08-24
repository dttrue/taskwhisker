export const MAX_PUBLIC_BOOKING_PETS = 10;
export const MAX_PET_FIELD_LENGTH = 50;
export const OTHER_SPECIES_VALUE = "Other";

export const COMMON_PET_SPECIES = [
  "Dog",
  "Cat",
  "Rabbit",
  "Bird",
  "Small Animal",
  "Reptile",
  "Fish",
];

export function resolvePetSpecies(pet) {
  if (!pet || typeof pet !== "object") return "";

  const value =
    pet.species === OTHER_SPECIES_VALUE ? pet.customSpecies : pet.species;

  return typeof value === "string" ? value.trim() : "";
}

export function buildCanonicalPets(petRows) {
  if (!Array.isArray(petRows)) return [];

  return petRows.map((pet) => ({
    name: typeof pet?.name === "string" ? pet.name.trim() : "",
    species: resolvePetSpecies(pet),
  }));
}

export function getPetRowErrors(petRows) {
  if (!Array.isArray(petRows)) return [];

  return petRows.map((pet) => {
    const name = typeof pet?.name === "string" ? pet.name.trim() : "";
    const species = resolvePetSpecies(pet);

    return {
      id: pet?.id,
      name: !name
        ? "Pet name is required."
        : name.length > MAX_PET_FIELD_LENGTH
          ? `Pet name must be ${MAX_PET_FIELD_LENGTH} characters or fewer.`
          : "",
      species: !species
        ? pet?.species === OTHER_SPECIES_VALUE
          ? "Enter your pet's type."
          : "Pet type is required."
        : species.length > MAX_PET_FIELD_LENGTH
          ? `Pet type must be ${MAX_PET_FIELD_LENGTH} characters or fewer.`
          : "",
    };
  });
}
