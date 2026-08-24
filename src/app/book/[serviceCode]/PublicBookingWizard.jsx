// src/app/book/[serviceCode]/PublicBookingWizard.jsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPublicBooking } from "../actions";
import {
  Button,
  Card,
  Eyebrow,
  FormFeedback,
  Notice,
  PageHeader,
} from "@/components/ui/Foundation";

import BookingStepSchedule from "../ steps/BookingStepSchedule";
import BookingStepClientInfo from "../ steps/BookingStepClientInfo";
import BookingStepAddOns from "../ steps/BookingStepAddOns";
import BookingStepReview from "../ steps/BookingStepReview";
import { validateScheduleAvailabilityStep } from "../validatePublicBookingStep";
import {
  buildCanonicalPets,
  getPetRowErrors,
  MAX_PUBLIC_BOOKING_PETS,
} from "../structuredPets";
const BOOKING_START_MIN = 7 * 60; // 07:00
const BOOKING_END_MIN = 22 * 60; // 22:00
const BOOKING_STEPS = ["Schedule", "Your info", "Add-ons", "Review"];

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
  const errorRef = useRef(null);

  const serviceCode = initialService.code;
  const svc =
    serviceOptions.find((s) => s.code === serviceCode) || initialService;

  const serviceType = svc.serviceType || svc.category;
  const sitterId = svc?.sitterId || svc?.providerUserId || null;
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

  const [range, setRange] = useState();
  const [dates, setDates] = useState([]);
  const [scheduleMode, setScheduleMode] = useState("SAME");

  const [times, setTimes] = useState({
    startTime: "",
    endTime: "",
  });

  const [slotsByDate, setSlotsByDate] = useState({});
  const [dogSize, setDogSize] = useState([]);
  const [pets, setPets] = useState([
    { id: "pet-1", name: "", species: "", customSpecies: "" },
  ]);
  const [petErrors, setPetErrors] = useState([]);
  const [petNotes, setPetNotes] = useState("");
  const canonicalPets = useMemo(() => buildCanonicalPets(pets), [pets]);
  const hasDog = canonicalPets.some((pet) => pet.species === "Dog");
  const applicableDogSizes = hasDog ? dogSize : [];

  const isRange = serviceType === "OVERNIGHT";

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

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
        if (selectedDateStrs.length !== 1) {
          setError("Please select exactly one date for this booking.");
          return false;
        }

        if (!times.startTime || !times.endTime) {
          setError("Please select an available time slot.");
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

      const nextPetErrors = getPetRowErrors(pets);

      if (
        pets.length < 1 ||
        pets.length > MAX_PUBLIC_BOOKING_PETS ||
        nextPetErrors.some((petError) => petError.name || petError.species)
      ) {
        setPetErrors(nextPetErrors);
        setError("Please review the highlighted pet details.");
        return false;
      }

      setPetErrors([]);

      return true;
    }

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

  async function handleNext() {
    

    const target = step + 1;
    setError(null);

    

    // 1. Run existing sync validation first
    if (!validateStep(target)) return;

    // 2. Availability re-check BEFORE leaving Schedule step
    if (step === 1) {
      try {
        const availabilityError = await validateScheduleAvailabilityStep({
          sitterId,
          isRange,
          scheduleMode,
          selectedDateStrs,
          times,
          slotsByDate,
          durationMinutes: svc.durationMinutes || 30,
          bufferMinutes: 15,
        });

        if (availabilityError) {
          setError(availabilityError);
          return;
        }
      } catch (err) {
        console.error(err);
        setError("Could not verify availability. Please try again.");
        return;
      }
    }

    goNext();
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
      applicableDogSizes.length || petNotes
        ? `\n\nPet details:\n- Dog size: ${
            applicableDogSizes.length
              ? applicableDogSizes.join(", ")
              : "not specified"
          }\n- Notes: ${
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

      pets: canonicalPets,

      serviceAddressLine1: serviceLocation.addressLine1 || undefined,
      serviceAddressLine2: serviceLocation.addressLine2 || undefined,
      serviceCity: serviceLocation.city || undefined,
      serviceState: serviceLocation.state || undefined,
      servicePostalCode: serviceLocation.postalCode || undefined,
      serviceCountry: serviceLocation.country || "US",
      accessInstructions: serviceLocation.accessInstructions || undefined,
      locationNotes: serviceLocation.locationNotes || undefined,

      petDetails:
        applicableDogSizes.length
          ? {
              dogSize: applicableDogSizes,
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Request pet care"
        title="Tell us what your pet needs"
        description="Complete the four steps below. You can review everything before sending your request."
      />

      <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4 sm:flex sm:items-start sm:justify-between sm:gap-6">
        <div>
          <Eyebrow className="text-[var(--task-accent)]">Selected service</Eyebrow>
          <div className="mt-1 text-lg font-semibold text-[var(--task-text)]">
            {svc.name ?? svc.label}
          </div>
          {svc.description ? (
            <p className="mt-1 text-sm leading-6 text-[var(--task-text-muted)]">{svc.description}</p>
          ) : null}
        </div>
        <Button href="/book" variant="quiet" className="mt-3 min-h-10 px-3 py-2 sm:mt-0">
          Change service
        </Button>
      </section>

      <nav aria-label="Booking progress">
        <div className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:hidden">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-[var(--task-primary)]">Step {step} of {BOOKING_STEPS.length}</span>
            <span className="text-[var(--task-text-muted)]">{BOOKING_STEPS[step - 1]}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--task-surface-soft)]">
            <div
              className="h-full rounded-full bg-[var(--task-primary)] transition-[width]"
              style={{ width: `${(step / BOOKING_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <ol className="hidden grid-cols-4 gap-2 sm:grid" aria-label={`Step ${step} of ${BOOKING_STEPS.length}`}>
          {BOOKING_STEPS.map((label, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === step;
            const isComplete = stepNumber < step;

            return (
              <li
                key={label}
                aria-current={isCurrent ? "step" : undefined}
                className="relative flex flex-col items-center text-center"
              >
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute right-1/2 top-4 h-px w-full ${stepNumber <= step ? "bg-[var(--task-primary)]" : "bg-[var(--task-border)]"}`}
                  />
                ) : null}
                <span
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${isCurrent || isComplete ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white" : "border-[var(--task-border-strong)] bg-white text-[var(--task-text-muted)]"}`}
                >
                  {stepNumber}
                </span>
                <span className={`mt-2 text-xs font-medium ${isCurrent ? "text-[var(--task-primary)]" : "text-[var(--task-text-muted)]"}`}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 1 && !sitterId && (
        <Notice tone="danger" role="alert">
          Booking is not configured correctly. This service is missing a
          sitter/provider.
        </Notice>
      )}

      <Card className="p-4 sm:p-6 lg:p-8">
        <div className="space-y-5">
          {step === 1 && sitterId && (
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
              sitterId={sitterId}
              durationMinutes={svc.durationMinutes || 30}
              bufferMinutes={15}
              clearError={() => setError("")}
            />
          )}

          {step === 2 && (
            <BookingStepClientInfo
              client={client}
              setClient={setClient}
              pets={pets}
              setPets={setPets}
              petErrors={petErrors}
              setPetErrors={setPetErrors}
              serviceLocation={serviceLocation}
              setServiceLocation={setServiceLocation}
              notes={petNotes}
              setNotes={setPetNotes}
              dogSize={dogSize}
              toggleDogSize={toggleDogSize}
              hasDog={hasDog}
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
              pets={canonicalPets}
              serviceLocation={serviceLocation}
              notes={petNotes}
              dogSize={applicableDogSizes}
            />
          )}

          {error && (
            <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
              <FormFeedback className="whitespace-pre-line">{error}</FormFeedback>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--task-border)] pt-5 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={goBack}
              disabled={step === 1 || pending}
            >
              Back
            </Button>

            {step < 4 && (
              <Button
                type="button"
                className="w-full sm:min-w-32 sm:w-auto"
                onClick={handleNext}
              >
                Next
              </Button>
            )}

            {step === 4 && (
              <Button
                type="button"
                className="w-full sm:min-w-44 sm:w-auto"
                onClick={handleSubmit}
                disabled={pending || !!booking}
                aria-busy={pending}
              >
                {booking
                  ? "Submitted"
                  : pending
                  ? "Submitting..."
                  : "Request Booking"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
