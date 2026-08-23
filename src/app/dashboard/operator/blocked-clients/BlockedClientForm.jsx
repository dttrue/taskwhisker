// src/app/dashboard/operator/blocked-clients/BlockedClientForm.jsx
"use client";

import { useRef, useState, useTransition } from "react";
import { createBlockedClient } from "./actions";
import { Button, FormField, FormFeedback } from "@/components/ui/Foundation";

export default function BlockedClientForm() {
  const formRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setMessage(null);

    startTransition(async () => {
      const result = await createBlockedClient(formData);

      if (!result?.ok) {
        setMessage({
          type: "error",
          text: result?.error || "Could not block this client.",
        });
        return;
      }

      formRef.current?.reset();

      setMessage({
        type: "success",
        text: "Client added to blocklist.",
      });
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-[var(--task-surface)] p-5 shadow-[var(--task-shadow-card)] sm:p-6"
    >
      <div>
        <h2 className="text-xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
          Block a client
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--task-text-muted)]">
          Add enough information to prevent this person from booking again.
          Email, phone, or address with ZIP code are the strongest matches.
        </p>
      </div>

      <div className="mt-5 space-y-6">
        <fieldset>
          <legend className="text-sm font-semibold text-[var(--task-text)]">
            Client identity
          </legend>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <FormField id="blocked-name" name="name" type="text" label="Name" placeholder="Client name" />
            <FormField id="blocked-email" name="email" type="email" label="Email" placeholder="client@example.com" />
            <FormField id="blocked-phone" name="phone" type="tel" label="Phone" placeholder="555-555-5555" />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-[var(--task-text)]">
            Service address
          </legend>
          <div className="mt-3 grid gap-4 md:grid-cols-6">
            <FormField id="blocked-address-1" name="addressLine1" type="text" label="Address line 1" placeholder="123 Main St" className="md:col-span-3" />
            <FormField id="blocked-address-2" name="addressLine2" type="text" label="Address line 2" placeholder="Apt, unit, etc." className="md:col-span-3" />
            <FormField id="blocked-city" name="city" type="text" label="City" placeholder="City" className="md:col-span-3" />
            <FormField id="blocked-state" name="state" type="text" label="State" placeholder="NJ" className="md:col-span-1" />
            <FormField id="blocked-postal-code" name="postalCode" type="text" label="ZIP code" placeholder="08879" className="md:col-span-2" />
          </div>
        </fieldset>
      </div>

      <FormField
        id="blocked-reason"
        name="reason"
        as="textarea"
        rows={3}
        label="Internal reason"
        hint="Clients will not see this note."
        className="mt-5"
        placeholder="Document why future bookings should be blocked."
      />

      {message ? (
        <FormFeedback
          tone={message.type === "error" ? "danger" : "success"}
          className="mt-4"
        >
          {message.text}
        </FormFeedback>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
        className="mt-5 w-full sm:w-auto"
      >
        {isPending ? "Adding..." : "Add to blocklist"}
      </Button>
    </form>
  );
}
