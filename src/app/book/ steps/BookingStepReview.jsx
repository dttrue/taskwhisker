// src/app/book/steps/BookingStepReview.jsx
"use client";

import { useMemo } from "react";
import { formatTimeSlots, formatTime12h } from "../bookingFormUtils";
import { formatServiceAddress } from "@/lib/formatAddress";

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
        <div>
          <span className="font-medium">Time:</span>{" "}
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
          <span className="font-semibold text-zinc-800">Time slots</span>

          <div className="mt-2 space-y-2">
            <div className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-800">
                {Object.values(slotsByDate || {}).reduce(
                  (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                  0
                )}
              </span>{" "}
              visits across{" "}
              <span className="font-semibold text-zinc-800">
                {Object.keys(slotsByDate || {}).length}
              </span>{" "}
              day{Object.keys(slotsByDate || {}).length > 1 ? "s" : ""}
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
              <div key={dateStr} className="text-sm">
                <div className="text-zinc-600">{label}</div>
                <div>{slotText || "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [isRange, scheduleMode, times, slotsByDate, selectedDateStrs]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3 text-sm font-medium text-zinc-900">
          Review your request
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <div className="font-medium text-zinc-900">Service</div>
            <div className="text-zinc-600">
              {payloadService?.label ?? payloadService?.name ?? "—"}
            </div>
          </div>

          <div>
            <div className="font-medium text-zinc-900">Schedule</div>
            <div className="text-zinc-600">Dates: {reviewDates}</div>
            {isRange && nightCount !== null ? (
              <div className="text-zinc-600">Nights: {nightCount}</div>
            ) : null}
            <div className="mt-1">{reviewSchedule}</div>
          </div>

          <div>
            <div className="font-medium text-zinc-900">Client</div>
            <div className="text-zinc-600">{client?.name || "—"}</div>
            <div className="text-zinc-600">{client?.email || "—"}</div>
            {client?.phone ? (
              <div className="text-zinc-600">{client.phone}</div>
            ) : null}
          </div>

          <div>
            <div className="font-medium text-zinc-900">Pet details</div>
            <div className="text-zinc-600">
              Dog size: {formatDogSizes(dogSize)}
            </div>
            <div className="text-zinc-600">
              Weight class: {formatWeightClass(weightClass)}
            </div>
          </div>

          {hasAnyAddOns && (
            <div>
              <div className="font-medium text-zinc-900">Add-ons</div>
              <ul className="ml-5 mt-1 list-disc space-y-1 text-zinc-600">
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
            </div>
          )}

          <div>
            <div className="font-medium text-zinc-900">Service address</div>
            <div className="text-zinc-600">
              {formatServiceAddress(serviceLocation) || "—"}
            </div>
          </div>

          {serviceLocation?.accessInstructions ? (
            <div>
              <div className="font-medium text-zinc-900">
                Access instructions
              </div>
              <div className="text-zinc-600">
                {serviceLocation.accessInstructions}
              </div>
            </div>
          ) : null}

          {serviceLocation?.locationNotes ? (
            <div>
              <div className="font-medium text-zinc-900">Location notes</div>
              <div className="text-zinc-600">
                {serviceLocation.locationNotes}
              </div>
            </div>
          ) : null}

          {notes ? (
            <div>
              <div className="font-medium text-zinc-900">General notes</div>
              <div className="text-zinc-600 whitespace-pre-wrap">{notes}</div>
            </div>
          ) : null}
        </div>
      </div>

      {booking && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Booking created! ID: <span className="font-mono">{booking.id}</span>
        </div>
      )}
    </div>
  );
}
