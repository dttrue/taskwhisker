// src/app/dashboard/operator/CreateTestBookingButton.jsx
"use client";

import { useTransition } from "react";
import { createTestBooking } from "./actions";

export default function CreateTestBookingButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await createTestBooking();
        })
      }
    >
      {pending ? "Creating..." : "Create test booking"}
    </button>
  );
}
