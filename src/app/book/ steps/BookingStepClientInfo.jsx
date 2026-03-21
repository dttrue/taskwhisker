// src/app/book/steps/BookingStepClientInfo.jsx
"use client";

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
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-zinc-900">Your info</h2>
          <p className="text-xs text-zinc-500">
            Enter your contact details for this booking request.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              Name
            </label>
            <input
              type="text"
              value={client.name}
              onChange={(e) => updateClientField("name", e.target.value)}
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-900">
              Email
            </label>
            <input
              type="email"
              value={client.email}
              onChange={(e) => updateClientField("email", e.target.value)}
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-900">
              Phone
            </label>
            <input
              type="tel"
              value={client.phone}
              onChange={(e) => updateClientField("phone", e.target.value)}
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="Phone number"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-zinc-900">Service address</h2>
          <p className="text-xs text-zinc-500">
            This is where the visit will happen.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              Address line 1
            </label>
            <input
              type="text"
              value={serviceLocation.addressLine1}
              onChange={(e) =>
                updateLocationField("addressLine1", e.target.value)
              }
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="Street address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-900">
              Address line 2
            </label>
            <input
              type="text"
              value={serviceLocation.addressLine2}
              onChange={(e) =>
                updateLocationField("addressLine2", e.target.value)
              }
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="Apartment, unit, etc. (optional)"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-zinc-900">
                City
              </label>
              <input
                type="text"
                value={serviceLocation.city}
                onChange={(e) => updateLocationField("city", e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2"
                placeholder="City"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900">
                State
              </label>
              <input
                type="text"
                value={serviceLocation.state}
                onChange={(e) => updateLocationField("state", e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2"
                placeholder="State"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900">
                Postal code
              </label>
              <input
                type="text"
                value={serviceLocation.postalCode}
                onChange={(e) =>
                  updateLocationField("postalCode", e.target.value)
                }
                className="mt-1 block w-full rounded border px-3 py-2"
                placeholder="ZIP code"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-900">
              Access instructions
            </label>
            <textarea
              rows={3}
              value={serviceLocation.accessInstructions}
              onChange={(e) =>
                updateLocationField("accessInstructions", e.target.value)
              }
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="Gate code, entry instructions, where to park, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-900">
              Location notes
            </label>
            <textarea
              rows={3}
              value={serviceLocation.locationNotes}
              onChange={(e) =>
                updateLocationField("locationNotes", e.target.value)
              }
              className="mt-1 block w-full rounded border px-3 py-2"
              placeholder="Anything else about the property or service location."
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-zinc-900">Pet details</h2>
          <p className="text-xs text-zinc-500">
            Add pet size details to help with planning and service fit.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium text-zinc-900">
              Dog size
            </div>

            <div className="flex flex-wrap gap-2">
              {DOG_SIZE_OPTIONS.map((option) => {
                const selected = dogSize.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleDogSize?.(option.value)}
                    className={`rounded-full border px-3 py-2 text-sm transition ${
                      selected
                        ? "border-primary bg-primary text-primary-content"
                        : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                    }`}
                    aria-pressed={selected}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              Selected:{" "}
              {dogSize.length
                ? DOG_SIZE_OPTIONS.filter((option) =>
                    dogSize.includes(option.value)
                  )
                    .map((option) => option.label)
                    .join(", ")
                : "None yet"}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-900">
              Weight class
            </label>

            <select
              value={weightClass}
              onChange={(e) => setWeightClass?.(e.target.value)}
              className="block w-full rounded border px-3 py-2"
            >
              <option value="">Select weight class</option>
              {WEIGHT_CLASS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs text-zinc-500">
              Choose the closest fit for your pet.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-zinc-900">General notes</h2>
          <p className="text-xs text-zinc-500">
            Add anything helpful about the pets or visit.
          </p>
        </div>

        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="block w-full rounded border px-3 py-2"
          placeholder="Pet routines, behavior notes, feeding details, medications, anything important..."
        />
      </div>
    </div>
  );
}
