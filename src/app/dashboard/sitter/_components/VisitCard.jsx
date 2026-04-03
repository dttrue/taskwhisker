// src/app/dashboard/sitter/_components/VisitCard.jsx
"use client";

import Link from "next/link";
import { completeVisitAsSitter } from "../actions";
import {
  canCompleteVisit,
  formatMoney,
  formatTime,
} from "../lib/sitterDashboardUtils";

function getVisitState(visit, now) {
  const start = new Date(visit.startTime);

  if (visit.status === "COMPLETED") {
    return {
      label: "Done",
      badgeClass: "bg-blue-50 text-blue-700",
      cardClass: "border-zinc-200 bg-white opacity-80",
      helperText: "This visit has already been completed.",
    };
  }

  if (visit.status === "CANCELED") {
    return {
      label: "Canceled",
      badgeClass: "bg-rose-50 text-rose-700",
      cardClass: "border-zinc-200 bg-white opacity-80",
      helperText: "This visit was canceled.",
    };
  }

  if (canCompleteVisit(visit, now)) {
    return {
      label: "Ready now",
      badgeClass: "bg-emerald-100 text-emerald-800",
      cardClass: "border-emerald-200 bg-emerald-50/40",
      helperText: "You can complete this visit now.",
    };
  }

  if (start.getTime() > now.getTime()) {
    return {
      label: "Scheduled",
      badgeClass: "bg-zinc-100 text-zinc-700",
      cardClass: "border-zinc-200 bg-white",
      helperText: `Available at ${formatTime(start)}.`,
    };
  }

  return {
    label: "Unavailable",
    badgeClass: "bg-amber-50 text-amber-700",
    cardClass: "border-zinc-200 bg-white",
    helperText: "This visit cannot be completed right now.",
  };
}

export default function VisitCard({ entry, now = new Date() }) {
  const {
    visit,
    bookingId,
    clientName,
    serviceSummary,
    payoutPerVisitCents,
    address,
  } = entry;

  const start = new Date(visit.startTime);
  const end = new Date(visit.endTime);

  const isCompletable = canCompleteVisit(visit, now);
  const state = getVisitState(visit, now);

  return (
    <article
      className={`rounded-xl border p-4 shadow-sm transition ${state.cardClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900">{clientName}</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.badgeClass}`}
            >
              {state.label}
            </span>
          </div>

          <p className="mt-1 text-sm text-zinc-600">{serviceSummary}</p>
        </div>

        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          {formatMoney(payoutPerVisitCents)}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-sm text-zinc-600">
        <p className="font-medium text-zinc-800">
          {formatTime(start)}–{formatTime(end)}
        </p>
        {address ? <p>{address}</p> : null}
      </div>

      <p className="mt-3 text-xs text-zinc-500">{state.helperText}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/dashboard/sitter/bookings/${bookingId}`}
          className="inline-flex items-center rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          View booking
        </Link>

        {isCompletable ? (
          <form action={completeVisitAsSitter}>
            <input type="hidden" name="visitId" value={visit.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Mark visit complete
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-400"
          >
            {visit.status === "COMPLETED"
              ? "Visit completed"
              : visit.status === "CANCELED"
              ? "Visit canceled"
              : `Available at ${formatTime(start)}`}
          </button>
        )}
      </div>
    </article>
  );
}
