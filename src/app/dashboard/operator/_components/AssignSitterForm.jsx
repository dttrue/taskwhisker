// src/app/dashboard/operator/_components/AssignSitterForm.jsx
"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import toast from "react-hot-toast";
import { assignSitter } from "@/app/dashboard/operator/bookings/actions";

const initialState = { ok: null, error: null };

export default function AssignSitterForm({
  bookingId,
  currentSitterId,
  sitters,
  bookingStatus,
}) {
  const [state, formAction] = useActionState(assignSitter, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Sitter assignment saved.");
    } else if (state.error) {
      toast.error(state.error || "Could not update sitter assignment.");
    }
  }, [state]);

  const disabled = bookingStatus === "COMPLETED";

  return (
    <form action={formAction} className="mt-2 flex items-center gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />

      <select
        name="sitterId"
        defaultValue={currentSitterId || ""}
        disabled={disabled}
        className="text-xs rounded-md border border-zinc-200 bg-white px-2 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">Unassigned</option>
        {sitters.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || s.email}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={disabled}
        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Save
      </button>
    </form>
  );
}
