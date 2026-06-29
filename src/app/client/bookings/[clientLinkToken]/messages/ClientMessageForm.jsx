// src/app/client/bookings/[clientLinkToken]/messages/ClientMessageForm.jsx
"use client";

import { useRef, useState, useTransition } from "react";
import { sendClientBookingMessage } from "./actions";

export default function ClientMessageForm({ clientLinkToken }) {
  const formRef = useRef(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(formData) {
    setError("");
    setMessage("");

    startTransition(async () => {
      const result = await sendClientBookingMessage(formData);

      if (!result?.ok) {
        setError(result?.error || "Unable to send message.");
        return;
      }

      formRef.current?.reset();
      setMessage("Message sent.");
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
    >
      <input type="hidden" name="clientLinkToken" value={clientLinkToken} />

      <label
        htmlFor="client-message-body"
        className="mb-2 block text-sm font-medium text-zinc-700"
      >
        New message
      </label>

      <textarea
        id="client-message-body"
        name="body"
        rows={3}
        placeholder="Write a message..."
        className="w-full resize-none rounded-xl border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        required
      />

      {error && (
        <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {message && (
        <p className="mt-2 text-sm font-medium text-emerald-700">{message}</p>
      )}

      <div className="mt-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-black px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-400 disabled:text-zinc-100"
        >
          {isPending ? "Sending..." : "Send message"}
        </button>
      </div>
    </form>
  );
}
