// src/app/book/[serviceCode]/PublicBookingWizard.jsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPublicBooking } from "../actions";

import BookingStepSchedule from "../ steps/BookingStepSchedule";
import BookingStepClientInfo from "../ steps/BookingStepClientInfo";
import BookingStepAddOns from "../ steps/BookingStepAddOns";
import BookingStepReview from "../ steps/BookingStepReview";

const BOOKING_START_MIN = 7 * 60; // 07:00
const BOOKING_END_MIN = 22 * 60; // 22:00


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
  extraOptions = [],
}) {
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  // Service is already chosen by the route: /book/[serviceCode]
  const serviceCode = initialService.code;
  const serviceType = initialService.serviceType;
  const svc =
    serviceOptions.find((s) => s.code === serviceCode) || initialService;

  const [client, setClient] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [serviceLocation, setServiceLocation] = useState({
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    accessInstructions: "",
    locationNotes: "",
  });

  const [addOns, setAddOns] = useState({
    nailTrim: { enabled: false, appliesTo: "ONCE" },
    bath: {
      enabled: false,
      appliesTo: "ONCE",
      smallDogs: 0,
      largeDogs: 0,
    },
  });

  const [weightClass, setWeightClass] = useState("");
  const [range, setRange] = useState();
  const [dates, setDates] = useState([]); // always ["YYYY-MM-DD"]
  const [scheduleMode, setScheduleMode] = useState("SAME");

  const [times, setTimes] = useState({
    startTime: "",
    endTime: "",
  });

  const [slotsByDate, setSlotsByDate] = useState({});
  const [dogSize, setDogSize] = useState([]);
  const [petNotes, setPetNotes] = useState("");

  const isRange = serviceType === "OVERNIGHT";

  const availableExtras = useMemo(() => {
    if (!svc) return [];
    return extraOptions.filter((extra) => extra.species === svc.species);
  }, [extraOptions, svc]);

  const nailTrimExtra = useMemo(() => {
    return (
      availableExtras.find(
        (extra) =>
          extra.code === "DOG_NAIL_GRIND" || extra.code === "CAT_NAIL_CUT"
      ) || null
    );
  }, [availableExtras]);

  const bathExtra = useMemo(() => {
    return availableExtras.find((extra) => extra.code === "DOG_BATH") || null;
  }, [availableExtras]);

  const hasAnyAddOns = addOns.nailTrim.enabled || addOns.bath.enabled;

  const selectedDateStrs = useMemo(() => {
    return [...dates].sort();
  }, [dates]);

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

  function toggleDogSize(size) {
    setDogSize((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  function syncSlotsForDates(dateStrs) {
    setSlotsByDate((prev) => {
      const next = {};

      for (const dateStr of dateStrs) {
        const existing = Array.isArray(prev[dateStr]) ? prev[dateStr] : null;

        next[dateStr] =
          existing && existing.length
            ? existing
            : [
                {
                  startTime: times.startTime || "",
                  endTime: times.endTime || "",
                },
              ];
      }

      return next;
    });
  }

  useEffect(() => {
    if (isRange) return;
    syncSlotsForDates(selectedDateStrs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateStrs, isRange]);

  function handleRangeChange(nextRange) {
    setRange(nextRange);
  }

  function handleDatesChange(nextDates) {
    setDates(nextDates || []);
  }

  function addSlot(dateStr) {
    setSlotsByDate((prev) => {
      const slots = Array.isArray(prev[dateStr]) ? prev[dateStr] : [];
      return {
        ...prev,
        [dateStr]: [...slots, { startTime: "", endTime: "" }],
      };
    });
  }

  function updateSlot(dateStr, idx, patch) {
    setSlotsByDate((prev) => {
      const slots = Array.isArray(prev[dateStr]) ? [...prev[dateStr]] : [];
      if (!slots[idx]) return prev;

      slots[idx] = {
        ...slots[idx],
        ...patch,
      };

      return {
        ...prev,
        [dateStr]: slots,
      };
    });
  }

  function removeSlot(dateStr, idx) {
    setSlotsByDate((prev) => {
      const slots = Array.isArray(prev[dateStr]) ? [...prev[dateStr]] : [];
      slots.splice(idx, 1);

      return {
        ...prev,
        [dateStr]: slots.length ? slots : [{ startTime: "", endTime: "" }],
      };
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
    // Going to Your Info -> validate Schedule first
    if (targetStep === 2) {
      if (isRange) {
        if (!range?.from || !range?.to) {
          setError("Please select a valid date range.");
          return false;
        }

        const msg = validateWindow(times.startTime, times.endTime);
        if (msg) {
          setError(msg);
          return false;
        }

        return true;
      }

      if (!selectedDateStrs.length) {
        setError("Please select at least one visit date.");
        return false;
      }

      if (scheduleMode === "SAME") {
        const msg = validateWindow(times.startTime, times.endTime);
        if (msg) {
          setError(msg);
          return false;
        }
        return true;
      }

      for (const dateStr of selectedDateStrs) {
        const slots = slotsByDate[dateStr] || [];
        if (!slots.length) {
          setError(`Please add at least one visit time for ${dateStr}.`);
          return false;
        }

        for (let i = 0; i < slots.length; i++) {
          const msg = validateWindow(slots[i]?.startTime, slots[i]?.endTime);
          if (msg) {
            setError(
              `${prettyDate(new Date(`${dateStr}T00:00:00`))}: slot ${
                i + 1
              } — ${msg}`
            );
            return false;
          }
        }
      }

      return true;
    }

    // Going to Add-ons -> validate Client Info
    if (targetStep === 3) {
      if (!client.name?.trim() || !client.email?.trim()) {
        setError("Name and email are required.");
        return false;
      }

      if (!serviceLocation.addressLine1?.trim()) {
        setError("Service address is required.");
        return false;
      }

      if (!serviceLocation.city?.trim()) {
        setError("Service city is required.");
        return false;
      }

      if (!serviceLocation.state?.trim()) {
        setError("Service state is required.");
        return false;
      }

      if (!serviceLocation.postalCode?.trim()) {
        setError("Service postal code is required.");
        return false;
      }

      return true;
    }

    // Going to Review -> validate Add-ons
    if (targetStep === 4) {
      if (addOns.bath.enabled) {
        const totalDogs =
          (addOns.bath.smallDogs || 0) + (addOns.bath.largeDogs || 0);

        if (totalDogs === 0) {
          setError("For Bath, please enter at least 1 dog (small or large).");
          return false;
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

    if (addOns.nailTrim.enabled && nailTrimExtra) {
      addOnsPayload.push({
        code: nailTrimExtra.code,
        appliesTo: addOns.nailTrim.appliesTo,
      });
    }

    if (addOns.bath.enabled && bathExtra) {
      addOnsPayload.push({
        code: bathExtra.code,
        appliesTo: addOns.bath.appliesTo,
        smallDogs: addOns.bath.smallDogs,
        largeDogs: addOns.bath.largeDogs,
      });
    }

    return addOnsPayload.length ? addOnsPayload : undefined;
  }

  function handleSubmit() {
    if (booking) return;
    if (step !== 4) return;

    const petMeta =
      dogSize.length || weightClass || petNotes
        ? `\n\nPet details:\n- Dog size: ${
            dogSize.length ? dogSize.join(", ") : "not specified"
          }\n- Weight class: ${weightClass || "not specified"}\n- Notes: ${
            petNotes || "none"
          }`
        : "";

    let payload = {
      serviceType: svc.serviceType,
      serviceCode: svc.code,
      serviceSummary: svc.name ?? svc.label,

      client: {
        name: client.name,
        email: client.email,
        phone: client.phone || undefined,
      },

      serviceAddressLine1: serviceLocation.addressLine1 || undefined,
      serviceAddressLine2: serviceLocation.addressLine2 || undefined,
      serviceCity: serviceLocation.city || undefined,
      serviceState: serviceLocation.state || undefined,
      servicePostalCode: serviceLocation.postalCode || undefined,
      serviceCountry: serviceLocation.country || "US",
      accessInstructions: serviceLocation.accessInstructions || undefined,
      locationNotes: serviceLocation.locationNotes || undefined,

      petDetails:
        dogSize.length || weightClass
          ? {
              dogSize,
              weightClass: weightClass || undefined,
            }
          : undefined,

      addOns: buildAddOnsPayload(),
      notes: (petNotes || petMeta || "").trim() || undefined,
    };

    if (isRange) {
      payload = {
        ...payload,
        mode: "RANGE",
        startDate: range.from.toISOString().slice(0, 10),
        endDate: range.to.toISOString().slice(0, 10),
        scheduleMode: "SAME",
        startTime: times.startTime,
        endTime: times.endTime,
      };
    } else if (scheduleMode === "CUSTOM") {
      payload = {
        ...payload,
        mode: "MULTIPLE",
        dates: selectedDateStrs,
        scheduleMode: "CUSTOM",
        slotsByDate,
      };
    } else {
      payload = {
        ...payload,
        mode: "MULTIPLE",
        dates: selectedDateStrs,
        scheduleMode: "SAME",
        startTime: times.startTime,
        endTime: times.endTime,
      };
    }

    setError(null);
    setBooking(null);

    startTransition(async () => {
      try {
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Selected service
          </div>
          <div className="text-base font-semibold text-zinc-900">
            {svc.name ?? svc.label}
          </div>
          {svc.description ? (
            <p className="mt-1 text-sm text-zinc-600">{svc.description}</p>
          ) : null}
        </div>
      </div>

      <ul className="steps mb-4 w-full text-xs">
        <li className={`step ${step >= 1 ? "step-primary" : ""}`}>Schedule</li>
        <li className={`step ${step >= 2 ? "step-primary" : ""}`}>Your Info</li>
        <li className={`step ${step >= 3 ? "step-primary" : ""}`}>Add-ons</li>
        <li className={`step ${step >= 4 ? "step-primary" : ""}`}>Review</li>
      </ul>

      <div className="card bg-base-100 shadow-md">
        <div className="card-body space-y-4">
          {step === 1 && (
            <BookingStepSchedule
              isRange={isRange}
              scheduleMode={scheduleMode}
              setScheduleMode={setScheduleMode}
              selectedDateStrs={selectedDateStrs}
              syncSlotsForDates={syncSlotsForDates}
              serviceType={serviceType}
              range={range}
              handleRangeChange={handleRangeChange}
              dates={dates}
              handleDatesChange={handleDatesChange}
              times={times}
              setTimes={setTimes}
              slotsByDate={slotsByDate}
              addSlot={addSlot}
              updateSlot={updateSlot}
              removeSlot={removeSlot}
            />
          )}

          {step === 2 && (
            <BookingStepClientInfo
              client={client}
              setClient={setClient}
              serviceLocation={serviceLocation}
              setServiceLocation={setServiceLocation}
              notes={petNotes}
              setNotes={setPetNotes}
              dogSize={dogSize}
              toggleDogSize={toggleDogSize}
              weightClass={weightClass}
              setWeightClass={setWeightClass}
            />
          )}

          {step === 3 && (
            <BookingStepAddOns
              nailTrimExtra={nailTrimExtra}
              bathExtra={bathExtra}
              addOns={addOns}
              toggleAddOn={toggleAddOn}
              setAddOnField={setAddOnField}
            />
          )}

          {step === 4 && (
            <BookingStepReview
              booking={booking}
              payloadService={svc}
              isRange={isRange}
              range={range}
              selectedDateStrs={selectedDateStrs}
              scheduleMode={scheduleMode}
              times={times}
              slotsByDate={slotsByDate}
              addOns={addOns}
              nailTrimExtra={nailTrimExtra}
              bathExtra={bathExtra}
              hasAnyAddOns={hasAnyAddOns}
              client={client}
              serviceLocation={serviceLocation}
              notes={petNotes}
              dogSize={dogSize}
              weightClass={weightClass}
            />
          )}

          {error && (
            <p className="text-error mt-1 whitespace-pre-line text-sm">
              {error}
            </p>
          )}

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
