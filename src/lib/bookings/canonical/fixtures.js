// Synthetic catalog used only by canonical contract and disposable QA tests.
export function optionFixture(code = "DROP_IN_DOG_30") {
  const overnight = code.startsWith("OVERNIGHT");
  const cat = code.includes("CAT");
  const duration = overnight ? null : +code.split("_").at(-1);
  const species = cat ? "Cat" : "Dog";
  const base = overnight ? cat ? 4200 : 6000 : code === "DOG_WALK_15" ? 2200 : duration === 15 ? 2000 : duration === 30 ? 2500 : 3000;
  const offeringCode = overnight ? "OVERNIGHT" : code.startsWith("DOG_WALK") ? "WALK" : "DROP_IN";
  return {
    id: `option-${code}`, code, label: code, primarySpecies: species, durationMinutes: duration, isActive: true,
    offering: {
      id: `offering-${code}`, code: offeringCode, name: offeringCode, billingUnit: overnight ? "NIGHT" : "VISIT", scheduleKind: overnight ? "OVERNIGHT_STAY" : "TIMED_VISIT",
      allowsMixedSpecies: overnight, allowsUnlistedSpecies: false, minimumPetCount: 1, maximumPetCount: null, isActive: true,
      speciesPolicies: (overnight ? ["Dog", "Cat"] : [species]).map((s) => ({ species: s, isSupported: true, minimumCount: 0, maximumCount: null })),
    },
    clientRate: {
      id: `rate-${code}`, currency: "USD", baseRateCents: base, version: 2, isActive: true, includedPetCount: 1, defaultAdditionalCents: null,
      petCharges: [
        { species, includedCount: 1, additionalCents: overnight ? cat ? 800 : 2000 : cat ? 300 : 500 },
        ...(!cat && overnight ? [{ species: "Cat", includedCount: 0, additionalCents: 800 }] : []),
      ],
    },
  };
}
export const petsFixture = (...species) => species.map((s, i) => ({ name: `Pet ${i + 1}`, species: s }));
export function timedSchedule(count = 1, duration = 30) {
  return { kind: "TIMED_VISIT", visits: Array.from({ length: count }, (_, i) => ({ date: `2030-09-${String(12 + i).padStart(2, "0")}`, startTime: "09:00", endTime: duration === 60 ? "10:00" : `09:${String(duration).padStart(2, "0")}` })) };
}
export const overnightSchedule = (arrivalDate = "2030-09-12", departureDate = "2030-09-14") => ({ kind: "OVERNIGHT_STAY", arrivalDate, departureDate, arrivalTime: "19:00", departureTime: "07:00" });
export const bookingInput = (overrides = {}) => ({ client: { name: "QA Client", email: "canonical@example.invalid" }, careOptionCode: "DROP_IN_DOG_30", pets: petsFixture("Dog"), schedule: timedSchedule(), ...overrides });
