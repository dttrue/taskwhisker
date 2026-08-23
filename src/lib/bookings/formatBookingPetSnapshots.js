import { formatBookingPetNames as formatPetNames } from "./formatPetNames.js";

export function normalizeBookingPetSnapshots(snapshotInput) {
  if (!Array.isArray(snapshotInput)) return [];

  return snapshotInput
    .map((snapshot, inputIndex) => {
      if (!snapshot || typeof snapshot !== "object") return null;

      const nameSnapshot =
        typeof snapshot.nameSnapshot === "string"
          ? snapshot.nameSnapshot.trim()
          : "";

      if (!nameSnapshot) return null;

      const speciesSnapshot =
        typeof snapshot.speciesSnapshot === "string"
          ? snapshot.speciesSnapshot.trim() || null
          : null;

      return {
        nameSnapshot,
        speciesSnapshot,
        position: Number.isInteger(snapshot.position)
          ? snapshot.position
          : inputIndex,
        inputIndex,
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.position - right.position || left.inputIndex - right.inputIndex,
    )
    .map((snapshot) => ({
      nameSnapshot: snapshot.nameSnapshot,
      speciesSnapshot: snapshot.speciesSnapshot,
      position: snapshot.position,
    }));
}

export function formatBookingPetSnapshotNames(snapshotInput) {
  const snapshots = normalizeBookingPetSnapshots(snapshotInput);
  if (snapshots.length === 0) return "";

  return formatPetNames(snapshots.map((snapshot) => snapshot.nameSnapshot), "");
}

export function formatBookingPetSnapshotSpecies(snapshotInput) {
  return normalizeBookingPetSnapshots(snapshotInput)
    .map((snapshot) => snapshot.speciesSnapshot)
    .filter(Boolean)
    .join(" · ");
}

export function resolveBookingPetIdentity({
  bookingPets,
  petNames,
  serviceFallback,
} = {}) {
  const snapshots = normalizeBookingPetSnapshots(bookingPets);
  const snapshotNames = formatBookingPetSnapshotNames(snapshots);

  return {
    name:
      snapshotNames ||
      formatPetNames(petNames, serviceFallback || "Pet care booking"),
    species: formatBookingPetSnapshotSpecies(snapshots),
    snapshots,
  };
}
