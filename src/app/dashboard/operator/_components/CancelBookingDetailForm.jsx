// src/app/dashboard/operator/_components/CancelBookingDetailForm.jsx

"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import toast from "react-hot-toast";

const initialState = { ok: null, error: null };

export default function CancelBookingDetailForm({
  bookingId,
  canCancel,
  cancelBooking,
}) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");

  const [state, formAction] = useActionState(cancelBooking, initialState);

  const isOther = reason === "OTHER";

  // Detail page: require a reason for both REQUESTED and CONFIRMED
  const missingReason = !reason || (isOther && !other.trim());
  const disableSubmit = !canCancel || missingReason;

  useEffect(() => {
    if (!state) return;

    if (state.ok) {
      toast.success("Booking canceled.");
    } else if (state.error) {
      toast.error(state.error || "Could not cancel booking.");
    }
  }, [state]);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />

        <select
          name="cancelReason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="text-[11px] rounded-md border border-zinc-200 bg-white px-2 py-1"
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
          value={other}
          onChange={(e) => setOther(e.target.value)}
          className={`text-[11px] rounded-md border border-zinc-200 bg-white px-2 py-1 w-32 ${
            isOther ? "inline-block" : "hidden sm:inline-block"
          }`}
          disabled={!canCancel || !isOther}
        />

        <button
          type="submit"
          disabled={disableSubmit}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
            disableSubmit
              ? "border border-zinc-200 text-zinc-400 cursor-not-allowed"
              : "border border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
          }`}
        >
          Cancel
        </button>
      </form>

      {state?.error ? (
        <div className="text-xs text-red-600">{state.error}</div>
      ) : null}
    </div>
  );
}
