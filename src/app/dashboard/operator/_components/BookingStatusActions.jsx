// src/app/dashboard/operator/_components/BookingStatusActions.jsx
"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import toast from "react-hot-toast";
import {
  confirmBooking,
  completeBooking,
} from "@/app/dashboard/operator/bookings/actions";

const initialState = { ok: null, error: null };

export function ConfirmBookingForm({ bookingId, canConfirm }) {
  const [state, formAction] = useActionState(confirmBooking, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Booking confirmed.");
    } else if (state.error) {
      toast.error(state.error || "Could not confirm booking.");
    }
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <button
        type="submit"
        disabled={!canConfirm}
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
          canConfirm
            ? "border border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
            : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
        }`}
      >
        Confirm
      </button>
    </form>
  );
}

export function CompleteBookingForm({ bookingId, canComplete }) {
  const [state, formAction] = useActionState(completeBooking, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Booking marked as completed.");
    } else if (state.error) {
      toast.error(state.error || "Could not complete booking.");
    }
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <button
        type="submit"
        disabled={!canComplete}
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
          canComplete
            ? "border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
            : "border border-zinc-200 text-zinc-400 cursor-not-allowed"
        }`}
      >
        Complete
      </button>
    </form>
  );
}
