// src/app/book/steps/BookingStepClientInfo.jsx
"use client";

import { FieldGroup, FormField } from "@/components/ui/Foundation";

const DOG_SIZE_OPTIONS = [
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LARGE", label: "Large" },
];

const WEIGHT_CLASS_OPTIONS = [
  { value: "TOY", label: "Toy · under 10 lbs" },
  { value: "SMALL_10_25", label: "Small · 10–25 lbs" },
  { value: "MEDIUM_26_50", label: "Medium · 26–50 lbs" },
  { value: "LARGE_51_80", label: "Large · 51–80 lbs" },
  { value: "XL_81_PLUS", label: "XL · 81+ lbs" },
];

export default function BookingStepClientInfo({
  client,
  setClient,
  serviceLocation,
  setServiceLocation,
  notes,
  setNotes,
  dogSize = [],
  toggleDogSize,
  weightClass = "",
  setWeightClass,
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
            Add pet size details to help with planning and service fit.
          </p>
        </div>

        <div className="space-y-4">
          <FieldGroup legend="Dog size">
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
                    dogSize.includes(option.value)
                  )
                    .map((option) => option.label)
                    .join(", ")
                : "None yet"}
            </p>
          </FieldGroup>

          <FormField
              as="select"
              id="weight-class"
              label="Weight class"
              hint="Choose the closest fit for your pet."
              value={weightClass}
              onChange={(e) => setWeightClass?.(e.target.value)}
            >
              <option value="">Select weight class</option>
              {WEIGHT_CLASS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </FormField>
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
