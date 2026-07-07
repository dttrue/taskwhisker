// src/app/dashboard/operator/blocked-clients/BlockedClientForm.jsx
"use client";

import { useRef, useState, useTransition } from "react";
import { createBlockedClient } from "./actions";

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
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-bold text-zinc-950">Block a client</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Add enough information to prevent this person from booking again.
          Email, phone, or address with ZIP code are the strongest matches.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Name</span>
          <input
            name="name"
            type="text"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Client name"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Email</span>
          <input
            name="email"
            type="email"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="client@example.com"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Phone</span>
          <input
            name="phone"
            type="tel"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="555-555-5555"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Address line 1</span>
          <input
            name="addressLine1"
            type="text"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="123 Main St"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">Address line 2</span>
          <input
            name="addressLine2"
            type="text"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Apt, unit, etc."
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">City</span>
          <input
            name="city"
            type="text"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="City"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">State</span>
          <input
            name="state"
            type="text"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="NY"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-zinc-700">ZIP code</span>
          <input
            name="postalCode"
            type="text"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            placeholder="11215"
          />
        </label>
      </div>

      <label className="mt-3 block space-y-1 text-sm">
        <span className="font-medium text-zinc-700">Reason</span>
        <textarea
          name="reason"
          rows={3}
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Internal note only. Clients will not see this."
        />
      </label>

      {message ? (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            message.type === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-zinc-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isPending ? "Adding..." : "Add to blocklist"}
      </button>
    </form>
  );
}
