// src/app/book/BookServiceChooser.jsx
"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Eyebrow,
  FormField,
  Notice,
  PageHeader,
  PageShell,
} from "@/components/ui/Foundation";

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
      <PageShell containerClassName="max-w-xl">
        <Card className="p-6 sm:p-8">
          <PageHeader
            eyebrow="Request pet care"
            title="Book a service"
            description="Choose the care your pet needs to begin a booking request."
          />
          <Notice className="mt-6">
            No services are available right now.
          </Notice>
          <Button href="/" variant="quiet" className="mt-5">
            Return to TaskWhisker
          </Button>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell containerClassName="max-w-2xl">
      <Card className="p-6 sm:p-8 lg:p-10">
        <PageHeader
          eyebrow="Request pet care"
          title="Book a service"
          description="Choose the service you need to start your booking request."
        />

        <div className="mt-8">
          <FormField
            as="select"
            id="booking-service"
            label="Service"
            value={serviceCode}
            onChange={(e) => setServiceCode(e.target.value)}
          >
            {services.map((service) => (
              <option key={service.id} value={service.code}>
                {service.name}
              </option>
            ))}
          </FormField>
        </div>

        {selectedService && (
          <section className="mt-6 rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Eyebrow className="text-[var(--task-accent)]">
                  {selectedService.species} care
                </Eyebrow>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[var(--task-text)]">
                  {selectedService.name}
                </h2>
              </div>

              <span className="rounded-full border border-[var(--task-border)] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--task-text-muted)]">
                {selectedService.category.replace("_", " ")}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-[var(--task-text-muted)]">
              {getServiceBlurb(selectedService)}
            </p>

            <dl className="mt-5 grid gap-3 border-t border-[var(--task-border)] pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-[var(--task-text-muted)]">Starting at</dt>
                <dd className="mt-1 font-semibold text-[var(--task-text)]">{formatPrice(selectedService.basePriceCents)}</dd>
              </div>

              {typeof selectedService.durationMinutes === "number" && (
                <div>
                  <dt className="text-xs font-medium text-[var(--task-text-muted)]">Duration</dt>
                  <dd className="mt-1 font-semibold text-[var(--task-text)]">{selectedService.durationMinutes} min</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button href="/" variant="quiet">
            Back to home
          </Button>
          <Button
            href={`/book/${selectedService.code}`}
            className="w-full sm:w-auto sm:min-w-48"
          >
            Continue to booking
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
