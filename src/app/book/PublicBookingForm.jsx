// src/app/book/PublicBookingForm.jsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { createPublicBooking } from "./actions";
import AdaptiveCalendar from "@/components/AdaptiveCalendar";
import ServicePicker from "./ServicePicker";

// ✅ Added Add-ons step
const STEPS = ["Service", "Schedule", "Add-ons", "Your info", "Review"];

export function PublicBookingForm({ serviceOptions = [] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  // Step state
  const [step, setStep] = useState(0);

  // Guard: no services configured
  const firstService = serviceOptions[0] || null;

  const [serviceCode, setServiceCode] = useState(firstService?.code || "");
  const [serviceType, setServiceType] = useState(
    firstService?.serviceType || "OVERNIGHT"
  );

  // Calendar state
  const [range, setRange] = useState();
  const [dates, setDates] = useState([]);

  const isRange = serviceType === "OVERNIGHT";

  const payloadService = useMemo(() => {
    return serviceOptions.find((s) => s.code === serviceCode) || firstService;
  }, [serviceOptions, serviceCode, firstService]);

  // Add-ons (Phase 1: hard-coded selection rules; server will price)
  const [addOns, setAddOns] = useState({
    nailTrim: { enabled: false, appliesTo: "ONCE" }, // ONCE | EACH_VISIT
    bath: {
      enabled: false,
      appliesTo: "ONCE",
      smallDogs: 0,
      largeDogs: 0,
    },
  });

  function toggleAddOn(key) {
    setAddOns((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  }

  function setAddOnField(key, field, value) {
    setAddOns((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  // Client state (so review step can show it cleanly)
  const [client, setClient] = useState({
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
  });

  const [times, setTimes] = useState({
    startTime: "",
    endTime: "",
  });

  const [notes, setNotes] = useState("");

  if (!firstService) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-4">Request a Booking</h1>
        <p className="text-sm text-red-600">
          No services are configured yet. Please add services in the dashboard.
        </p>
      </div>
    );
  }

  function goNext() {
    setError(null);

    // Step-level validation
    if (step === 0) {
      if (!serviceCode) return setError("Please select a service.");
    }

    if (step === 1) {
      if (isRange) {
        if (!range?.from || !range?.to) {
          return setError(
            "Please select a valid check-in and check-out range."
          );
        }
      } else {
        if (!dates.length) return setError("Please select at least one date.");
      }

      if (!times.startTime) return setError("Start time is required.");
      if (!times.endTime) return setError("End time is required.");
    }

    // step === 2 (Add-ons)
    if (step === 2) {
      if (addOns.bath.enabled) {
        const totalDogs =
          (addOns.bath.smallDogs || 0) + (addOns.bath.largeDogs || 0);
        if (totalDogs === 0) {
          return setError(
            "For Bath, please enter at least 1 dog (small or large)."
          );
        }
      }
    }

    // step === 3 (Your info)
    if (step === 3) {
      if (!client.name?.trim()) return setError("Name is required.");
      if (!client.email?.trim()) return setError("Email is required.");
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function buildPayload() {
    // Work out dates based on mode
    let mode;
    let startDate;
    let endDate;
    let datesArray;

    if (isRange) {
      mode = "RANGE";
      startDate = range.from.toISOString().slice(0, 10);
      endDate = range.to.toISOString().slice(0, 10);
    } else {
      mode = "MULTIPLE";
      datesArray = dates.map((d) => d.toISOString().slice(0, 10));
    }

    if (!payloadService) {
      throw new Error("Service configuration is missing.");
    }

    const addOnsPayload = [];

    if (addOns.nailTrim.enabled) {
      addOnsPayload.push({
        code: "NAIL_TRIM",
        appliesTo: addOns.nailTrim.appliesTo,
      });
    }

    if (addOns.bath.enabled) {
      addOnsPayload.push({
        code: "BATH",
        appliesTo: addOns.bath.appliesTo,
        smallDogs: addOns.bath.smallDogs,
        largeDogs: addOns.bath.largeDogs,
      });
    }

    return {
      serviceType: payloadService.serviceType,
      serviceCode: payloadService.code,
      serviceSummary: payloadService.label ?? payloadService.name,

      client: {
        name: client.name,
        email: client.email,
        phone: client.phone || undefined,
        addressLine1: client.addressLine1 || undefined,
        addressLine2: client.addressLine2 || undefined,
        city: client.city || undefined,
        state: client.state || undefined,
        postalCode: client.postalCode || undefined,
      },

      mode,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      dates: datesArray || undefined,

      startTime: times.startTime,
      endTime: times.endTime,

      addOns: addOnsPayload.length ? addOnsPayload : undefined,

      notes: notes || undefined,
    };
  }

  function handleFinalSubmit() {
    if (booking) return; // ✅ prevent duplicate submits

    setError(null);
    setBooking(null);

    startTransition(async () => {
      try {
        const payload = buildPayload();
        console.log("📤 Submitting public booking payload:", payload);

        const res = await createPublicBooking(payload);
        if (!res.ok) {
          setError(res.error || "Could not create booking.");
          return;
        }

        setBooking(res.booking);
      } catch (err) {
        setError(err?.message || "Something went wrong.");
      }
    });
  }

  const reviewDates = isRange
    ? range?.from && range?.to
      ? `${range.from.toDateString()} → ${range.to.toDateString()}`
      : "—"
    : dates.length
    ? dates.map((d) => d.toDateString()).join(", ")
    : "—";

  const hasAnyAddOns = addOns.nailTrim.enabled || addOns.bath.enabled;

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Request a Booking</h1>

        {/* DaisyUI steps */}
        <ul className="steps steps-horizontal w-full mt-3">
          {STEPS.map((label, idx) => (
            <li
              key={label}
              className={`step ${idx <= step ? "step-primary" : ""}`}
            >
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        {/* STEP 0 — Service */}
        {step === 0 && (
          <div className="space-y-3">
            <ServicePicker
              options={serviceOptions}
              value={serviceCode}
              onChange={(svc) => {
                setServiceCode(svc.code);
                setServiceType(svc.serviceType);
              }}
            />

            <p className="text-xs text-gray-500">
              Next: pick dates + time window.
            </p>
          </div>
        )}

        {/* STEP 1 — Schedule */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Select dates</p>
              <AdaptiveCalendar
                serviceType={serviceType}
                range={range}
                setRange={setRange}
                dates={dates}
                setDates={setDates}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium">Start time</label>
                <input
                  name="startTime"
                  type="time"
                  value={times.startTime}
                  onChange={(e) =>
                    setTimes((t) => ({ ...t, startTime: e.target.value }))
                  }
                  className="mt-1 block w-full border rounded px-2 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">End time</label>
                <input
                  name="endTime"
                  type="time"
                  value={times.endTime}
                  onChange={(e) =>
                    setTimes((t) => ({ ...t, endTime: e.target.value }))
                  }
                  className="mt-1 block w-full border rounded px-2 py-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 — Add-ons */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="border rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Nail Trim</div>
                  <div className="text-xs text-gray-500">
                    Add-on: +20 min, +$15 (standalone differs).
                  </div>
                </div>

                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={addOns.nailTrim.enabled}
                  onChange={() => toggleAddOn("nailTrim")}
                />
              </div>

              {addOns.nailTrim.enabled && (
                <div className="mt-3">
                  <div className="text-xs font-medium mb-1">Applies</div>
                  <div className="join join-vertical sm:join-horizontal">
                    <button
                      type="button"
                      className={`btn btn-sm join-item ${
                        addOns.nailTrim.appliesTo === "ONCE"
                          ? "btn-primary"
                          : "btn-ghost"
                      }`}
                      onClick={() =>
                        setAddOnField("nailTrim", "appliesTo", "ONCE")
                      }
                    >
                      Once
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm join-item ${
                        addOns.nailTrim.appliesTo === "EACH_VISIT"
                          ? "btn-primary"
                          : "btn-ghost"
                      }`}
                      onClick={() =>
                        setAddOnField("nailTrim", "appliesTo", "EACH_VISIT")
                      }
                    >
                      Each visit
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Bath</div>
                  <div className="text-xs text-gray-500">
                    Add-on: +30 min, +$25 flat + per dog (size-based).
                  </div>
                </div>

                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={addOns.bath.enabled}
                  onChange={() => toggleAddOn("bath")}
                />
              </div>

              {addOns.bath.enabled && (
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-xs font-medium mb-1">Applies</div>
                    <div className="join join-vertical sm:join-horizontal">
                      <button
                        type="button"
                        className={`btn btn-sm join-item ${
                          addOns.bath.appliesTo === "ONCE"
                            ? "btn-primary"
                            : "btn-ghost"
                        }`}
                        onClick={() =>
                          setAddOnField("bath", "appliesTo", "ONCE")
                        }
                      >
                        Once
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm join-item ${
                          addOns.bath.appliesTo === "EACH_VISIT"
                            ? "btn-primary"
                            : "btn-ghost"
                        }`}
                        onClick={() =>
                          setAddOnField("bath", "appliesTo", "EACH_VISIT")
                        }
                      >
                        Each visit
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium">
                        Small dogs
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={addOns.bath.smallDogs}
                        onChange={(e) =>
                          setAddOnField(
                            "bath",
                            "smallDogs",
                            Number(e.target.value)
                          )
                        }
                        className="mt-1 block w-full border rounded px-2 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Large dogs
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={addOns.bath.largeDogs}
                        onChange={(e) =>
                          setAddOnField(
                            "bath",
                            "largeDogs",
                            Number(e.target.value)
                          )
                        }
                        className="mt-1 block w-full border rounded px-2 py-2"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    Not sure? You can leave counts at 0 and clarify in Notes.
                  </p>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              Add-ons affect pricing and (soon) visit duration.
            </p>
          </div>
        )}

        {/* STEP 3 — Client info */}
        {step === 3 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium">Name</label>
              <input
                value={client.name}
                onChange={(e) =>
                  setClient((c) => ({ ...c, name: e.target.value }))
                }
                className="mt-1 block w-full border rounded px-2 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Email</label>
              <input
                type="email"
                value={client.email}
                onChange={(e) =>
                  setClient((c) => ({ ...c, email: e.target.value }))
                }
                className="mt-1 block w-full border rounded px-2 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Phone</label>
              <input
                value={client.phone}
                onChange={(e) =>
                  setClient((c) => ({ ...c, phone: e.target.value }))
                }
                className="mt-1 block w-full border rounded px-2 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-2"
              />
            </div>
          </div>
        )}

        {/* STEP 4 — Review + Submit */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-sm font-medium mb-2">Review</div>
              <div className="text-sm space-y-2">
                <div>
                  <span className="font-medium">Service:</span>{" "}
                  {payloadService?.label ?? payloadService?.name}
                </div>

                <div>
                  <span className="font-medium">Dates:</span> {reviewDates}
                </div>

                <div>
                  <span className="font-medium">Time:</span>{" "}
                  {times.startTime || "—"} → {times.endTime || "—"}
                </div>

                {hasAnyAddOns && (
                  <div>
                    <span className="font-medium">Add-ons:</span>
                    <ul className="list-disc ml-5 mt-1">
                      {addOns.nailTrim.enabled && (
                        <li>
                          Nail Trim (
                          {addOns.nailTrim.appliesTo === "EACH_VISIT"
                            ? "each visit"
                            : "once"}
                          )
                        </li>
                      )}
                      {addOns.bath.enabled && (
                        <li>
                          Bath (
                          {addOns.bath.appliesTo === "EACH_VISIT"
                            ? "each visit"
                            : "once"}
                          ) — Small: {addOns.bath.smallDogs}, Large:{" "}
                          {addOns.bath.largeDogs}
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                <div>
                  <span className="font-medium">Client:</span> {client.name} (
                  {client.email})
                </div>

                {notes ? (
                  <div>
                    <span className="font-medium">Notes:</span> {notes}
                  </div>
                ) : null}
              </div>
            </div>

            {booking && (
              <p className="text-sm text-green-700">
                Booking created! ID: {booking.id}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Nav buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={goBack}
            disabled={pending || step === 0}
            className="flex-1 py-2 rounded border disabled:opacity-50"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={pending}
              className="flex-1 py-2 rounded bg-black text-white disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={pending || !!booking}
              className="flex-1 py-2 rounded bg-black text-white disabled:opacity-50"
            >
              {booking
                ? "Submitted"
                : pending
                ? "Submitting..."
                : "Submit Booking"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PublicBookingForm;
