// src/app/book/[serviceCode]/PublicBookingWizard.jsx
"use client";

import { useState, useTransition } from "react";
import AdaptiveCalendar from "@/components/AdaptiveCalendar";
import { createPublicBooking } from "../actions";

export default function PublicBookingWizard({
  initialService,
  serviceOptions = [],
}) {
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  // Service selection
  const [serviceCode, setServiceCode] = useState(initialService.code);
  const [serviceType, setServiceType] = useState(initialService.serviceType);

  // Client + address
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

  // Add-ons
  const [addOns, setAddOns] = useState({
    nailTrim: { enabled: false, appliesTo: "ONCE" }, // ONCE | EACH_VISIT
    bath: {
      enabled: false,
      appliesTo: "ONCE",
      smallDogs: 0,
      largeDogs: 0,
    },
  });

  // helpers
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

  // Schedule
  const [scheduleKind, setScheduleKind] = useState("ONE_TIME"); // ONE_TIME | REPEAT_WEEKLY (for later)
  const [range, setRange] = useState(); // { from, to } for overnights
  const [dates, setDates] = useState([]); // array<Date> for walks/drop-ins
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Pet info (for now all shoved into notes)
  const [dogSize, setDogSize] = useState([]); // ["0-15", "16-40", ...]
  const [petNotes, setPetNotes] = useState("");

  const isRange = serviceType === "OVERNIGHT";

  function currentService() {
    return serviceOptions.find((s) => s.code === serviceCode) || initialService;
  }

  function toggleDogSize(size) {
    setDogSize((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, 5));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  // Basic per-step validation
  function validateStep(targetStep) {
    if (targetStep === 2) {
      if (!client.name || !client.email) {
        setError("Name and email are required.");
        return false;
      }
    }

    if (targetStep === 3) {
      if (isRange) {
        if (!range?.from || !range?.to) {
          setError("Please select a valid date range.");
          return false;
        }
      } else {
        if (!dates.length) {
          setError("Please select at least one date.");
          return false;
        }
      }
      if (!startTime || !endTime) {
        setError("Start and end time are required.");
        return false;
      }
    }

    return true;
  }

  function handleNext() {
    const target = step + 1;
    if (validateStep(target)) {
      goNext();
    }
  }

  function handleSubmit() {
    if (!validateStep(4)) return;

    const svc = currentService();

    // Dates to ISO strings
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

    const petMeta =
      dogSize.length || petNotes
        ? `\n\nPet details:\n- Dog size: ${
            dogSize.length ? dogSize.join(", ") : "not specified"
          }\n- Notes: ${petNotes || "none"}`
        : "";

    const payload = {
      // service info
      serviceType: svc.serviceType,
      serviceCode: svc.code,
      serviceSummary: svc.name,

      // client info
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

      // schedule
      mode,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      dates: datesArray || undefined,

      startTime,
      endTime,

      notes: petNotes || petMeta || undefined,
    };

    setError(null);
    setBooking(null);

    startTransition(async () => {
      try {
        console.log("📤 Submitting public booking payload:", payload);
        const res = await createPublicBooking(payload);

        if (!res.ok) {
          setError(res.error || "Could not create booking.");
          return;
        }

        setBooking(res.booking);
        setStep(4);
      } catch (err) {
        console.error(err);
        setError(err?.message || "Something went wrong.");
      }
    });
  }

  const svc = currentService();

  return (
    <div className="space-y-4">
      {/* DaisyUI steps */}
      <ul className="steps w-full mb-4 text-xs">
        <li className={`step ${step >= 1 ? "step-primary" : ""}`}>Service</li>
        <li className={`step ${step >= 2 ? "step-primary" : ""}`}>Schedule</li>
        <li className={`step ${step >= 3 ? "step-primary" : ""}`}>Add-ons</li>
        <li className={`step ${step >= 4 ? "step-primary" : ""}`}>Pets</li>
        <li className={`step ${step >= 5 ? "step-primary" : ""}`}>Confirm</li>
      </ul>

      {/* Card wrapper */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body space-y-4">
          {step === 1 && (
            <>
              <h1 className="card-title text-lg">Select a service</h1>

              <select
                className="select select-bordered w-full"
                value={serviceCode}
                onChange={(e) => {
                  const nextCode = e.target.value;
                  setServiceCode(nextCode);
                  const svc =
                    serviceOptions.find((s) => s.code === nextCode) ||
                    initialService;
                  setServiceType(svc.serviceType);
                }}
              >
                {serviceOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>

              <p className="text-sm text-base-content/70">
                {svc.category === "BOARDING" && "In the sitter’s home"}
                {svc.category === "HOUSE_SITTING" && "In your home"}
                {svc.category === "DROP_IN" && "Visits in your home"}
                {svc.category === "DAY_CARE" && "In the sitter’s home"}
                {svc.category === "WALK" && "In your neighborhood"}
                {svc.category === "TRAINING" && "With a private trainer"}
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="card-title text-lg">When do you need care?</h2>

              {/* basic client info */}
              <div className="space-y-2">
                <label className="form-control">
                  <span className="label-text text-sm">Name</span>
                  <input
                    className="input input-bordered input-sm"
                    value={client.name}
                    onChange={(e) =>
                      setClient((c) => ({ ...c, name: e.target.value }))
                    }
                    required
                  />
                </label>

                <label className="form-control">
                  <span className="label-text text-sm">Email</span>
                  <input
                    type="email"
                    className="input input-bordered input-sm"
                    value={client.email}
                    onChange={(e) =>
                      setClient((c) => ({ ...c, email: e.target.value }))
                    }
                    required
                  />
                </label>

                <label className="form-control">
                  <span className="label-text text-sm">Phone</span>
                  <input
                    className="input input-bordered input-sm"
                    value={client.phone}
                    onChange={(e) =>
                      setClient((c) => ({ ...c, phone: e.target.value }))
                    }
                  />
                </label>
              </div>

              {/* schedule kind – mostly future-proof */}
              <div className="mt-2">
                <span className="label-text text-sm mb-1 block">Schedule</span>
                <div className="join join-vertical sm:join-horizontal">
                  <button
                    type="button"
                    className={`btn btn-sm join-item ${
                      scheduleKind === "ONE_TIME" ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => setScheduleKind("ONE_TIME")}
                  >
                    One Time
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm join-item ${
                      scheduleKind === "REPEAT_WEEKLY"
                        ? "btn-primary"
                        : "btn-ghost"
                    }`}
                    onClick={() => setScheduleKind("REPEAT_WEEKLY")}
                  >
                    Repeat Weekly
                  </button>
                </div>
              </div>

              {/* calendar */}
              <div className="mt-2">
                <p className="label-text text-sm mb-1">Select dates</p>
                <AdaptiveCalendar
                  serviceType={serviceType}
                  range={range}
                  setRange={setRange}
                  dates={dates}
                  setDates={setDates}
                />
              </div>

              {/* time window */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="form-control">
                  <span className="label-text text-sm">Start time</span>
                  <input
                    type="time"
                    className="input input-bordered input-sm"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </label>

                <label className="form-control">
                  <span className="label-text text-sm">End time</span>
                  <input
                    type="time"
                    className="input input-bordered input-sm"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="card-title text-lg">Any add-ons?</h2>

              <div className="space-y-4">
                {/* Nail Trim */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Nail Trim</p>
                      <p className="text-xs text-base-content/60">
                        +20 min and +$15 when added to a visit (standalone is
                        different).
                      </p>
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
                      <p className="text-xs font-medium mb-1">Applies</p>
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

                {/* Bath */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Bath</p>
                      <p className="text-xs text-base-content/60">
                        +30 min and +$25 flat, plus +$5/+10 per dog depending on
                        size.
                      </p>
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
                        <p className="text-xs font-medium mb-1">Applies</p>
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
                        <label className="form-control">
                          <span className="label-text text-sm">Small dogs</span>
                          <input
                            type="number"
                            min={0}
                            className="input input-bordered input-sm"
                            value={addOns.bath.smallDogs}
                            onChange={(e) =>
                              setAddOnField(
                                "bath",
                                "smallDogs",
                                Number(e.target.value)
                              )
                            }
                          />
                        </label>

                        <label className="form-control">
                          <span className="label-text text-sm">Large dogs</span>
                          <input
                            type="number"
                            min={0}
                            className="input input-bordered input-sm"
                            value={addOns.bath.largeDogs}
                            onChange={(e) =>
                              setAddOnField(
                                "bath",
                                "largeDogs",
                                Number(e.target.value)
                              )
                            }
                          />
                        </label>
                      </div>

                      <p className="text-xs text-base-content/60">
                        If you’re not sure, leave counts at 0 and add details in
                        Notes.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <h2 className="card-title text-lg">Review your request</h2>

              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-semibold">Service</p>
                  <p>{svc.name}</p>
                </div>

                <div>
                  <p className="font-semibold">Client</p>
                  <p>{client.name}</p>
                  <p className="text-base-content/70">{client.email}</p>
                  {client.phone && (
                    <p className="text-base-content/70">{client.phone}</p>
                  )}
                </div>

                <div>
                  <p className="font-semibold">Timing</p>
                  <p>
                    {isRange
                      ? "Range booking"
                      : `${dates.length} visit${
                          dates.length === 1 ? "" : "s"
                        } selected`}
                  </p>
                  <p className="text-base-content/70">
                    Window: {startTime || "?"} – {endTime || "?"}
                  </p>
                </div>

                {dogSize.length > 0 && (
                  <div>
                    <p className="font-semibold">Dog size</p>
                    <p>{dogSize.join(", ")}</p>
                  </div>
                )}

                {petNotes && (
                  <div>
                    <p className="font-semibold">Notes</p>
                    <p className="whitespace-pre-wrap">{petNotes}</p>
                  </div>
                )}

                {booking && (
                  <div className="mt-2 alert alert-success text-xs">
                    <span>
                      Booking created! ID:{" "}
                      <code className="font-mono break-all">{booking.id}</code>
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-error mt-1 whitespace-pre-line">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="card-actions mt-4 flex justify-between">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={goBack}
              disabled={step === 1 || pending}
            >
              Back
            </button>

            {step < 4 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleNext}
                disabled={pending}
              >
                Next
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSubmit}
                disabled={pending}
              >
                {pending ? "Submitting..." : "Request Booking"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
