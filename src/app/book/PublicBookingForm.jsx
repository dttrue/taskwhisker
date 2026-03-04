// src/app/book/PublicBookingForm.jsx
"use client";

import { useState, useTransition } from "react";
import { createPublicBooking } from "./actions";
import AdaptiveCalendar from "@/components/AdaptiveCalendar";

export function PublicBookingForm({ serviceOptions = [] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  // Guard: no services configured
  const firstService = serviceOptions[0] || null;

  const [serviceCode, setServiceCode] = useState(firstService?.code || "");
  const [serviceType, setServiceType] = useState(
    firstService?.serviceType || "OVERNIGHT"
  );

  // Calendar state (controlled by this form, rendered by AdaptiveCalendar)
  const [range, setRange] = useState();
  const [dates, setDates] = useState([]);

  // Overnight => date RANGE, everything else => individual date(s)
  const isRange = serviceType === "OVERNIGHT";

  const handleSubmit = (event) => {
    event.preventDefault();
    setError(null);
    setBooking(null);

    if (!serviceCode) {
      setError("Please select a service.");
      return;
    }

    const formData = new FormData(event.currentTarget);

    // Work out the dates based on mode
    let mode;
    let startDate;
    let endDate;
    let datesArray;

    if (isRange) {
      mode = "RANGE";

      if (!range?.from || !range?.to) {
        setError("Please select a valid check-in and check-out range.");
        return;
      }

      startDate = range.from.toISOString().slice(0, 10); // YYYY-MM-DD
      endDate = range.to.toISOString().slice(0, 10);
    } else {
      mode = "MULTIPLE";

      if (!dates.length) {
        setError("Please select at least one date.");
        return;
      }

      datesArray = dates.map((d) => d.toISOString().slice(0, 10));
    }

    // Selected service meta
    const payloadService =
      serviceOptions.find((s) => s.code === serviceCode) || firstService;

    if (!payloadService) {
      setError("Service configuration is missing.");
      return;
    }

    const payload = {
      // Service info – matches Zod schema + Prisma enum
      serviceType: payloadService.serviceType,
      serviceCode: payloadService.code,
      serviceSummary: payloadService.label,

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
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      dates: datesArray || undefined,

      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      notes: formData.get("notes") || undefined,
    };

    startTransition(async () => {
      try {
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
  };

  // If there are literally no services, show a simple message
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

        {/* Service selector */}
        <div>
          <label className="block text-sm font-medium">Service</label>
          <select
            className="mt-1 block w-full border rounded px-2 py-1 bg-white"
            value={serviceCode}
            onChange={(e) => {
              const nextCode = e.target.value;
              setServiceCode(nextCode);
              const svc =
                serviceOptions.find((s) => s.code === nextCode) || firstService;
              setServiceType(svc.serviceType);
            }}
          >
            {serviceOptions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Calendar */}
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
