// src/app/book/[serviceCode]/PublicBookingWizard.jsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import AdaptiveCalendar from "@/components/AdaptiveCalendar";
import { createPublicBooking } from "../actions";

const BOOKING_START_MIN = 7 * 60; // 07:00
const BOOKING_END_MIN = 22 * 60; // 22:00

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function prettyDate(d) {
  try {
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d.toDateString();
  }
}

function timeToMinutes(t) {
  // "HH:MM"
  if (!t || typeof t !== "string") return NaN;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

function validateWindow(startTime, endTime) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);

  if (!Number.isFinite(s) || !Number.isFinite(e)) {
    return "Start and end time are required.";
  }
  if (s < BOOKING_START_MIN || s > BOOKING_END_MIN) {
    return "Start time must be between 7:00 AM and 10:00 PM.";
  }
  if (e < BOOKING_START_MIN || e > BOOKING_END_MIN) {
    return "End time must be between 7:00 AM and 10:00 PM.";
  }
  if (e <= s) {
    return "End time must be after start time.";
  }
  return null;
}

export default function PublicBookingWizard({
  initialService,
  serviceOptions = [],
}) {
  // Steps:
  // 1 Service
  // 2 Schedule
  // 3 Add-ons
  // 4 Review + Submit
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
  const [scheduleKind, setScheduleKind] = useState("ONE_TIME"); // ONE_TIME | REPEAT_WEEKLY (later)

  // For overnight
  const [range, setRange] = useState(); // { from, to }

  // For walks/drop-ins (date selection)
  const [dates, setDates] = useState([]); // array<Date>

  // Same-time-for-all mode
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Custom time windows mode (supports multiple visits per date)
  // scheduleMode only applies to non-range services
  const [scheduleMode, setScheduleMode] = useState("SAME_TIME"); // SAME_TIME | CUSTOM
  // Map: "YYYY-MM-DD" -> [{ startTime, endTime }]
  const [customWindowsByDate, setCustomWindowsByDate] = useState({});

  // Pet notes (for now)
  const [dogSize, setDogSize] = useState([]); // ["0-15", "16-40", ...]
  const [petNotes, setPetNotes] = useState("");

  const isRange = serviceType === "OVERNIGHT";

  const svc = useMemo(() => {
    return serviceOptions.find((s) => s.code === serviceCode) || initialService;
  }, [serviceOptions, serviceCode, initialService]);

  function toggleDogSize(size) {
    setDogSize((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  // Keep customWindowsByDate in sync with selected dates
  useEffect(() => {
    if (isRange) return;

    const keys = dates.map(toISODate);
    setCustomWindowsByDate((prev) => {
      const next = { ...prev };

      // add missing keys
      for (const k of keys) {
        if (!next[k] || !Array.isArray(next[k]) || next[k].length === 0) {
          // seed one slot if SAME_TIME has values, else blank
          next[k] = [
            {
              startTime: startTime || "",
              endTime: endTime || "",
            },
          ];
        }
      }

      // remove keys no longer selected
      for (const existingKey of Object.keys(next)) {
        if (!keys.includes(existingKey)) {
          delete next[existingKey];
        }
      }

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, isRange]);

  function addVisitSlot(dateKey) {
    setCustomWindowsByDate((prev) => {
      const slots = Array.isArray(prev[dateKey]) ? prev[dateKey] : [];
      return {
        ...prev,
        [dateKey]: [...slots, { startTime: "", endTime: "" }],
      };
    });
  }

  function removeVisitSlot(dateKey, idx) {
    setCustomWindowsByDate((prev) => {
      const slots = Array.isArray(prev[dateKey]) ? [...prev[dateKey]] : [];
      slots.splice(idx, 1);
      return { ...prev, [dateKey]: slots.length ? slots : [] };
    });
  }

  function updateVisitSlot(dateKey, idx, field, value) {
    setCustomWindowsByDate((prev) => {
      const slots = Array.isArray(prev[dateKey]) ? [...prev[dateKey]] : [];
      if (!slots[idx]) return prev;
      slots[idx] = { ...slots[idx], [field]: value };
      return { ...prev, [dateKey]: slots };
    });
  }

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, 4));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  function validateStep(targetStep) {
    // 2 = schedule step (also includes client basics in this wizard)
    if (targetStep === 2) {
      if (!client.name?.trim() || !client.email?.trim()) {
        setError("Name and email are required.");
        return false;
      }
    }

    // 3 = add-ons
    if (targetStep === 3) {
      if (addOns.bath.enabled) {
        const totalDogs =
          (addOns.bath.smallDogs || 0) + (addOns.bath.largeDogs || 0);
        if (totalDogs === 0) {
          setError("For Bath, please enter at least 1 dog (small or large).");
          return false;
        }
      }
    }

    // 4 = review/submit (schedule must be valid)
    if (targetStep === 4) {
      if (isRange) {
        if (!range?.from || !range?.to) {
          setError("Please select a valid date range.");
          return false;
        }

        const msg = validateWindow(startTime, endTime);
        if (msg) {
          setError(msg);
          return false;
        }

        return true;
      }

      // multiple dates required
      if (!dates.length) {
        setError("Please select at least one visit date.");
        return false;
      }

      // SAME_TIME: validate single window
      if (scheduleMode === "SAME_TIME") {
        const msg = validateWindow(startTime, endTime);
        if (msg) {
          setError(msg);
          return false;
        }
        return true;
      }

      // CUSTOM: validate each slot
      const keys = dates.map(toISODate);
      for (const k of keys) {
        const slots = customWindowsByDate[k] || [];
        if (!slots.length) {
          setError(`Please add at least one visit time for ${k}.`);
          return false;
        }
        for (let i = 0; i < slots.length; i++) {
          const msg = validateWindow(slots[i]?.startTime, slots[i]?.endTime);
          if (msg) {
            setError(`${prettyDate(new Date(k))}: slot ${i + 1} — ${msg}`);
            return false;
          }
        }
      }

      return true;
    }

    return true;
  }

  function handleNext() {
    const target = step + 1;
    if (validateStep(target)) {
      goNext();
    }
  }

  function buildAddOnsPayload() {
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

    return addOnsPayload.length ? addOnsPayload : undefined;
  }

  function handleSubmit() {
    if (booking) return; // prevent duplicate submits
    if (!validateStep(4)) return;

    // Notes: keep pet meta as simple text for now
    const petMeta =
      dogSize.length || petNotes
        ? `\n\nPet details:\n- Dog size: ${
            dogSize.length ? dogSize.join(", ") : "not specified"
          }\n- Notes: ${petNotes || "none"}`
        : "";

    // Build schedule
    let payload = {
      serviceType: svc.serviceType,
      serviceCode: svc.code,
      serviceSummary: svc.name ?? svc.label,

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

      addOns: buildAddOnsPayload(),

      notes: (petNotes || petMeta || "").trim() || undefined,
    };

    if (isRange) {
      payload = {
        ...payload,
        mode: "RANGE",
        startDate: range.from.toISOString().slice(0, 10),
        endDate: range.to.toISOString().slice(0, 10),
        startTime,
        endTime,
      };
    } else if (scheduleMode === "CUSTOM") {
      const visitWindows = [];

      // flatten
      for (const d of dates) {
        const k = toISODate(d);
        const slots = customWindowsByDate[k] || [];
        for (const slot of slots) {
          visitWindows.push({
            date: k,
            startTime: slot.startTime,
            endTime: slot.endTime,
          });
        }
      }

      payload = {
        ...payload,
        mode: "MULTIPLE", // still a multi-date booking
        dates: dates.map(toISODate),
        scheduleMode: "CUSTOM",
        visitWindows,
      };
    } else {
      payload = {
        ...payload,
        mode: "MULTIPLE",
        dates: dates.map(toISODate),
        scheduleMode: "SAME_TIME",
        startTime,
        endTime,
      };
    }

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

  const reviewDates = isRange
    ? range?.from && range?.to
      ? `${prettyDate(range.from)} → ${prettyDate(range.to)}`
      : "—"
    : dates.length
    ? dates.map(prettyDate).join(", ")
    : "—";

  const visitWindowsPreview =
    !isRange && scheduleMode === "CUSTOM"
      ? dates
          .map((d) => {
            const k = toISODate(d);
            const slots = customWindowsByDate[k] || [];
            const summary = slots.length
              ? slots
                  .map((s, idx) => `${idx + 1}) ${s.startTime}–${s.endTime}`)
                  .join(", ")
              : "—";
            return `${prettyDate(d)}: ${summary}`;
          })
          .join("\n")
      : null;

  const hasAnyAddOns = addOns.nailTrim.enabled || addOns.bath.enabled;

  return (
    <div className="space-y-4">
      {/* DaisyUI steps */}
      <ul className="steps w-full mb-4 text-xs">
        <li className={`step ${step >= 1 ? "step-primary" : ""}`}>Service</li>
        <li className={`step ${step >= 2 ? "step-primary" : ""}`}>Schedule</li>
        <li className={`step ${step >= 3 ? "step-primary" : ""}`}>Add-ons</li>
        <li className={`step ${step >= 4 ? "step-primary" : ""}`}>Review</li>
      </ul>

      {/* Card wrapper */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body space-y-4">
          {/* STEP 1 — Service */}
          {step === 1 && (
            <>
              <h1 className="card-title text-lg">Select a service</h1>

              <select
                className="select select-bordered w-full"
                value={serviceCode}
                onChange={(e) => {
                  const nextCode = e.target.value;
                  setServiceCode(nextCode);
                  const next =
                    serviceOptions.find((s) => s.code === nextCode) ||
                    initialService;
                  setServiceType(next.serviceType);

                  // reset schedule on service change (prevents mixing modes)
                  setRange(undefined);
                  setDates([]);
                  setStartTime("");
                  setEndTime("");
                  setScheduleMode("SAME_TIME");
                  setCustomWindowsByDate({});
                }}
              >
                {serviceOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name ?? s.label}
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

          {/* STEP 2 — Schedule (includes basic client info here) */}
          {step === 2 && (
            <>
              <h2 className="card-title text-lg">When do you need care?</h2>

              {/* client info */}
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

              {/* schedule kind */}
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
                <p className="label-text text-sm mb-1">
                  {isRange
                    ? "Select check-in and check-out"
                    : "Select visit dates"}
                </p>
                <AdaptiveCalendar
                  serviceType={serviceType}
                  range={range}
                  setRange={setRange}
                  dates={dates}
                  setDates={setDates}
                />
              </div>

              {/* For non-overnight: choose schedule mode */}
              {!isRange && (
                <div className="mt-2">
                  <p className="label-text text-sm mb-1">Time setup</p>
                  <div className="join join-vertical sm:join-horizontal w-full">
                    <button
                      type="button"
                      className={`btn btn-sm join-item ${
                        scheduleMode === "SAME_TIME"
                          ? "btn-primary"
                          : "btn-ghost"
                      }`}
                      onClick={() => setScheduleMode("SAME_TIME")}
                    >
                      Same time for all dates
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm join-item ${
                        scheduleMode === "CUSTOM" ? "btn-primary" : "btn-ghost"
                      }`}
                      onClick={() => setScheduleMode("CUSTOM")}
                    >
                      Different times / multiple visits
                    </button>
                  </div>
                </div>
              )}

              {/* time window(s) */}
              {(isRange || scheduleMode === "SAME_TIME") && (
                <>
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

                  <p className="text-xs text-base-content/60">
                    Booking window: 7:00 AM to 10:00 PM.
                  </p>
                </>
              )}

              {!isRange && scheduleMode === "CUSTOM" && (
                <>
                  <p className="text-xs text-base-content/60">
                    Add one or more visits per day (example: 11:30 AM and 2:30
                    PM). Booking window: 7:00 AM to 10:00 PM.
                  </p>

                  <div className="space-y-3 mt-2">
                    {dates
                      .slice()
                      .sort((a, b) => a.getTime() - b.getTime())
                      .map((d) => {
                        const key = toISODate(d);
                        const slots = customWindowsByDate[key] || [];
                        return (
                          <div
                            key={key}
                            className="border rounded-xl p-3 bg-base-100"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm">
                                {prettyDate(d)}
                              </div>
                              <button
                                type="button"
                                className="btn btn-xs btn-outline"
                                onClick={() => addVisitSlot(key)}
                              >
                                + Add visit
                              </button>
                            </div>

                            <div className="mt-2 space-y-2">
                              {slots.map((slot, idx) => (
                                <div
                                  key={`${key}-${idx}`}
                                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end"
                                >
                                  <label className="form-control">
                                    <span className="label-text text-xs">
                                      Start
                                    </span>
                                    <input
                                      type="time"
                                      className="input input-bordered input-sm"
                                      value={slot.startTime}
                                      onChange={(e) =>
                                        updateVisitSlot(
                                          key,
                                          idx,
                                          "startTime",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </label>

                                  <label className="form-control">
                                    <span className="label-text text-xs">
                                      End
                                    </span>
                                    <input
                                      type="time"
                                      className="input input-bordered input-sm"
                                      value={slot.endTime}
                                      onChange={(e) =>
                                        updateVisitSlot(
                                          key,
                                          idx,
                                          "endTime",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    onClick={() => removeVisitSlot(key, idx)}
                                    disabled={slots.length === 1}
                                    title={
                                      slots.length === 1
                                        ? "Keep at least one slot"
                                        : "Remove"
                                    }
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </>
          )}

          {/* STEP 3 — Add-ons */}
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
                        +30 min and +$25 flat, plus per-dog depending on size.
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

          {/* STEP 4 — Review + Submit */}
          {step === 4 && (
            <>
              <h2 className="card-title text-lg">Review your request</h2>

              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-semibold">Service</p>
                  <p>{svc.name ?? svc.label}</p>
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
                  <p className="font-semibold">Dates</p>
                  <p className="text-base-content/70">{reviewDates}</p>
                </div>

                <div>
                  <p className="font-semibold">Time</p>
                  {isRange ? (
                    <p className="text-base-content/70">
                      Check-in/out window: {startTime || "?"} – {endTime || "?"}
                    </p>
                  ) : scheduleMode === "CUSTOM" ? (
                    <pre className="text-xs whitespace-pre-wrap bg-base-200 rounded-lg p-2">
                      {visitWindowsPreview || "—"}
                    </pre>
                  ) : (
                    <p className="text-base-content/70">
                      Visit window: {startTime || "?"} – {endTime || "?"}
                    </p>
                  )}
                </div>

                {hasAnyAddOns && (
                  <div>
                    <p className="font-semibold">Add-ons</p>
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
                disabled={pending || !!booking}
              >
                {booking
                  ? "Submitted"
                  : pending
                  ? "Submitting..."
                  : "Request Booking"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
