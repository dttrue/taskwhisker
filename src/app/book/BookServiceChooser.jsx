// src/app/book/BookServiceChooser.jsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function formatPrice(cents) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function getServiceBlurb(service) {
  if (service?.notes?.trim()) return service.notes;

  switch (service?.category) {
    case "OVERNIGHT":
      return "Best for extended care and overnight stays in your home.";
    case "DROP_IN":
      return "Quick check-ins for feeding, potty breaks, and companionship.";
    case "WALK":
      return "Scheduled walks for exercise, fresh air, and routine.";
    default:
      return "Choose this service to continue your booking request.";
  }
}

export default function BookServiceChooser({ services = [] }) {
  const [serviceCode, setServiceCode] = useState(services[0]?.code || "");

  const selectedService = useMemo(() => {
    return (
      services.find((service) => service.code === serviceCode) || services[0]
    );
  }, [services, serviceCode]);

  if (!services.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Book a service
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            No services are available right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Book a service
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Choose the service you need to start your booking request.
          </p>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-zinc-900">
            Service
          </label>
          <select
            value={serviceCode}
            onChange={(e) => setServiceCode(e.target.value)}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-900"
          >
            {services.map((service) => (
              <option key={service.id} value={service.code}>
                {service.name}
              </option>
            ))}
          </select>
        </div>

        {selectedService && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {selectedService.species}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                  {selectedService.name}
                </h2>
              </div>

              <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                {selectedService.category.replace("_", " ")}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-zinc-600">
              {getServiceBlurb(selectedService)}
            </p>

            <div className="mt-4 space-y-1 text-sm text-zinc-700">
              <p>
                <span className="font-medium text-zinc-900">Starting at:</span>{" "}
                {formatPrice(selectedService.basePriceCents)}
              </p>

              {typeof selectedService.durationMinutes === "number" && (
                <p>
                  <span className="font-medium text-zinc-900">Duration:</span>{" "}
                  {selectedService.durationMinutes} min
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link
            href={`/book/${selectedService.code}`}
            className="inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Continue to booking
          </Link>
        </div>
      </div>
    </div>
  );
}
