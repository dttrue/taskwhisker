// src/app/dashboard/sitter/_components/VisitCard.jsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { FormFeedback, StatusBadge } from "@/components/ui/Foundation";

import { completeVisitAsSitter } from "../actions";
import {
  canCompleteVisit,
  formatMoney,
  formatTime,
  isSameDay,
  getRelativeDayLabel,
  isVisitOverdue,
} from "../lib/sitterDashboardUtils";

function formatVisitDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getVisitState(visit, now, isToday) {
  const start = new Date(visit.startTime);

  if (visit.status === "COMPLETED") {
    return {
      label: "Done",
      badgeTone: "info",
      cardClass: "border-[var(--task-border)] bg-white opacity-80",
      helperText: "This visit has already been completed.",
      actionLabel: "Visit completed",
    };
  }

  if (visit.status === "CANCELED") {
    return {
      label: "Canceled",
      badgeTone: "danger",
      cardClass: "border-[var(--task-border)] bg-white opacity-80",
      helperText: "This visit was canceled.",
      actionLabel: "Visit canceled",
    };
  }

  if (isVisitOverdue(visit, now)) {
    return {
      label: "Missed",
      badgeTone: "warning",
      cardClass: "border-[#dfbd77] bg-white",
      helperText: "This visit ended before it was marked complete.",
      actionLabel: "Complete missed visit",
    };
  }

  if (canCompleteVisit(visit, now)) {
    return {
      label: "Ready now",
      badgeTone: "success",
      cardClass: "border-[#b8d3c7] bg-white",
      helperText: "You can complete this visit now.",
      actionLabel: "Mark visit complete",
    };
  }

  if (start.getTime() > now.getTime()) {
    return {
      label: "Scheduled",
      badgeTone: "neutral",
      cardClass: "border-[var(--task-border)] bg-white",
      helperText: isToday ? `Available at ${formatTime(start)}.` : "Scheduled.",
      actionLabel: isToday ? `Available at ${formatTime(start)}` : "Scheduled",
    };
  }

  return {
    label: "Unavailable",
    badgeTone: "warning",
    cardClass: "border-[var(--task-border)] bg-white",
    helperText: "This visit cannot be completed right now.",
    actionLabel: "Unavailable",
  };
}

export default function VisitCard({ entry, now = new Date(), onComplete }) {
  const [actionError, setActionError] = useState("");
  const {
    visit,
    bookingId,
    clientName,
    serviceSummary,
    payoutPerVisitCents,
    address,
    hasOpenCancellationRequest = false,
  } = entry;

  const start = new Date(visit.startTime);
  const end = new Date(visit.endTime);

  const isToday = isSameDay(start, now);
  const isCompletable = canCompleteVisit(visit, now);
  const state = getVisitState(visit, now, isToday);
  const dayLabel = getRelativeDayLabel(start, now);
  const dateLabel = formatVisitDate(start);

  return (
    <article
      className={`rounded-[var(--task-radius-card)] border p-4 shadow-[var(--task-shadow-card)] transition sm:p-5 ${state.cardClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-base font-bold text-[var(--task-text)]">{clientName}</p>

            <StatusBadge tone={state.badgeTone}>
              {state.label}
            </StatusBadge>

            {hasOpenCancellationRequest && visit.status !== "CANCELED" ? (
              <StatusBadge tone="danger">
                Cancellation requested
              </StatusBadge>
            ) : null}
          </div>

          <p className="mt-1 break-words text-sm leading-5 text-[var(--task-text-muted)]">{serviceSummary}</p>
        </div>

        <span className="shrink-0 rounded-full border border-[#c9dfd4] bg-[var(--task-success-soft)] px-2.5 py-1 text-sm font-semibold text-[#285844]">
          {formatMoney(payoutPerVisitCents)}
        </span>
      </div>

      {hasOpenCancellationRequest && visit.status !== "CANCELED" ? (
        <div className="mt-4 rounded-[var(--task-radius-control)] border border-[#e8c8c3] bg-[var(--task-danger-soft)] p-4 text-sm leading-6 text-[#86382f]">
          <p className="font-bold">Cancellation requested</p>
          <p className="mt-1">
            The client requested to cancel this booking. Open messages to review
            and approve the cancellation.
          </p>
        </div>
      ) : null}

      <div className="mt-4 space-y-1.5 text-sm leading-6 text-[var(--task-text-muted)]">
        <p className="font-semibold text-[var(--task-text)]">
          {dayLabel ? `${dayLabel} · ` : ""}
          {dateLabel}
        </p>

        <p className="font-medium text-[var(--task-text)]">
          {formatTime(start)} – {formatTime(end)}
        </p>

        {address ? <p className="break-words">{address}</p> : null}
      </div>

      <p className="mt-3 text-sm leading-5 text-[var(--task-text-muted)]">{state.helperText}</p>

      <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
        <Link
          href={`/dashboard/sitter/bookings/${bookingId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 py-2 text-sm font-semibold text-[var(--task-text)] transition hover:bg-[var(--task-surface-soft)]"
        >
          View booking
        </Link>

        <Link
          href={`/dashboard/sitter/messages/${bookingId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] px-3 py-2 text-sm font-bold transition"
          style={
            hasOpenCancellationRequest && visit.status !== "CANCELED"
              ? {
                  backgroundColor: "var(--task-danger)",
                  color: "white",
                  border: "1px solid var(--task-danger)",
                }
              : {
                  backgroundColor: "white",
                  color: "var(--task-text)",
                  border: "1px solid var(--task-border-strong)",
                }
          }
        >
          {hasOpenCancellationRequest && visit.status !== "CANCELED"
            ? "Review cancellation"
            : "Message client"}
        </Link>

        {isCompletable ? (
          <form
            action={async (formData) => {
              setActionError("");
              const result = await completeVisitAsSitter(formData);

              if (result?.ok) {
                onComplete?.(visit.id);
              } else if (result?.error) {
                setActionError(result.error);
              }
            }}
            className="flex min-w-0 flex-col gap-2 sm:min-w-64"
          >
            <input type="hidden" name="visitId" value={visit.id} />

            {isVisitOverdue(visit, now) ? (
              <div>
                <label htmlFor={`late-reason-${visit.id}`} className="block text-sm font-semibold text-[var(--task-text)]">
                  Late completion reason
                </label>
                <textarea
                  id={`late-reason-${visit.id}`}
                  name="lateReason"
                  required
                  minLength={10}
                  aria-describedby={`late-reason-${visit.id}-hint`}
                  placeholder="Explain why this visit is being completed late..."
                  className="mt-2 min-h-24 w-full rounded-[var(--task-radius-control)] border border-[#dfbd77] bg-white px-3 py-2.5 text-sm text-[var(--task-text)] placeholder:text-[#858b84]"
                />
              </div>
            ) : null}

            {isVisitOverdue(visit, now) ? (
              <p id={`late-reason-${visit.id}-hint`} className="text-sm leading-5 text-[#704c16]">
                Required for missed visits. This will be visible to the
                operator.
              </p>
            ) : null}

            {actionError ? <FormFeedback>{actionError}</FormFeedback> : null}

            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] bg-[var(--task-primary)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--task-primary-hover)]"
            >
              {state.actionLabel}
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--task-text-muted)]"
          >
            {state.actionLabel}
          </button>
        )}
      </div>
    </article>
  );
}
