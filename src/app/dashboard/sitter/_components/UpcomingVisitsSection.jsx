"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ParticipantVisitCard } from './ParticipantVisit';
import VisitCard from "./VisitCard";
import { Notice, SectionHeader, StatusBadge } from "@/components/ui/Foundation";

function pageHref(pathname, searchParams, page) {
  const params = new URLSearchParams(searchParams.toString());

  if (page <= 1) {
    params.delete("upcomingPage");
  } else {
    params.set("upcomingPage", String(page));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function UpcomingVisitsSection({
  visits = [],
  coverageVisits = [],
  totalCount = 0,
  page = 1,
  pageSize = 10,
  now = new Date(),
}) {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const showPagination = totalCount > pageSize;

  const count = totalCount + coverageVisits.length;
  const entries = [...visits.map(entry => ({ entry, coverage: false })), ...coverageVisits.map(entry => ({ entry, coverage: true }))].sort((a, b) => new Date(a.entry.visit.startTime) - new Date(b.entry.visit.startTime));

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Upcoming"
        meta={<StatusBadge>{count} scheduled</StatusBadge>}
        description={
          count === 0
            ? "Nothing is scheduled after today."
            : count === 1
            ? "1 upcoming visit scheduled."
            : `${count} upcoming visits scheduled.`
        }
      />

      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="upcoming-visits-content"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--task-text)] transition hover:bg-[var(--task-surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-3"
      >
        {isOpen ? "Hide upcoming" : "Show upcoming"}
      </button>

      {isOpen ? (
        <div id="upcoming-visits-content" className="space-y-4">
          {entries.length === 0 ? (
            <Notice>No upcoming visits scheduled.</Notice>
          ) : (
            <div className="grid gap-3">
              {entries.map(({ entry, coverage }) => coverage ? <ParticipantVisitCard key={entry.id} entry={entry} /> : (
                <VisitCard key={entry.id} entry={entry} now={now} />
              ))}
            </div>
          )}

          {showPagination ? (
            <nav
              aria-label="Upcoming visits pagination"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white p-3"
            >
              {page <= 1 ? (
                <span className="inline-flex min-h-11 items-center rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--task-text-muted)] opacity-60">
                  Previous
                </span>
              ) : (
                <Link
                  href={pageHref(pathname, searchParams, page - 1)}
                  className="inline-flex min-h-11 items-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
                >
                  Previous
                </Link>
              )}

              <span className="text-sm font-semibold text-[var(--task-text-muted)]">
                {coverageVisits.length > 0 ? "Lead visits · " : ""}Page {page} of {pageCount}
              </span>

              {page >= pageCount ? (
                <span className="inline-flex min-h-11 items-center rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--task-text-muted)] opacity-60">
                  Next
                </span>
              ) : (
                <Link
                  href={pageHref(pathname, searchParams, page + 1)}
                  className="inline-flex min-h-11 items-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
                >
                  Next
                </Link>
              )}
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
