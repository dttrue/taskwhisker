"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Button,
  Card,
  Eyebrow,
  FormFeedback,
  Notice,
  PageHeader,
} from "@/components/ui/Foundation";
import BookingStepClientInfo from "../ steps/BookingStepClientInfo";
import BookingStepSchedule from "../ steps/BookingStepSchedule";
import BookingStepAddOns from "../ steps/BookingStepAddOns";
import { formatTime12h } from "../bookingFormUtils";
import {
  buildCanonicalPets,
  getPetRowErrors,
  MAX_PUBLIC_BOOKING_PETS,
} from "../structuredPets";
import { loadCanonicalPreviewCatalog } from "./actions";

const STEPS = ["Pets", "Care type", "Care options", "Schedule", "Details", "Review"];
const EMPTY_CLIENT = { name: "", email: "", phone: "" };
const EMPTY_LOCATION = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  accessInstructions: "",
  locationNotes: "",
};

function money(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((Number(cents) || 0) / 100);
}

function scheduleType(offering) {
  if (offering?.scheduleKind === "OVERNIGHT_STAY") return "OVERNIGHT";
  return offering?.code === "DOG_WALK" ? "WALK" : "DROP_IN";
}

function dateLabel(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function publicOptionLabel(offering, option) {
  if (
    offering?.options?.length === 1 &&
    option?.durationMinutes == null &&
    offering.scheduleKind === "OVERNIGHT_STAY"
  ) {
    return "Overnight stay";
  }

  return option?.displayLabel;
}

export default function CanonicalBookingPreviewWizard({ sitterId, extraOptions = [] }) {
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const errorRef = useRef(null);
  const [pets, setPets] = useState([
    { id: "pet-1", name: "", species: "", customSpecies: "" },
  ]);
  const [petErrors, setPetErrors] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [offeringCode, setOfferingCode] = useState("");
  const [optionCode, setOptionCode] = useState("");
  const [client, setClient] = useState(EMPTY_CLIENT);
  const [serviceLocation, setServiceLocation] = useState(EMPTY_LOCATION);
  const [notes, setNotes] = useState("");
  const [dogSize, setDogSize] = useState([]);
  const [range, setRange] = useState();
  const [dates, setDates] = useState([]);
  const [scheduleMode, setScheduleMode] = useState("SAME");
  const [times, setTimes] = useState({ startTime: "", endTime: "" });
  const [slotsByDate, setSlotsByDate] = useState({});
  const [addOns, setAddOns] = useState({
    nailTrim: { enabled: false, appliesTo: "ONCE" },
    bath: { enabled: false, appliesTo: "ONCE", smallDogs: 0, largeDogs: 0 },
  });

  const canonicalPets = useMemo(() => buildCanonicalPets(pets), [pets]);
  const hasDog = canonicalPets.some((pet) => pet.species === "Dog");
  const selectedOffering = catalog?.offerings?.find((item) => item.code === offeringCode);
  const selectedOption = selectedOffering?.options?.find((item) => item.code === optionCode);
  const isRange = selectedOffering?.scheduleKind === "OVERNIGHT_STAY";
  const selectedDateStrs = useMemo(() => [...dates].sort(), [dates]);

  const extrasSpecies = selectedOption?.primarySpecies;
  const nailTrimExtra = extraOptions.find((extra) =>
    extrasSpecies === "Dog"
      ? extra.code === "DOG_NAIL_GRIND"
      : extrasSpecies === "Cat" && extra.code === "CAT_NAIL_CUT",
  );
  const bathExtra = extrasSpecies === "Dog"
    ? extraOptions.find((extra) => extra.code === "DOG_BATH")
    : null;

  useEffect(() => {
    if (!isRange) syncSlotsForDates(selectedDateStrs);
    // The synchronization function intentionally tracks the current time state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateStrs, isRange]);

  function setFailure(message) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function toggleDogSize(value) {
    setDogSize((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function toggleAddOn(key) {
    setAddOns((current) => ({
      ...current,
      [key]: { ...current[key], enabled: !current[key].enabled },
    }));
  }

  function setAddOnField(key, field, value) {
    setAddOns((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }

  function syncSlotsForDates(dateValues) {
    setSlotsByDate((current) =>
      Object.fromEntries(
        dateValues.map((date) => [
          date,
          current[date]?.length
            ? current[date]
            : [{ startTime: times.startTime || "", endTime: times.endTime || "" }],
        ]),
      ),
    );
  }

  function addSlot(date) {
    setSlotsByDate((current) => ({
      ...current,
      [date]: [...(current[date] || []), { startTime: "", endTime: "" }],
    }));
  }

  function updateSlot(date, index, patch) {
    setSlotsByDate((current) => ({
      ...current,
      [date]: (current[date] || []).map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    }));
  }

  function removeSlot(date, index) {
    setSlotsByDate((current) => ({
      ...current,
      [date]: current[date].filter((_, slotIndex) => slotIndex !== index),
    }));
  }

  async function continueFromPets() {
    const nextErrors = getPetRowErrors(pets);
    if (
      pets.length < 1 ||
      pets.length > MAX_PUBLIC_BOOKING_PETS ||
      nextErrors.some((item) => item.name || item.species)
    ) {
      setPetErrors(nextErrors);
      setFailure("Please review the highlighted pet details.");
      return;
    }

    setPetErrors([]);
    setError("");
    startTransition(async () => {
      const result = await loadCanonicalPreviewCatalog(canonicalPets);
      if (!result.ok && result.code !== "NO_ELIGIBLE_CARE_OPTIONS") {
        setFailure(result.error || "Unable to load care options.");
        return;
      }

      const nextCatalog = result.ok ? result.catalog : { pets: canonicalPets, offerings: [] };
      const stillSelected = nextCatalog.offerings.find((item) => item.code === offeringCode);
      const stillSelectedOption = stillSelected?.options.find((item) => item.code === optionCode);
      setCatalog(nextCatalog);
      if (!stillSelected) setOfferingCode("");
      if (!stillSelectedOption) setOptionCode("");
      setStep(2);
    });
  }

  function validateSchedule() {
    if (isRange) return Boolean(range?.from && range?.to && times.startTime && times.endTime);
    if (!selectedDateStrs.length) return false;
    if (scheduleMode === "SAME") return Boolean(times.startTime && times.endTime);
    return selectedDateStrs.every((date) =>
      slotsByDate[date]?.length && slotsByDate[date].every((slot) => slot.startTime && slot.endTime),
    );
  }

  function handleNext() {
    setError("");
    if (step === 1) return void continueFromPets();
    if (step === 2 && !selectedOffering) return setFailure("Select a care type to continue.");
    if (step === 3 && !selectedOption) return setFailure("Select a care option to continue.");
    if (step === 4 && !validateSchedule()) return setFailure("Complete the schedule to continue.");
    if (
      step === 5 &&
      (!client.name.trim() || !client.email.trim() || !serviceLocation.addressLine1.trim() ||
        !serviceLocation.city.trim() || !serviceLocation.state.trim() || !serviceLocation.postalCode.trim())
    ) return setFailure("Complete the required client and service-address fields.");
    setStep((current) => Math.min(current + 1, STEPS.length));
  }

  function chooseOffering(code) {
    const offering = catalog.offerings.find((item) => item.code === code);
    setOfferingCode(code);
    setOptionCode(offering.options.length === 1 ? offering.options[0].code : "");
    setRange(undefined);
    setDates([]);
    setTimes({ startTime: "", endTime: "" });
    setSlotsByDate({});
  }

  function chooseOption(code) {
    if (code !== optionCode) {
      setRange(undefined);
      setDates([]);
      setTimes({ startTime: "", endTime: "" });
      setSlotsByDate({});
    }
    setOptionCode(code);
  }

  const selectedExtras = [
    addOns.nailTrim.enabled && nailTrimExtra
      ? nailTrimExtra.label ?? nailTrimExtra.name
      : null,
    addOns.bath.enabled && bathExtra ? bathExtra.label ?? bathExtra.name : null,
  ].filter(Boolean);

  const reviewSchedule = isRange
    ? range?.from && range?.to
      ? `${range.from.toDateString()} to ${range.to.toDateString()} · ${formatTime12h(times.startTime)}–${formatTime12h(times.endTime)}`
      : "Not selected"
    : selectedDateStrs.length
      ? `${selectedDateStrs.map(dateLabel).join(", ")} · ${scheduleMode === "SAME" ? `${formatTime12h(times.startTime)}–${formatTime12h(times.endTime)}` : "Times vary by date"}`
      : "Not selected";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Canonical booking preview"
        title="Care that starts with your pets"
        description="Build a household, choose eligible care, and preview the future booking total. Submission is intentionally unavailable in this QA flow."
      />

      <nav aria-label="Booking progress">
        <div className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-4 sm:hidden">
          <div className="flex justify-between gap-4 text-sm">
            <strong className="text-[var(--task-primary)]">Step {step} of {STEPS.length}</strong>
            <span className="text-[var(--task-text-muted)]">{STEPS[step - 1]}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--task-surface-soft)]">
            <div className="h-full rounded-full bg-[var(--task-primary)]" style={{ width: `${(step / STEPS.length) * 100}%` }} />
          </div>
        </div>
        <ol className="hidden grid-cols-6 gap-2 sm:grid">
          {STEPS.map((label, index) => (
            <li key={label} aria-current={index + 1 === step ? "step" : undefined} className="text-center">
              <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${index + 1 <= step ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white" : "border-[var(--task-border-strong)] bg-white text-[var(--task-text-muted)]"}`}>{index + 1}</span>
              <span className="mt-2 block text-xs font-medium text-[var(--task-text-muted)]">{label}</span>
            </li>
          ))}
        </ol>
      </nav>

      <Card className="p-4 sm:p-6 lg:p-8">
        {step === 1 ? (
          <div className="space-y-4">
            <div><Eyebrow>Pets</Eyebrow><h2 className="mt-1 text-2xl font-bold text-[var(--task-text)]">Who are we caring for?</h2></div>
            <BookingStepClientInfo view="pets" pets={pets} setPets={setPets} petErrors={petErrors} setPetErrors={setPetErrors} dogSize={dogSize} toggleDogSize={toggleDogSize} hasDog={hasDog} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div><Eyebrow>Care type</Eyebrow><h2 className="mt-1 text-2xl font-bold text-[var(--task-text)]">What kind of care do they need?</h2></div>
            {catalog?.offerings?.length ? (
              <div className="grid gap-3 md:grid-cols-3">
                {catalog.offerings.map((offering) => (
                  <button key={offering.code} type="button" aria-pressed={offering.code === offeringCode} onClick={() => chooseOffering(offering.code)} className={`min-h-32 rounded-[var(--task-radius-card)] border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--task-focus)] ${offering.code === offeringCode ? "border-[var(--task-primary)] bg-[var(--task-success-soft)]" : "border-[var(--task-border)] bg-white hover:border-[var(--task-primary)]"}`}>
                    <span className="block text-lg font-bold text-[var(--task-text)]">{offering.name}</span>
                    <span className="mt-2 block text-sm leading-6 text-[var(--task-text-muted)]">{offering.description}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Notice><strong className="block text-[var(--task-text)]">We don&apos;t currently have an online care option for this pet household.</strong><span className="mt-1 block">Online options are based on the pet types included in this booking.</span></Notice>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div><Eyebrow>Care options</Eyebrow><h2 className="mt-1 text-2xl font-bold text-[var(--task-text)]">Choose the right visit</h2><p className="mt-1 text-sm text-[var(--task-text-muted)]">{selectedOffering?.name}</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectedOffering?.options.map((option) => (
                <button key={option.code} type="button" aria-pressed={option.code === optionCode} onClick={() => chooseOption(option.code)} className={`rounded-[var(--task-radius-card)] border p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--task-focus)] ${option.code === optionCode ? "border-[var(--task-primary)] bg-[var(--task-success-soft)]" : "border-[var(--task-border)] bg-white"}`}>
                  <span className="block text-lg font-bold text-[var(--task-text)]">{publicOptionLabel(selectedOffering, option)}</span>
                  <span className="mt-4 grid gap-1 text-sm text-[var(--task-text-muted)]"><span>Service <strong className="float-right text-[var(--task-text)]">{money(option.quote.serviceSubtotalCents, option.quote.currency)}</strong></span><span>TaskWhisker fee <strong className="float-right text-[var(--task-text)]">{money(option.quote.clientFeeCents, option.quote.currency)}</strong></span><span className="mt-1 border-t border-[var(--task-border)] pt-2 font-bold text-[var(--task-text)]">Total <strong className="float-right">{money(option.quote.clientTotalCents, option.quote.currency)}</strong></span></span>
                </button>
              ))}
            </div>
            <section className="border-t border-[var(--task-border)] pt-5"><h3 className="mb-3 text-base font-semibold text-[var(--task-text)]">Optional extras</h3><BookingStepAddOns nailTrimExtra={nailTrimExtra} bathExtra={bathExtra} addOns={addOns} toggleAddOn={toggleAddOn} setAddOnField={setAddOnField} /><p className="mt-3 text-xs leading-5 text-[var(--task-text-muted)]">Extra pricing is shown for layout review and is not included in the canonical preview total yet.</p></section>
          </div>
        ) : null}

        {step === 4 ? (
          sitterId ? <BookingStepSchedule isRange={isRange} scheduleMode={scheduleMode} setScheduleMode={setScheduleMode} selectedDateStrs={selectedDateStrs} syncSlotsForDates={syncSlotsForDates} serviceType={scheduleType(selectedOffering)} range={range} handleRangeChange={setRange} dates={dates} handleDatesChange={setDates} times={times} setTimes={setTimes} slotsByDate={slotsByDate} addSlot={addSlot} updateSlot={updateSlot} removeSlot={removeSlot} sitterId={sitterId} durationMinutes={selectedOption?.durationMinutes || 30} bufferMinutes={15} clearError={() => setError("")} /> : <Notice tone="danger">Availability is not configured for this preview.</Notice>
        ) : null}

        {step === 5 ? <BookingStepClientInfo view="details" client={client} setClient={setClient} pets={pets} setPets={setPets} serviceLocation={serviceLocation} setServiceLocation={setServiceLocation} notes={notes} setNotes={setNotes} dogSize={dogSize} toggleDogSize={toggleDogSize} hasDog={hasDog} /> : null}

        {step === 6 ? (
          <div className="space-y-4">
            <div><Eyebrow>Review</Eyebrow><h2 className="mt-1 text-2xl font-bold text-[var(--task-text)]">Review your care request</h2></div>
            <dl className="divide-y divide-[var(--task-border)] rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white px-5">
              <div className="py-5 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-6"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Pets</dt><dd className="mt-2 space-y-1 font-medium text-[var(--task-text)] sm:mt-0">{canonicalPets.map((pet, index) => <div key={`${pet.name}-${index}`}>{pet.name} — {pet.species}</div>)}</dd></div>
              <div className="py-5 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-6"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Care</dt><dd className="mt-2 text-[var(--task-text)] sm:mt-0"><strong>{selectedOffering?.name}</strong><div>{publicOptionLabel(selectedOffering, selectedOption)}</div></dd></div>
              <div className="py-5 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-6"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Schedule</dt><dd className="mt-2 break-words text-[var(--task-text)] sm:mt-0">{reviewSchedule}</dd></div>
              <div className="py-5 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-6"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Client</dt><dd className="mt-2 break-words text-[var(--task-text)] sm:mt-0"><strong>{client.name}</strong><div>{client.email}</div><div>{serviceLocation.addressLine1}, {serviceLocation.city}, {serviceLocation.state} {serviceLocation.postalCode}</div></dd></div>
              <div className="py-5 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-6"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Optional extras</dt><dd className="mt-2 text-[var(--task-text)] sm:mt-0">{selectedExtras.length ? selectedExtras.join(", ") : "None selected"}</dd></div>
              <div className="py-5 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-6"><dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Price</dt><dd className="mt-2 space-y-1 text-[var(--task-text)] sm:mt-0"><div>Service <strong className="float-right">{money(selectedOption?.quote.serviceSubtotalCents, selectedOption?.quote.currency)}</strong></div><div>TaskWhisker fee <strong className="float-right">{money(selectedOption?.quote.clientFeeCents, selectedOption?.quote.currency)}</strong></div><div className="border-t border-[var(--task-border)] pt-2 text-lg font-bold">Total <strong className="float-right">{money(selectedOption?.quote.clientTotalCents, selectedOption?.quote.currency)}</strong></div>{selectedExtras.length ? <p className="pt-2 text-xs leading-5 text-[var(--task-text-muted)]">Optional extras are not included in this preview total.</p> : null}</dd></div>
            </dl>
            <Notice>This preview does not submit or create a booking.</Notice>
          </div>
        ) : null}

        {error ? <div ref={errorRef} tabIndex={-1} className="mt-5 focus:outline-none"><FormFeedback>{error}</FormFeedback></div> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--task-border)] pt-5 sm:flex-row sm:justify-between">
          <Button type="button" variant="secondary" onClick={() => { setError(""); setStep((current) => Math.max(1, current - 1)); }} disabled={step === 1 || pending}>Back</Button>
          {step < STEPS.length ? <Button type="button" onClick={handleNext} disabled={pending || (step === 2 && !catalog?.offerings?.length)}>{pending ? "Loading care…" : "Continue"}</Button> : <Button type="button" disabled>Request booking unavailable in preview</Button>}
        </div>
      </Card>
    </div>
  );
}
