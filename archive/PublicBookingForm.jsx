"use client";

import { useMemo, useState, useTransition } from "react";
import { createPublicBooking } from "./actions";
import { getDateListFromRange } from "./bookingDateUtils";
import { toDateStr } from "./bookingFormUtils";
import { buildPublicBookingPayload } from "./buildPublicBookingPayload";
import {
  validateScheduleStep,
  validateAddOnsStep,
  validateClientInfoStep,
} from "./validatePublicBookingStep";

import BookingStepService from "./steps/BookingStepService";
import BookingStepSchedule from "./steps/BookingStepSchedule";
import BookingStepAddOns from "./steps/BookingStepAddOns";
import BookingStepClientInfo from "./steps/BookingStepClientInfo";
import BookingStepReview from "./steps/BookingStepReview";

const STEPS = ["Service", "Schedule", "Add-ons", "Your info", "Review"];

export function PublicBookingForm({ serviceOptions = [], extraOptions = [] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);
  const [step, setStep] = useState(0);

  const firstService = serviceOptions[0] || null;

  const [serviceCode, setServiceCode] = useState(firstService?.code || "");
  const [serviceType, setServiceType] = useState(
    firstService?.serviceType || "OVERNIGHT"
  );

  const [range, setRange] = useState();
  const [dates, setDates] = useState([]);
  const [scheduleMode, setScheduleMode] = useState("SAME");

  const [times, setTimes] = useState({
    startTime: "",
    endTime: "",
  });

  const [slotsByDate, setSlotsByDate] = useState({});

  const [addOns, setAddOns] = useState({
    nailTrim: { enabled: false, appliesTo: "ONCE" },
    bath: { enabled: false, appliesTo: "ONCE", smallDogs: 0, largeDogs: 0 },
  });

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

  const [notes, setNotes] = useState("");

  const isRange = serviceType === "OVERNIGHT";

  const payloadService = useMemo(() => {
    return serviceOptions.find((s) => s.code === serviceCode) || firstService;
  }, [serviceOptions, serviceCode, firstService]);

  const availableExtras = useMemo(() => {
    if (!payloadService) return [];
    return extraOptions.filter(
      (extra) => extra.species === payloadService.species
    );
  }, [extraOptions, payloadService]);

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

  const selectedDateStrs = useMemo(() => {
    if (isRange) {
      if (!range?.from || !range?.to) return [];
      return getDateListFromRange(toDateStr(range.from), toDateStr(range.to));
    }

    return Array.from(new Set((dates || []).map(toDateStr))).sort();
  }, [isRange, range, dates]);

  const hasAnyAddOns = addOns.nailTrim.enabled || addOns.bath.enabled;

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

  function syncSlotsForDates(nextDateStrs) {
    setSlotsByDate((prev) => {
      const next = {};

      for (const d of nextDateStrs) {
        next[d] =
          Array.isArray(prev[d]) && prev[d].length
            ? prev[d]
            : [{ startTime: "", endTime: "" }];
      }

      return next;
    });
  }

  function handleDatesChange(nextDates) {
    const safeDates = Array.isArray(nextDates) ? nextDates : [];
    setDates(safeDates);

    if (scheduleMode === "CUSTOM") {
      const nextDateStrs = Array.from(new Set(safeDates.map(toDateStr))).sort();
      syncSlotsForDates(nextDateStrs);
    }
  }

  function handleRangeChange(nextRange) {
    setRange(nextRange);

    if (scheduleMode === "CUSTOM" && nextRange?.from && nextRange?.to) {
      const nextDateStrs = getDateListFromRange(
        toDateStr(nextRange.from),
        toDateStr(nextRange.to)
      );
      syncSlotsForDates(nextDateStrs);
    }
  }

  function addSlot(dateStr) {
    setSlotsByDate((prev) => ({
      ...prev,
      [dateStr]: [
        ...(Array.isArray(prev[dateStr]) ? prev[dateStr] : []),
        { startTime: "", endTime: "" },
      ],
    }));
  }

  function removeSlot(dateStr, idx) {
    setSlotsByDate((prev) => {
      const current = Array.isArray(prev[dateStr]) ? prev[dateStr] : [];
      if (current.length <= 1) return prev;

      return {
        ...prev,
        [dateStr]: current.filter((_, i) => i !== idx),
      };
    });
  }

  function updateSlot(dateStr, idx, patch) {
    setSlotsByDate((prev) => {
      const current = Array.isArray(prev[dateStr]) ? prev[dateStr] : [];
      return {
        ...prev,
        [dateStr]: current.map((slot, i) =>
          i === idx ? { ...slot, ...patch } : slot
        ),
      };
    });
  }

  function goNext() {
    setError(null);

    if (step === 0 && !serviceCode) {
      return setError("Please select a service.");
    }

    if (step === 1) {
      const scheduleError = validateScheduleStep({
        isRange,
        range,
        dates,
        scheduleMode,
        times,
        selectedDateStrs,
        slotsByDate,
      });

      if (scheduleError) return setError(scheduleError);
    }

    if (step === 2) {
      const addOnError = validateAddOnsStep({
        addOns,
        nailTrimExtra,
        bathExtra,
      });

      if (addOnError) return setError(addOnError);
    }

    if (step === 3) {
      const clientError = validateClientInfoStep({ client, serviceLocation });
      if (clientError) return setError(clientError);
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleFinalSubmit() {
    if (booking) return;

    setError(null);
    setBooking(null);

    startTransition(async () => {
      try {
        const payload = buildPublicBookingPayload({
          payloadService,
          isRange,
          range,
          selectedDateStrs,
          scheduleMode,
          slotsByDate,
          times,
          addOns,
          nailTrimExtra,
          bathExtra,
          client,
          serviceLocation,
          notes,
        });

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

  if (!firstService) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="mb-4 text-xl font-semibold">Request a Booking</h1>
        <p className="text-sm text-red-600">
          No services are configured yet. Please add services in the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Request a Booking</h1>

        <ul className="steps steps-horizontal mt-3 w-full">
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
        {step === 0 && (
          <BookingStepService
            serviceOptions={serviceOptions}
            serviceCode={serviceCode}
            setServiceCode={setServiceCode}
            setServiceType={setServiceType}
            setScheduleMode={setScheduleMode}
          />
        )}

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
          <BookingStepAddOns
            nailTrimExtra={nailTrimExtra}
            bathExtra={bathExtra}
            addOns={addOns}
            toggleAddOn={toggleAddOn}
            setAddOnField={setAddOnField}
          />
        )}

        {step === 3 && (
          <BookingStepClientInfo
            client={client}
            setClient={setClient}
            serviceLocation={serviceLocation}
            setServiceLocation={setServiceLocation}
            notes={notes}
            setNotes={setNotes}
          />
        )}

        {step === 4 && (
          <BookingStepReview
            booking={booking}
            payloadService={payloadService}
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
            notes={notes}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={goBack}
            disabled={pending || step === 0}
            className="flex-1 rounded border py-2 disabled:opacity-50"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={pending}
              className="flex-1 rounded bg-black py-2 text-white disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={pending || !!booking}
              className="flex-1 rounded bg-black py-2 text-white disabled:opacity-50"
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
