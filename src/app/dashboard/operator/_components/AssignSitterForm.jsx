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
  visitSummary,
  canAssignToMe = false,
}) {
  const [state, formAction, pending] = useActionState(
    assignSitter,
    initialState
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Sitter assignment saved.");
    } else if (state?.error) {
      toast.error(state.error || "Could not update sitter assignment.");
    }
  }, [state]);

  const disabled = bookingStatus === "COMPLETED" || pending;

  return (
    <div className="mt-2 space-y-2">
      {visitSummary ? (
        <p className="text-[11px] text-zinc-500">
          Assign sitter for {visitSummary}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />

        <select
          name="sitterId"
          defaultValue={currentSitterId || ""}
          disabled={disabled}
          className="min-w-[220px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {sitters.map((s) => (
            <option key={s.id} value={s.id} disabled={s.hasConflict}>
              {s.name || s.email}
              {s.hasConflict
                ? " • Conflict"
                : s.visitCountToday
                ? ` • ${s.visitCountToday} today`
                : ""}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={disabled}
          className="rounded-md border border-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>

        {canAssignToMe ? (
          <button
            type="submit"
            name="assignToMe"
            value="true"
            disabled={disabled}
            className="rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving..." : "Assign to me"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
