// src/app/book/PublicBookingForm.jsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { createPublicBooking } from "./actions";
import AdaptiveCalendar from "@/components/AdaptiveCalendar";
import ServicePicker from "./ServicePicker";

const STEPS = ["Service", "Schedule", "Add-ons", "Your info", "Review"];

const BOOKING_WINDOW_START = "07:00";
const BOOKING_WINDOW_END = "22:00";

function timeToMinutes(t) {
  if (!t || typeof t !== "string" || !t.includes(":")) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function formatTimeSlots(slotsByDate) {
  if (!slotsByDate) return [];

  return Object.entries(slotsByDate).map(([date, slots]) => ({
    date,
    slots,
  }));
}

function isValidTimeRange(startTime, endTime) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);

  if (s == null || e == null) {
    return { ok: false, reason: "Invalid time format." };
  }

  if (e <= s) {
    return { ok: false, reason: "End time must be after start time." };
  }

  const ws = timeToMinutes(BOOKING_WINDOW_START);
  const we = timeToMinutes(BOOKING_WINDOW_END);

  if (s < ws || e > we) {
    return {
      ok: false,
      reason: "Bookings are only available between 7:00 AM and 10:00 PM.",
    };
  }

  return { ok: true };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function getDateListFromRange(start, end) {
  const result = [];
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];
  if (endDate <= startDate) return [];

  const cursor = new Date(startDate);
  while (cursor < endDate) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

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

  const isRange = serviceType === "OVERNIGHT";

  const payloadService = useMemo(() => {
    return serviceOptions.find((s) => s.code === serviceCode) || firstService;
  }, [serviceOptions, serviceCode, firstService]);

  const availableExtras = useMemo(() => {
    if (!payloadService) return [];

    return extraOptions.filter((extra) => {
      if (extra.species !== payloadService.species) return false;
      return true;
    });
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

  // Schedule mode:
  // SAME = one time window applied to all selected dates
  // CUSTOM = multiple visit windows per selected date
  const [scheduleMode, setScheduleMode] = useState("SAME");

  const [times, setTimes] = useState({
    startTime: "",
    endTime: "",
  });

  // { "YYYY-MM-DD": [{ startTime, endTime }] }
  const [slotsByDate, setSlotsByDate] = useState({});

  // Keeping your current UI state shape, but now mapped to DB-backed extras
  const [addOns, setAddOns] = useState({
    nailTrim: { enabled: false, appliesTo: "ONCE" },
    bath: { enabled: false, appliesTo: "ONCE", smallDogs: 0, largeDogs: 0 },
  });

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

  const [notes, setNotes] = useState("");

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

      const next = current.filter((_, i) => i !== idx);
      return { ...prev, [dateStr]: next };
    });
  }

  function updateSlot(dateStr, idx, patch) {
    setSlotsByDate((prev) => {
      const current = Array.isArray(prev[dateStr]) ? prev[dateStr] : [];
      const next = current.map((slot, i) =>
        i === idx ? { ...slot, ...patch } : slot
      );
      return { ...prev, [dateStr]: next };
    });
  }

  function validateScheduleStep() {
    if (isRange) {
      if (!range?.from || !range?.to) {
        return "Please select a valid check-in and check-out range.";
      }
    } else {
      if (!dates.length) {
        return "Please select at least one date.";
      }
    }

    if (isRange || scheduleMode === "SAME") {
      if (!times.startTime) return "Start time is required.";
      if (!times.endTime) return "End time is required.";

      const check = isValidTimeRange(times.startTime, times.endTime);
      if (!check.ok) return check.reason;

      return null;
    }

    if (!selectedDateStrs.length) {
      return "Please select at least one date.";
    }

    for (const dateStr of selectedDateStrs) {
      const slots = slotsByDate[dateStr] || [];

      if (!slots.length) {
        return `Please add at least one time slot for ${new Date(
          `${dateStr}T00:00:00`
        ).toDateString()}.`;
      }

      for (const slot of slots) {
        if (!slot.startTime || !slot.endTime) {
          return `Missing start/end time on ${new Date(
            `${dateStr}T00:00:00`
          ).toDateString()}.`;
        }

        const check = isValidTimeRange(slot.startTime, slot.endTime);
        if (!check.ok) {
          return `${new Date(`${dateStr}T00:00:00`).toDateString()}: ${
            check.reason
          }`;
        }
      }

      const sorted = slots
        .map((slot) => ({
          s: timeToMinutes(slot.startTime),
          e: timeToMinutes(slot.endTime),
        }))
        .sort((a, b) => a.s - b.s);

      for (let i = 1; i < sorted.length; i++) {
        if (
          overlaps(sorted[i - 1].s, sorted[i - 1].e, sorted[i].s, sorted[i].e)
        ) {
          return `Two time slots overlap on ${new Date(
            `${dateStr}T00:00:00`
          ).toDateString()}.`;
        }
      }
    }

    return null;
  }

  function goNext() {
    setError(null);

    if (step === 0) {
      if (!serviceCode) return setError("Please select a service.");
    }

    if (step === 1) {
      const scheduleError = validateScheduleStep();
      if (scheduleError) return setError(scheduleError);
    }

    if (step === 2) {
      if (addOns.nailTrim.enabled && !nailTrimExtra) {
        return setError("Nail trim is not available for this service.");
      }

      if (addOns.bath.enabled) {
        if (!bathExtra) {
          return setError("Bath is not available for this service.");
        }

        const totalDogs =
          (addOns.bath.smallDogs || 0) + (addOns.bath.largeDogs || 0);

        if (totalDogs === 0) {
          return setError(
            "For Bath, please enter at least 1 dog (small or large)."
          );
        }
      }
    }

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
      datesArray = selectedDateStrs;
    }

    if (!payloadService) {
      throw new Error("Service configuration is missing.");
    }

    const visitCount =
      !isRange && scheduleMode === "CUSTOM"
        ? Object.values(slotsByDate || {}).reduce(
            (sum, slots) => sum + (Array.isArray(slots) ? slots.length : 0),
            0
          )
        : Math.max(selectedDateStrs.length, 1);

    const addOnsPayload = [];

    if (addOns.nailTrim.enabled) {
      if (!nailTrimExtra) {
        throw new Error("Nail trim is not available for this service.");
      }

      addOnsPayload.push({
        code: nailTrimExtra.code,
        appliesTo: addOns.nailTrim.appliesTo,
        quantity: addOns.nailTrim.appliesTo === "EACH_VISIT" ? visitCount : 1,
      });
    }

    if (addOns.bath.enabled) {
      if (!bathExtra) {
        throw new Error("Bath is not available for this service.");
      }

      addOnsPayload.push({
        code: bathExtra.code,
        appliesTo: addOns.bath.appliesTo,
        quantity: addOns.bath.appliesTo === "EACH_VISIT" ? visitCount : 1,
        smallDogs: addOns.bath.smallDogs,
        largeDogs: addOns.bath.largeDogs,
      });
    }

    const schedulePayload =
      !isRange && scheduleMode === "CUSTOM"
        ? {
            scheduleMode: "CUSTOM",
            slotsByDate,
          }
        : {
            scheduleMode: "SAME",
            startTime: times.startTime,
            endTime: times.endTime,
          };

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

      ...schedulePayload,

      addOns: addOnsPayload.length ? addOnsPayload : undefined,
      notes: notes || undefined,
    };
  }

  function handleFinalSubmit() {
    if (booking) return;

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
    : selectedDateStrs.length
    ? selectedDateStrs
        .map((d) => new Date(`${d}T00:00:00`).toDateString())
        .join(", ")
    : "—";

  const reviewSchedule = useMemo(() => {
    if (isRange || scheduleMode === "SAME") {
      return (
        <div>
          <span className="font-medium">Time:</span> {times.startTime || "—"} →{" "}
          {times.endTime || "—"}
        </div>
      );
    }

    const entries = Object.entries(slotsByDate || {})
      .filter(([dateStr]) => selectedDateStrs.includes(dateStr))
      .sort(([a], [b]) => a.localeCompare(b));

    if (!entries.length) {
      return (
        <div>
          <span className="font-semibold text-zinc-800">Time slots</span>

          <div className="mt-2 space-y-2">
            <div className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-800">
                {Object.values(slotsByDate).reduce((a, b) => a + b.length, 0)}
              </span>{" "}
              visits across{" "}
              <span className="font-semibold text-zinc-800">
                {Object.keys(slotsByDate).length}
              </span>{" "}
              day{Object.keys(slotsByDate).length > 1 ? "s" : ""}
            </div>
            {formatTimeSlots(slotsByDate).map((group) => (
              <div key={group.date}>
                <div className="mt-4 text-sm font-semibold text-zinc-800">
                  {new Date(group.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>

                <ul className="ml-5 list-disc space-y-1 text-sm text-zinc-600">
                  {group.slots.map((slot, i) => (
                    <li key={i}>
                      {new Date(
                        `1970-01-01T${slot.startTime}`
                      ).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      →{" "}
                      {new Date(
                        `1970-01-01T${slot.endTime}`
                      ).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="font-medium">Time slots:</div>
        <div className="mt-1 space-y-2">
          {entries.map(([dateStr, slots]) => {
            const label = new Date(`${dateStr}T00:00:00`).toDateString();

            function formatTime12h(t) {
              if (!t || typeof t !== "string" || !t.includes(":")) return "—";
              const [hhRaw, mmRaw] = t.split(":");
              const hh = Number(hhRaw);
              const mm = Number(mmRaw);
              if (Number.isNaN(hh) || Number.isNaN(mm)) return "—";

              const suffix = hh >= 12 ? "PM" : "AM";
              const hour12 = hh % 12 === 0 ? 12 : hh % 12;
              const mm2 = String(mm).padStart(2, "0");
              return `${hour12}:${mm2} ${suffix}`;
            }

            const slotText = (slots || [])
              .map(
                (slot) =>
                  `${formatTime12h(slot.startTime)} → ${formatTime12h(
                    slot.endTime
                  )}`
              )
              .join(", ");

            return (
              <div key={dateStr} className="text-sm">
                <div className="text-gray-600">{label}</div>
                <div>{slotText || "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [isRange, scheduleMode, times, slotsByDate, selectedDateStrs]);

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

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Request a Booking</h1>

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

                if (svc.serviceType === "OVERNIGHT") {
                  setScheduleMode("SAME");
                }
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
            {!isRange && (
              <div className="border rounded-xl p-3 bg-white">
                <div className="text-sm font-medium mb-2">Time options</div>

                <div className="join join-vertical sm:join-horizontal w-full">
                  <button
                    type="button"
                    className={`btn btn-sm join-item ${
                      scheduleMode === "SAME" ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => setScheduleMode("SAME")}
                  >
                    Same time for all dates
                  </button>

                  <button
                    type="button"
                    className={`btn btn-sm join-item ${
                      scheduleMode === "CUSTOM" ? "btn-primary" : "btn-ghost"
                    }`}
                    onClick={() => {
                      setScheduleMode("CUSTOM");
                      syncSlotsForDates(selectedDateStrs);
                    }}
                  >
                    Different times per date
                  </button>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  Use “Different times per date” for two walks in a day.
                </p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-1">Select dates</p>
              <AdaptiveCalendar
                serviceType={serviceType}
                range={range}
                setRange={handleRangeChange}
                dates={dates}
                setDates={handleDatesChange}
              />
            </div>

            {(isRange || scheduleMode === "SAME") && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium">
                      Start time
                    </label>
                    <input
                      name="startTime"
                      type="time"
                      min={BOOKING_WINDOW_START}
                      max={BOOKING_WINDOW_END}
                      value={times.startTime}
                      onChange={(e) =>
                        setTimes((t) => ({ ...t, startTime: e.target.value }))
                      }
                      className="mt-1 block w-full border rounded px-2 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      End time
                    </label>
                    <input
                      name="endTime"
                      type="time"
                      min={BOOKING_WINDOW_START}
                      max={BOOKING_WINDOW_END}
                      value={times.endTime}
                      onChange={(e) =>
                        setTimes((t) => ({ ...t, endTime: e.target.value }))
                      }
                      className="mt-1 block w-full border rounded px-2 py-2"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Booking window: 7:00 AM to 10:00 PM.
                </p>
              </>
            )}

            {!isRange && scheduleMode === "CUSTOM" && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Time slots per date</div>

                {!selectedDateStrs.length ? (
                  <p className="text-xs text-gray-500">
                    Select dates to add time slots.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedDateStrs.map((dateStr) => {
                      const label = new Date(
                        `${dateStr}T00:00:00`
                      ).toDateString();
                      const slots = slotsByDate[dateStr] || [
                        { startTime: "", endTime: "" },
                      ];

                      return (
                        <div
                          key={dateStr}
                          className="border rounded-xl p-3 bg-white"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">{label}</div>
                            <button
                              type="button"
                              className="btn btn-xs btn-outline"
                              onClick={() => addSlot(dateStr)}
                            >
                              + Add time
                            </button>
                          </div>

                          <div className="mt-3 space-y-3">
                            {slots.map((slot, idx) => (
                              <div
                                key={idx}
                                className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end"
                              >
                                <div>
                                  <label className="block text-xs text-gray-600">
                                    Start
                                  </label>
                                  <input
                                    type="time"
                                    min={BOOKING_WINDOW_START}
                                    max={BOOKING_WINDOW_END}
                                    value={slot.startTime}
                                    onChange={(e) =>
                                      updateSlot(dateStr, idx, {
                                        startTime: e.target.value,
                                      })
                                    }
                                    className="mt-1 block w-full border rounded px-2 py-2"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs text-gray-600">
                                    End
                                  </label>
                                  <input
                                    type="time"
                                    min={BOOKING_WINDOW_START}
                                    max={BOOKING_WINDOW_END}
                                    value={slot.endTime}
                                    onChange={(e) =>
                                      updateSlot(dateStr, idx, {
                                        endTime: e.target.value,
                                      })
                                    }
                                    className="mt-1 block w-full border rounded px-2 py-2"
                                  />
                                </div>

                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => removeSlot(dateStr, idx)}
                                  disabled={slots.length <= 1}
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>

                          <p className="text-xs text-gray-500 mt-2">
                            Booking window: 7:00 AM to 10:00 PM.
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Add-ons */}
        {step === 2 && (
          <div className="space-y-4">
            {nailTrimExtra && (
              <div className="border rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {nailTrimExtra.label}
                    </div>
                    <div className="text-xs text-gray-500">
                      +$
                      {(
                        Number(nailTrimExtra.basePriceCents || 0) / 100
                      ).toFixed(2)}
                      {typeof nailTrimExtra.durationMinutes === "number"
                        ? ` · +${nailTrimExtra.durationMinutes} min`
                        : ""}
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
            )}

            {bathExtra && (
              <div className="border rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{bathExtra.label}</div>
                    <div className="text-xs text-gray-500">
                      +$
                      {(Number(bathExtra.basePriceCents || 0) / 100).toFixed(2)}
                      {typeof bathExtra.durationMinutes === "number"
                        ? ` · +${bathExtra.durationMinutes} min`
                        : ""}
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
            )}

            {!nailTrimExtra && !bathExtra && (
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-600">
                No add-ons available for this service.
              </div>
            )}

            <p className="text-xs text-gray-500">
              Add-ons affect pricing and visit duration.
            </p>
          </div>
        )}

        {/* STEP 3 — Your info */}
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

        {/* STEP 4 — Review */}
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

                {reviewSchedule}

                {hasAnyAddOns && (
                  <div>
                    <span className="font-medium">Add-ons:</span>
                    <ul className="list-disc ml-5 mt-1">
                      {addOns.nailTrim.enabled && nailTrimExtra && (
                        <li>
                          {nailTrimExtra.label} (
                          {addOns.nailTrim.appliesTo === "EACH_VISIT"
                            ? "each visit"
                            : "once"}
                          )
                        </li>
                      )}
                      {addOns.bath.enabled && bathExtra && (
                        <li>
                          {bathExtra.label} (
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
