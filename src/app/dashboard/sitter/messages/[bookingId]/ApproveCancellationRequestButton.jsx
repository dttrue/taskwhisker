// src/app/dashboard/sitter/messages/[bookingId]/ApproveCancellationRequestButton.jsx
"use client";

import { useState, useTransition } from "react";
import { approveClientCancellationRequestAsSitter } from "./approveCancellationActions";

export default function ApproveCancellationRequestButton({ bookingId }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function handleApprove() {
    setError("");
    setMessage("");

    startTransition(async () => {
      const result = await approveClientCancellationRequestAsSitter({
        bookingId,
      });

      if (!result?.ok) {
        setError(result?.error || "Unable to approve cancellation.");
        return;
      }

      setMessage("Cancellation approved.");
    });
  }

  return (
    <div className="mt-4">
      {error && (
        <p className="mb-2 text-sm font-medium text-red-700">{error}</p>
      )}

      {message && (
        <p className="mb-2 text-sm font-medium text-emerald-700">{message}</p>
      )}

      <button
        type="button"
        onClick={handleApprove}
        disabled={isPending || Boolean(message)}
        className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending
          ? "Approving cancellation..."
          : message
          ? "Cancellation approved"
          : "Approve cancellation"}
      </button>
    </div>
  );
}
