function normalizePetNames(petNames) {
  if (!Array.isArray(petNames)) return [];

  return petNames
    .filter((name) => typeof name === "string")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function formatBookingPetNames(
  petNames,
  fallback = "Pet care booking"
) {
  const names = normalizePetNames(petNames);

  if (names.length === 0) {
    return typeof fallback === "string" && fallback.trim()
      ? fallback.trim()
      : "Pet care booking";
  }

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;

  return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

export function getPetNameLabel(petNames) {
  return normalizePetNames(petNames).length === 1 ? "Pet" : "Pets";
}
