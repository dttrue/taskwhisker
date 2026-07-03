// src/app/dashboard/sitter/messages/[bookingId]/ApproveCancellationRequestButton.jsx
"use client";

import { useState, useTransition } from "react";
import { approveClientCancellationRequestAsSitter } from "./approveCancellationActions";

export default function ApproveCancellationRequestButton({ bookingId }) {
  const [isPending, startTransition] = useTransition();

  const [waiveCancellationFee, setWaiveCancellationFee] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function handleApprove() {
    setError("");
    setMessage("");

    startTransition(async () => {
      const result = await approveClientCancellationRequestAsSitter({
        bookingId,
        waiveCancellationFee,
      });

      if (!result?.ok) {
        setError(result?.error || "Unable to approve cancellation.");
        return;
      }

      setMessage(
        result.cancellationFeeWaived
          ? "Cancellation approved. Fee waived."
          : "Cancellation approved. Cancellation fee applied."
      );
    });
  }

  const buttonLabel = waiveCancellationFee
    ? "Approve cancellation and waive fee"
    : "Approve cancellation with 15% fee";

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-red-100 bg-white p-3">
        <p className="text-sm font-semibold text-zinc-950">Cancellation fee</p>

        <p className="mt-1 text-sm text-zinc-600">
          By default, a 15% cancellation fee will apply when this cancellation
          is approved.
        </p>

        <label className="mt-3 flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={waiveCancellationFee}
            onChange={(event) => setWaiveCancellationFee(event.target.checked)}
            disabled={isPending || Boolean(message)}
            className="mt-1 h-4 w-4 rounded border-zinc-300"
          />

          <span>
            <span className="block font-semibold text-zinc-900">
              Waive cancellation fee
            </span>
            <span className="mt-1 block text-xs text-zinc-500">
              Use this if the sitter/business does not want to charge the client
              for this cancellation.
            </span>
          </span>
        </label>
      </div>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      {message && (
        <p className="text-sm font-medium text-emerald-700">{message}</p>
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
          : buttonLabel}
      </button>
    </div>
  );
}
