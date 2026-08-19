// src/app/book/steps/BookingStepReview.jsx
"use client";
import { useMemo } from "react";
import { formatTimeSlots, formatTime12h } from "../bookingFormUtils";
import { formatServiceAddress } from "@/lib/formatAddress";
import { Button, Notice } from "@/components/ui/Foundation";

const DOG_SIZE_LABELS = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

const WEIGHT_CLASS_LABELS = {
  TOY: "Toy · under 10 lbs",
  SMALL_10_25: "Small · 10–25 lbs",
  MEDIUM_26_50: "Medium · 26–50 lbs",
  LARGE_51_80: "Large · 51–80 lbs",
  XL_81_PLUS: "XL · 81+ lbs",
};

function formatDogSizes(dogSize = []) {
  if (!dogSize.length) return "—";
  return dogSize.map((value) => DOG_SIZE_LABELS[value] || value).join(", ");
}

function getExtraDisplayName(extra, fallback = "Add-on") {
  return extra?.label ?? extra?.name ?? extra?.title ?? fallback;
}

function formatWeightClass(weightClass) {
  if (!weightClass) return "—";
  return WEIGHT_CLASS_LABELS[weightClass] || weightClass;
}

function getNightCount(range) {
  if (!range?.from || !range?.to) return null;

  const from = new Date(range.from);
  const to = new Date(range.to);

  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);

  const diffMs = to.getTime() - from.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
}

export default function BookingStepReview({
  booking,
  payloadService,
  isRange,
  range,
  selectedDateStrs,
  scheduleMode,
  times,
  slotsByDate,
  addOns,
  nailTrimExtra,
  bathExtra,
  hasAnyAddOns,
  client,
  serviceLocation,
  notes,
  dogSize = [],
  weightClass = "",
}) {
  const reviewDates = useMemo(() => {
    if (isRange) {
      return range?.from && range?.to
        ? `${range.from.toDateString()} → ${range.to.toDateString()}`
        : "—";
    }

    return selectedDateStrs?.length
      ? selectedDateStrs
          .map((d) => new Date(`${d}T00:00:00`).toDateString())
          .join(", ")
      : "—";
  }, [isRange, range, selectedDateStrs]);

  const nightCount = useMemo(() => {
    if (!isRange) return null;
    return getNightCount(range);
  }, [isRange, range]);

  const reviewSchedule = useMemo(() => {
    if (isRange || scheduleMode === "SAME") {
      return (
        <div className="leading-6">
          <span className="font-semibold text-[var(--task-text)]">Time:</span>{" "}
          {formatTime12h(times.startTime) || "—"} →{" "}
          {formatTime12h(times.endTime) || "—"}
        </div>
      );
    }

    const entries = Object.entries(slotsByDate || {})
      .filter(([dateStr]) => selectedDateStrs.includes(dateStr))
      .sort(([a], [b]) => a.localeCompare(b));

    if (!entries.length) {
      return (
        <div>
          <span className="font-semibold text-[var(--task-text)]">Time slots</span>

          <div className="mt-2 space-y-2">
            <div className="text-[15px] leading-6 text-[var(--task-text)]">
              <span className="font-semibold text-[var(--task-text)]">
                {Object.values(slotsByDate || {}).reduce(
                  (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                  0
                )}
              </span>{" "}
              visits across{" "}
              <span className="font-semibold text-[var(--task-text)]">
                {Object.keys(slotsByDate || {}).length}
              </span>{" "}
              day{Object.keys(slotsByDate || {}).length > 1 ? "s" : ""}
            </div>

            {formatTimeSlots(slotsByDate).map((group) => (
              <div key={group.date}>
                <div className="mt-4 text-sm font-semibold text-[var(--task-text)]">
                  {new Date(group.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>

                <ul className="ml-5 list-disc space-y-1 text-[15px] leading-6 text-[var(--task-text)]">
                  {group.slots.map((slot, i) => (
                    <li key={i}>
                      {formatTime12h(slot.startTime)} →{" "}
                      {formatTime12h(slot.endTime)}
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

            const slotText = (slots || [])
              .map(
                (slot) =>
                  `${formatTime12h(slot.startTime)} → ${formatTime12h(
                    slot.endTime
                  )}`
              )
              .join(", ");

            return (
              <div key={dateStr} className="text-[15px] leading-6">
                <div className="font-medium text-[var(--task-text)]">{label}</div>
                <div className="text-[var(--task-text)]">{slotText || "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [isRange, scheduleMode, times, slotsByDate, selectedDateStrs]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-5 sm:p-7">
        <h2 className="mb-6 text-2xl font-bold tracking-[-0.035em] text-[var(--task-text)] sm:text-[1.7rem]">
          Review your request
        </h2>

        <dl className="divide-y divide-[var(--task-border)]">
          <div className="py-5 first:pt-0 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Service</dt>
            <dd className="mt-2 min-w-0 break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
              {payloadService?.label ?? payloadService?.name ?? "—"}
            </dd>
          </div>

          <div className="py-5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Schedule</dt>
            <dd className="mt-2 min-w-0 space-y-1 break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
            <div>Dates: {reviewDates}</div>
            {isRange && nightCount !== null ? (
              <div>Nights: {nightCount}</div>
            ) : null}
            <div>{reviewSchedule}</div>
            </dd>
          </div>

          <div className="py-5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Client</dt>
            <dd className="mt-2 min-w-0 break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
            <div>{client?.name || "—"}</div>
            <div>{client?.email || "—"}</div>
            {client?.phone ? (
              <div>{client.phone}</div>
            ) : null}
            </dd>
          </div>

          <div className="py-5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Pet details</dt>
            <dd className="mt-2 min-w-0 break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
            <div>
              Dog size: {formatDogSizes(dogSize)}
            </div>
            <div>
              Weight class: {formatWeightClass(weightClass)}
            </div>
            </dd>
          </div>

          {hasAnyAddOns && (
            <div className="py-5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
              <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Add-ons</dt>
              <dd className="min-w-0">
              <ul className="ml-5 mt-2 list-disc space-y-1 break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
                {addOns?.nailTrim?.enabled && nailTrimExtra && (
                  <li>
                    {getExtraDisplayName(nailTrimExtra, "Nail trim")} (
                    {addOns.nailTrim.appliesTo === "EACH_VISIT"
                      ? "each visit"
                      : "once"}
                    )
                  </li>
                )}

                {addOns?.bath?.enabled && bathExtra && (
                  <li>
                    {getExtraDisplayName(bathExtra, "Bath")} (
                    {addOns.bath.appliesTo === "EACH_VISIT"
                      ? "each visit"
                      : "once"}
                    ) — Small: {addOns.bath.smallDogs}, Large:{" "}
                    {addOns.bath.largeDogs}
                  </li>
                )}
              </ul>
              </dd>
            </div>
          )}

          <div className="py-5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Service address</dt>
            <dd className="mt-2 min-w-0 break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
              {formatServiceAddress(serviceLocation) || "—"}
            </dd>
          </div>

          {serviceLocation?.accessInstructions ? (
            <div className="py-5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
              <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">
                Access instructions
              </dt>
              <dd className="mt-2 min-w-0 whitespace-pre-wrap break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
                {serviceLocation.accessInstructions}
              </dd>
            </div>
          ) : null}

          {serviceLocation?.locationNotes ? (
            <div className="py-5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
              <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">Location notes</dt>
              <dd className="mt-2 min-w-0 whitespace-pre-wrap break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">
                {serviceLocation.locationNotes}
              </dd>
            </div>
          ) : null}

          {notes ? (
            <div className="py-5 last:pb-0 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7">
              <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--task-primary)]">General notes</dt>
              <dd className="mt-2 min-w-0 whitespace-pre-wrap break-words text-[15px] font-medium leading-6 text-[var(--task-text)] sm:mt-0">{notes}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {booking && (
        <Notice tone="success" role="status" aria-live="polite" title="Booking request sent">
          <p>Your request was created successfully. Reference: <span className="font-mono">{booking.id}</span></p>

          {booking.clientLinkToken ? (
            <Button
              href={`/client/bookings/${booking.clientLinkToken}/messages`}
              className="mt-3 w-full"
            >
              Message sitter
            </Button>
          ) : null}
        </Notice>
      )}
    </div>
  );
}
