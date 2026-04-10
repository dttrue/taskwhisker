// src/app/dashboard/sitter/bookings/[id]/_components/CompleteVisitButton.jsx
"use client";

import { useTransition } from "react";
import { toast } from "react-hot-toast";
import { completeVisitAsSitter } from "@/app/dashboard/sitter/actions";

function formatTime(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CompleteVisitButton({
  visitId,
  disabled = false,
  disabledLabel = "Unavailable",
  nextVisitStartTime = null,
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!visitId || disabled) return;

    const formData = new FormData();
    formData.append("visitId", visitId);

    startTransition(async () => {
      const result = await completeVisitAsSitter(formData);

      if (result?.ok) {
        toast.success("Visit completed.");

        if (nextVisitStartTime) {
          toast(`Next visit starts at ${formatTime(nextVisitStartTime)}.`, {
            icon: "→",
          });
        }
      } else {
        toast.error(result?.error || "Could not complete visit.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      className={
        disabled || isPending
          ? "inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-400 cursor-not-allowed"
          : "inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 active:scale-[0.98]"
      }
    >
      {isPending
        ? "Completing..."
        : disabled
        ? disabledLabel
        : "Mark visit complete"}
    </button>
  );
}