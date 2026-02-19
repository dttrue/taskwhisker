"use client";

import { useActionState, useState } from "react";

export default function CancelBookingForm({
  bookingId,
  status,
  canCancel,
  cancelBooking,
  // detail page can flip this on if you want REQUESTED to also require a reason
  requireReasonForRequested = false,
}) {
  const [reason, setReason] = useState("");
  const [otherText, setOtherText] = useState("");
  const [state, formAction] = useActionState(cancelBooking, null);

  const isOther = reason === "OTHER";

  // Business rule: CONFIRMED always needs a reason.
  // Optionally also require for REQUESTED when flag is true.
  const requiresReason =
    status === "CONFIRMED" ||
    (requireReasonForRequested && status === "REQUESTED");

  const missingReason =
    requiresReason && (!reason || (isOther && !otherText.trim()));

  const disableSubmit = !canCancel || missingReason;

  return (
    <div className="flex flex-col items-end">
      <form action={formAction} className="flex items-center">
        <input type="hidden" name="bookingId" value={bookingId} />

        <select
          name="cancelReason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="text-[11px] rounded-md border border-zinc-200 bg-white px-2 py-1 mr-2"
          disabled={!canCancel}
        >
          <option value="">Reason…</option>
          <option value="Client requested">Client requested</option>
          <option value="No availability">No availability</option>
          <option value="Weather">Weather</option>
          <option value="OTHER">Other</option>
        </select>

        <input
          name="cancelReasonOther"
          placeholder="Other…"
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          className={`text-[11px] rounded-md border border-zinc-200 bg-white px-2 py-1 mr-2 w-28 ${
            isOther ? "inline-block" : "hidden sm:inline-block"
          }`}
          disabled={!canCancel || !isOther}
        />

        <button
          type="submit"
          disabled={disableSubmit}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
            !disableSubmit
              ? "border border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
              : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
          }`}
        >
          Cancel
        </button>
      </form>

      {state?.error ? (
        <div className="text-xs text-red-600 mt-1">{state.error}</div>
      ) : null}
    </div>
  );
}
