// src/app/client/bookings/[clientLinkToken]/ScheduleChangeRequestForm.jsx
"use client";

import { useRef, useState, useTransition } from "react";
import { requestClientScheduleChange } from "./actions";

function formatVisitOption(visit) {
  if (!visit?.startTime || !visit?.endTime) return "Visit";

  const start = new Date(visit.startTime);
  const end = new Date(visit.endTime);

  const dateLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const startLabel = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const endLabel = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dateLabel}, ${startLabel}–${endLabel}`;
}

export default function ScheduleChangeRequestForm({
  clientLinkToken,
  visits = [],
  disabled = false,
}) {
  const formRef = useRef(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeVisits = visits.filter(
    (visit) => visit.status !== "CANCELED" && visit.status !== "COMPLETED"
  );

  const isDisabled =
    disabled || isPending || submitted || activeVisits.length === 0;

  function handleSubmit(formData) {
    setMessage("");
    setError("");

    startTransition(async () => {
      const result = await requestClientScheduleChange(formData);

      if (!result?.ok) {
        setSubmitted(false);
        setError(result?.error || "Something went wrong.");
        return;
      }

      formRef.current?.reset();
      setSubmitted(true);
      setMessage(
        "Schedule change request sent. Your sitter/operator will review it."
      );
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4"
    >
      <input type="hidden" name="clientLinkToken" value={clientLinkToken} />

      <h3 className="text-sm font-bold text-blue-950">
        Request schedule change
      </h3>

      <p className="mt-1 text-sm text-blue-800">
        This will not change your booking immediately. It sends a request for
        review.
      </p>

      <label className="mt-3 block text-sm font-semibold text-blue-950">
        Which visit do you want to change?
        <select
          name="visitId"
          required
          disabled={isDisabled}
          className="mt-2 w-full rounded-xl border border-blue-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">Select a visit</option>
          {activeVisits.map((visit) => (
            <option key={visit.id} value={visit.id}>
              {formatVisitOption(visit)}
            </option>
          ))}
        </select>
      </label>

      {activeVisits.length === 0 ? (
        <p className="mt-2 text-sm font-medium text-red-700">
          There are no active visits available to reschedule.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-semibold text-blue-950">
          New date
          <input
            name="requestedDate"
            type="date"
            required
            disabled={isDisabled}
            className="mt-2 w-full rounded-xl border border-blue-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="block text-sm font-semibold text-blue-950">
          Start time
          <input
            name="requestedStartTime"
            type="time"
            required
            disabled={isDisabled}
            className="mt-2 w-full rounded-xl border border-blue-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="block text-sm font-semibold text-blue-950">
          End time
          <input
            name="requestedEndTime"
            type="time"
            required
            disabled={isDisabled}
            className="mt-2 w-full rounded-xl border border-blue-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>

      <label
        htmlFor="schedule-change-reason"
        className="mt-3 block text-sm font-semibold text-blue-950"
      >
        Reason
      </label>

      <textarea
        id="schedule-change-reason"
        name="reason"
        rows={3}
        required
        disabled={isDisabled}
        placeholder="Tell us what needs to change..."
        className="mt-2 w-full resize-none rounded-xl border border-blue-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
      />

      {error ? (
        <p className="mt-2 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      {message ? (
        <p className="mt-2 text-sm font-medium text-emerald-700">{message}</p>
      ) : null}

      <button
        type="submit"
        disabled={isDisabled}
        className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitted
          ? "Schedule change request sent"
          : isPending
          ? "Sending request..."
          : "Send schedule change request"}
      </button>
    </form>
  );
}
