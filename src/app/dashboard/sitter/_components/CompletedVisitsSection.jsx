"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Notice, SectionHeader, StatusBadge } from "@/components/ui/Foundation";
import VisitCard from "./VisitCard";

function pageHref(pathname, searchParams, page) {
  const params = new URLSearchParams(searchParams.toString());

  if (page <= 1) {
    params.delete("completedPage");
  } else {
    params.set("completedPage", String(page));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function CompletedVisitsSection({
  visits = [],
  totalCount = 0,
  page = 1,
  pageSize = 10,
  now = new Date(),
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const showPagination = totalCount > pageSize;

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Completed"
        description="Finished visits."
        meta={<StatusBadge tone="neutral">{totalCount}</StatusBadge>}
      />

      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="completed-visits-content"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--task-text)] transition hover:bg-[var(--task-surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-3"
      >
        {isOpen ? "Hide completed" : "Show completed"}
      </button>

      {isOpen ? (
        <div id="completed-visits-content" className="space-y-4">
          {visits.length === 0 ? (
            <Notice>No completed visits found.</Notice>
          ) : (
            <div className="grid gap-3">
              {visits.map((entry) => (
                <VisitCard key={entry.id} entry={entry} now={now} />
              ))}
            </div>
          )}

          {showPagination ? (
            <nav
              aria-label="Completed visits pagination"
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
                Page {page} of {pageCount}
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
