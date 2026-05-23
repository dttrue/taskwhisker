// src/app/dashboard/sitter/messages/[bookingId]/SitterMessageForm.jsx
"use client";

import { useRef, useTransition } from "react";
import { sendSitterBookingMessage } from "../actions";

export default function SitterMessageForm({ bookingId }) {
  const formRef = useRef(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData) {
    startTransition(async () => {
      await sendSitterBookingMessage(formData);
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
    >
      <input type="hidden" name="bookingId" value={bookingId} />

      <label
        htmlFor="sitter-message-body"
        className="mb-2 block text-sm font-medium text-zinc-700"
      >
        New message
      </label>

      <textarea
        id="sitter-message-body"
        name="body"
        rows={3}
        placeholder="Write a message..."
        className="w-full resize-none rounded-xl border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        required
      />

      <div className="mt-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-black px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-400 disabled:text-zinc-100"
        >
          {isPending ? "Sending..." : "Send message"}
        </button>
      </div>
    </form>
  );
}
