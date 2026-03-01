// src/app/book/PublicBookingForm.jsx
"use client";

import { useState, useTransition } from "react";
import { createPublicBooking } from "./actions";
import AdaptiveCalendar from "@/components/AdaptiveCalendar";

export function PublicBookingForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  // For now we hard-lock this to OVERNIGHT.
  // Later you can add a selector to switch to WALK / DROP_IN.
  const [serviceType] = useState("OVERNIGHT");

  // Calendar state (controlled by this form, rendered by AdaptiveCalendar)
  const [range, setRange] = useState();
  const [dates, setDates] = useState([]);

  const isRange = serviceType === "OVERNIGHT";

  const handleSubmit = (event) => {
    event.preventDefault();
    setError(null);
    setBooking(null);

    const formData = new FormData(event.currentTarget);

    let mode;
    let startDate; // undefined by default
    let endDate; // undefined by default
    let datesArray; // undefined by default

    if (isRange) {
      mode = "RANGE";

      if (!range?.from || !range?.to) {
        setError("Please select a valid check-in and check-out range.");
        return;
      }

      startDate = range.from.toISOString().slice(0, 10);
      endDate = range.to.toISOString().slice(0, 10);
    } else {
      mode = "MULTIPLE";

      if (!dates.length) {
        setError("Please select at least one date.");
        return;
      }

      datesArray = dates.map((d) => d.toISOString().slice(0, 10));
    }

    const payload = {
      operatorId: "cmm43zvb60000a9uffinuugnr",

      serviceType,
      serviceSummary: "Overnight House Sitting",
      basePriceCentsPerVisit: 8000,

      client: {
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone") || undefined,
        addressLine1: formData.get("addressLine1") || undefined,
        addressLine2: formData.get("addressLine2") || undefined,
        city: formData.get("city") || undefined,
        state: formData.get("state") || undefined,
        postalCode: formData.get("postalCode") || undefined,
      },

      mode,
      startDate: startDate || undefined, // only send when set
      endDate: endDate || undefined,
      dates: datesArray || undefined, // <-- key change

      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      notes: formData.get("notes") || undefined,
    };

    startTransition(async () => {
      try {
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
  };

  return (
    <div className="max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <h1 className="text-xl font-semibold">Request a Booking</h1>

        {/* Client info */}
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            name="name"
            required
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            required
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Phone</label>
          <input
            name="phone"
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>

        {/* 🔥 React Day Picker instead of native date inputs */}
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

        {/* Time window */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium">Start time</label>
            <input
              name="startTime"
              type="time"
              required
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">End time</label>
            <input
              name="endTime"
              type="time"
              required
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea
            name="notes"
            rows={3}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {booking && (
          <p className="text-sm text-green-700">
            Booking created! ID: {booking.id}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {pending ? "Submitting..." : "Submit Booking"}
        </button>
      </form>
    </div>
  );
}

export default PublicBookingForm;
