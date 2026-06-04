// src/app/client/bookings/[clientLinkToken]/CancelBookingRequestForm.jsx
"use client";

import { useRef, useState, useTransition } from "react";
import { requestClientBookingCancellation } from "./actions";

export default function CancelBookingRequestForm({
  clientLinkToken,
  disabled = false,
}) {
  const formRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData) {
    setMessage("");
    setError("");

    startTransition(async () => {
      const result = await requestClientBookingCancellation(formData);

      if (!result?.ok) {
        setError(result?.error || "Something went wrong.");
        return;
      }

      formRef.current?.reset();
      setMessage(
        "Cancellation request sent. Your sitter/operator will review it."
      );
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4"
    >
      <input type="hidden" name="clientLinkToken" value={clientLinkToken} />

      <h3 className="text-sm font-bold text-red-950">Request cancellation</h3>

      <p className="mt-1 text-sm text-red-800">
        This will not cancel your booking immediately. It sends a request for
        review.
      </p>

      <label
        htmlFor="cancel-reason"
        className="mt-3 block text-sm font-semibold text-red-950"
      >
        Reason
      </label>

      <textarea
        id="cancel-reason"
        name="reason"
        rows={3}
        required
        disabled={disabled || isPending}
        placeholder="Tell us why you need to cancel..."
        className="mt-2 w-full resize-none rounded-xl border border-red-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      />

      {error && (
        <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {message && (
        <p className="mt-2 text-sm font-medium text-emerald-700">{message}</p>
      )}

      <button
        type="submit"
        disabled={disabled || isPending}
        className="mt-3 w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Sending request..." : "Send cancellation request"}
      </button>
    </form>
  );
}
