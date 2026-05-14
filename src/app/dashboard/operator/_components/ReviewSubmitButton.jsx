// src/app/dashboard/operator/_components/ReviewSubmitButton.jsx
"use client";

import { useFormStatus } from "react-dom";

export default function ReviewSubmitButton({
  children,
  pendingText = "Saving...",
  className = "",
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} ${pending ? "cursor-wait opacity-60" : ""}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
