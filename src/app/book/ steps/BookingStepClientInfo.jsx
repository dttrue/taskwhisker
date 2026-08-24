// src/app/book/steps/BookingStepClientInfo.jsx
"use client";

import { Button, FieldGroup, FormField } from "@/components/ui/Foundation";
import {
  COMMON_PET_SPECIES,
  MAX_PET_FIELD_LENGTH,
  MAX_PUBLIC_BOOKING_PETS,
  OTHER_SPECIES_VALUE,
} from "../structuredPets";

const DOG_SIZE_OPTIONS = [
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LARGE", label: "Large" },
];

function PetTypeIcon({ type }) {
  const sharedProps = {
    "aria-hidden": true,
    className: "h-5 w-5 shrink-0",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (type === "Dog") {
    return (
      <svg {...sharedProps}>
        <path d="M8.4 10.2c-1.3-1.6-3.7-1.5-4.4.3-.7 1.9.8 3.5 2.7 3.3" />
        <path d="M15.6 10.2c1.3-1.6 3.7-1.5 4.4.3.7 1.9-.8 3.5-2.7 3.3" />
        <path d="M8 9.5c.2-3 1.8-4.5 4-4.5s3.8 1.5 4 4.5v4c0 3-1.7 5.5-4 5.5s-4-2.5-4-5.5z" />
        <path d="M10 14h4l-2 2z" />
      </svg>
    );
  }

  if (type === "Cat") {
    return (
      <svg {...sharedProps}>
        <path d="m7 8-2-4v10a7 7 0 0 0 14 0V4l-2 4" />
        <path d="M7 8c3-2 7-2 10 0M9 13h.01M15 13h.01M10 16c1.3 1 2.7 1 4 0" />
      </svg>
    );
  }

  if (type === "Rabbit") {
    return (
      <svg {...sharedProps}>
        <path d="M9 9C6 6 6 2 8 2c2.5 0 3 4 3 7M15 9c3-3 3-7 1-7-2.5 0-3 4-3 7" />
        <path d="M6 14a6 6 0 0 1 12 0v1a6 6 0 0 1-12 0zM9 14h.01M15 14h.01M11 17h2" />
      </svg>
    );
  }

  if (type === "Bird") {
    return (
      <svg {...sharedProps}>
        <path d="M19 8h3l-3 2M17 8a7 7 0 1 0 1 9" />
        <path d="M8 13c3 0 5 1 7 4M17 6h.01" />
      </svg>
    );
  }

  if (type === "Small Animal") {
    return (
      <svg {...sharedProps}>
        <circle cx="7" cy="8" r="3" />
        <circle cx="17" cy="8" r="3" />
        <path d="M6 13a6 6 0 0 1 12 0v2a6 6 0 0 1-12 0zM9 14h.01M15 14h.01M11 17h2" />
      </svg>
    );
  }

  if (type === "Reptile") {
    return (
      <svg {...sharedProps}>
        <path d="M4 15c3-7 9-9 15-6 2 1 2 4 0 5-3 1-5-2-8 0-2 1-2 4 1 5" />
        <path d="m18 9 2-2M18 14l2 2M8 15l-2 2M10 11 8 9" />
      </svg>
    );
  }

  if (type === "Fish") {
    return (
      <svg {...sharedProps}>
        <path d="M16 8c-4-3-9-2-12 4 3 6 8 7 12 4l4 3v-6l-4-5zM7 12h.01" />
      </svg>
    );
  }

  return (
    <svg {...sharedProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export default function BookingStepClientInfo({
  client,
  setClient,
  pets = [],
  setPets,
  petErrors = [],
  setPetErrors,
  serviceLocation,
  setServiceLocation,
  notes,
  setNotes,
  dogSize = [],
  toggleDogSize,
  hasDog = false,
}) {
  function updateClientField(field, value) {
    setClient((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateLocationField(field, value) {
    setServiceLocation((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function clearPetError(id, field) {
    setPetErrors?.((previous) =>
      previous.map((error) =>
        error.id === id ? { ...error, [field]: "" } : error,
      ),
    );
  }

  function updatePet(id, patch) {
    setPets((previous) =>
      previous.map((pet) => (pet.id === id ? { ...pet, ...patch } : pet)),
    );
  }

  function addPet() {
    setPets((previous) =>
      previous.length >= MAX_PUBLIC_BOOKING_PETS
        ? previous
        : [
            ...previous,
            {
              id: globalThis.crypto.randomUUID(),
              name: "",
              species: "",
              customSpecies: "",
            },
          ],
    );
  }

  function removePet(id) {
    setPets((previous) =>
      previous.length === 1
        ? previous
        : previous.filter((pet) => pet.id !== id),
    );
    setPetErrors?.((previous) =>
      previous.filter((error) => error.id !== id),
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-[var(--task-text)]">Your info</h2>
          <p className="mt-1 text-sm text-[var(--task-text-muted)]">
            Enter your contact details for this booking request.
          </p>
        </div>

        <div className="space-y-3">
          <FormField
              id="client-name"
              label="Name"
              type="text"
              value={client.name}
              onChange={(e) => updateClientField("name", e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              aria-required="true"
            />

          <FormField
              id="client-email"
              label="Email"
              type="email"
              value={client.email}
              onChange={(e) => updateClientField("email", e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-required="true"
            />

          <FormField
              id="client-phone"
              label="Phone"
              type="tel"
              value={client.phone}
              onChange={(e) => updateClientField("phone", e.target.value)}
              placeholder="Phone number"
              autoComplete="tel"
            />
        </div>
      </section>

      <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-[var(--task-text)]">Service address</h2>
          <p className="mt-1 text-sm text-[var(--task-text-muted)]">
            This is where the visit will happen.
          </p>
        </div>

        <div className="space-y-3">
          <FormField
              id="service-address-line-1"
              label="Address line 1"
              type="text"
              value={serviceLocation.addressLine1}
              onChange={(e) =>
                updateLocationField("addressLine1", e.target.value)
              }
              placeholder="Street address"
              autoComplete="address-line1"
              aria-required="true"
            />

          <FormField
              id="service-address-line-2"
              label="Address line 2"
              type="text"
              value={serviceLocation.addressLine2}
              onChange={(e) =>
                updateLocationField("addressLine2", e.target.value)
              }
              placeholder="Apartment, unit, etc. (optional)"
              autoComplete="address-line2"
            />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
                id="service-city"
                label="City"
                type="text"
                value={serviceLocation.city}
                onChange={(e) => updateLocationField("city", e.target.value)}
                placeholder="City"
                autoComplete="address-level2"
                aria-required="true"
              />

            <FormField
                id="service-state"
                label="State"
                type="text"
                value={serviceLocation.state}
                onChange={(e) => updateLocationField("state", e.target.value)}
                placeholder="State"
                autoComplete="address-level1"
                aria-required="true"
              />

            <FormField
                id="service-postal-code"
                label="Postal code"
                type="text"
                value={serviceLocation.postalCode}
                onChange={(e) =>
                  updateLocationField("postalCode", e.target.value)
                }
                placeholder="ZIP code"
                autoComplete="postal-code"
                inputMode="numeric"
                aria-required="true"
              />
          </div>

          <FormField
              as="textarea"
              id="access-instructions"
              label="Access instructions"
              rows={3}
              value={serviceLocation.accessInstructions}
              onChange={(e) =>
                updateLocationField("accessInstructions", e.target.value)
              }
              placeholder="Gate code, entry instructions, where to park, etc."
            />

          <FormField
              as="textarea"
              id="location-notes"
              label="Location notes"
              rows={3}
              value={serviceLocation.locationNotes}
              onChange={(e) =>
                updateLocationField("locationNotes", e.target.value)
              }
              placeholder="Anything else about the property or service location."
            />
        </div>
      </section>

      <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-[var(--task-text)]">Pet details</h2>
          <p className="mt-1 text-sm text-[var(--task-text-muted)]">
            Add each pet included in this booking, then provide size details.
          </p>
        </div>

        <div className="space-y-4">
          <FieldGroup legend="Your pets">
            <div className="space-y-3">
              {pets.map((pet, index) => {
                const rowError =
                  petErrors.find((error) => error.id === pet.id) || {};

                return (
                  <div
                    key={pet.id}
                    className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[var(--task-text)]">
                        Pet {index + 1}
                      </h3>
                      {pets.length > 1 ? (
                        <Button
                          type="button"
                          variant="quiet"
                          className="min-h-9 px-2.5 py-1.5"
                          onClick={() => removePet(pet.id)}
                          aria-label={`Remove pet ${index + 1}`}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <FormField
                        id={`pet-name-${pet.id}`}
                        label="Pet name"
                        type="text"
                        value={pet.name}
                        onChange={(event) => {
                          updatePet(pet.id, { name: event.target.value });
                          clearPetError(pet.id, "name");
                        }}
                        error={rowError.name}
                        maxLength={MAX_PET_FIELD_LENGTH}
                        autoComplete="off"
                        aria-required="true"
                      />

                      <fieldset
                        className="min-w-0"
                        aria-required="true"
                        aria-describedby={
                          pet.species !== OTHER_SPECIES_VALUE && rowError.species
                            ? `pet-species-error-${pet.id}`
                            : undefined
                        }
                      >
                        <legend className="mb-2 text-sm font-semibold text-[var(--task-text)]">
                          Type
                        </legend>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[...COMMON_PET_SPECIES, OTHER_SPECIES_VALUE].map(
                            (species) => {
                              const selected = pet.species === species;

                              return (
                                <button
                                  key={species}
                                  type="button"
                                  onClick={() => {
                                    updatePet(pet.id, { species });
                                    clearPetError(pet.id, "species");
                                  }}
                                  className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[var(--task-radius-control)] border px-2.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--task-focus)] ${
                                    selected
                                      ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white"
                                      : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)] hover:bg-[var(--task-surface)]"
                                  }`}
                                  aria-pressed={selected}
                                >
                                  <PetTypeIcon type={species} />
                                  <span className="min-w-0 leading-tight">
                                    {species}
                                  </span>
                                </button>
                              );
                            },
                          )}
                        </div>
                        {pet.species !== OTHER_SPECIES_VALUE &&
                        rowError.species ? (
                          <p
                            id={`pet-species-error-${pet.id}`}
                            className="mt-2 text-sm text-[var(--task-danger)]"
                            role="alert"
                          >
                            {rowError.species}
                          </p>
                        ) : null}
                      </fieldset>
                    </div>

                    {pet.species === OTHER_SPECIES_VALUE ? (
                      <FormField
                        id={`pet-custom-species-${pet.id}`}
                        label="What kind of pet?"
                        className="mt-3"
                        type="text"
                        value={pet.customSpecies}
                        onChange={(event) => {
                          updatePet(pet.id, {
                            customSpecies: event.target.value,
                          });
                          clearPetError(pet.id, "species");
                        }}
                        error={rowError.species}
                        maxLength={MAX_PET_FIELD_LENGTH}
                        autoComplete="off"
                        aria-required="true"
                        placeholder="For example, Snail"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="quiet"
              className="mt-3"
              onClick={addPet}
              disabled={pets.length >= MAX_PUBLIC_BOOKING_PETS}
            >
              Add another pet
            </Button>
            <p className="mt-2 text-xs leading-5 text-[var(--task-text-muted)]">
              Up to {MAX_PUBLIC_BOOKING_PETS} pets may be included in one
              booking.
            </p>
          </FieldGroup>

          {hasDog ? (
            <FieldGroup legend="Dog sizes in this booking">
              <p className="mb-3 text-sm text-[var(--task-text-muted)]">
                Select all sizes that apply to the dogs in this booking.
              </p>
              <div className="flex flex-wrap gap-2">
                {DOG_SIZE_OPTIONS.map((option) => {
                  const selected = dogSize.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleDogSize?.(option.value)}
                      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        selected
                          ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white"
                          : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
                      }`}
                      aria-pressed={selected}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 text-xs text-[var(--task-text-muted)]">
                Selected:{" "}
                {dogSize.length
                  ? DOG_SIZE_OPTIONS.filter((option) =>
                      dogSize.includes(option.value),
                    )
                      .map((option) => option.label)
                      .join(", ")
                  : "None yet"}
              </p>
            </FieldGroup>
          ) : null}
        </div>
      </section>

      <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-[var(--task-text)]">General notes</h2>
          <p className="mt-1 text-sm text-[var(--task-text-muted)]">
            Add anything helpful about the pets or visit.
          </p>
        </div>

        <FormField
          as="textarea"
          id="general-notes"
          label="Pet and visit notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Pet routines, behavior notes, feeding details, medications, anything important..."
        />
      </section>
    </div>
  );
}
