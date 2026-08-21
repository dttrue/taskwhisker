"use client";

import { useState } from "react";

import {
  Button,
  Card,
  StatusBadge,
} from "@/components/ui/Foundation";
import { BUSINESS_TIME_ZONE } from "@/lib/visits/visitOperations";

import OperatorSitterRouteMap from "./OperatorSitterRouteMap";

const STATUS_PRESENTATION = {
  CURRENT: { label: "Current", tone: "success" },
  UPCOMING: { label: "Upcoming", tone: "neutral" },
  MISSED: { label: "Missed", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
  CANCELED: { label: "Canceled", tone: "danger" },
  SCHEDULED: { label: "Scheduled", tone: "neutral" },
};

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function OperatorSitterRoute({ sitterName, visits = [] }) {
  const preferredVisit =
    visits.find((visit) => visit.operationalStatus === "CURRENT") ||
    visits.find((visit) => visit.operationalStatus === "MISSED") ||
    visits.find((visit) => visit.operationalStatus === "UPCOMING") ||
    visits[0] ||
    null;
  const [selectedVisitId, setSelectedVisitId] = useState(
    preferredVisit?.id || null
  );
  const mappedVisitCount = visits.filter((visit) => visit.hasCoordinates).length;

  if (!visits.length) {
    return (
      <Card className="p-5 text-sm text-[var(--task-text-muted)]">
        No visits scheduled for this sitter today.
      </Card>
    );
  }

  return (
    <section aria-label={`${sitterName} today's route`} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--task-primary)]">
            Scheduled route
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
            {sitterName} — Today&apos;s Route
          </h2>
          <p className="mt-1 text-sm text-[var(--task-text-muted)]">
            Chronological schedule, not an optimized driving route. {mappedVisitCount} of {visits.length} stops mapped.
          </p>
        </div>
        <Button href="/dashboard/operator/operations" variant="secondary">
          All sitters
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start">
        <div className="space-y-3">
          {visits.map((visit) => {
            const presentation =
              STATUS_PRESENTATION[visit.operationalStatus] ||
              STATUS_PRESENTATION.SCHEDULED;
            const selected = selectedVisitId === visit.id;

            return (
              <Card
                as="article"
                key={visit.id}
                className={
                  selected
                    ? "border-[#8db9a6] p-4 ring-2 ring-[#c9dfd4]"
                    : "p-4"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--task-primary)]">
                      Stop {visit.stopNumber} of {visits.length}
                    </p>
                    <h3 className="mt-1 break-words text-lg font-bold text-[var(--task-text)]">
                      {visit.petDisplayName}
                    </h3>
                    {visit.showServiceContext ? (
                      <p className="mt-1 break-words text-sm text-[var(--task-text-muted)]">
                        {visit.serviceSummary}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge tone={presentation.tone}>
                    {presentation.label}
                  </StatusBadge>
                </div>

                <p className="mt-3 text-sm font-semibold text-[var(--task-text)]">
                  {formatTime(visit.startTime)}–{formatTime(visit.endTime)}
                </p>
                <p className="mt-1 break-words text-sm text-[var(--task-text-muted)]">
                  Owner: {visit.ownerName}
                </p>
                {visit.address ? (
                  <p className="mt-1 break-words text-sm leading-6 text-[var(--task-text-muted)]">
                    {visit.address}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-[var(--task-text-muted)]">
                    Address unavailable
                  </p>
                )}

                <div className="mt-4 grid gap-2 min-[390px]:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedVisitId(visit.id)}
                    className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 py-2 text-sm font-semibold text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
                  >
                    {selected ? "Selected stop" : `Focus stop ${visit.stopNumber}`}
                  </button>
                  <Button
                    href={`/dashboard/operator/bookings/${visit.bookingId}`}
                    variant="quiet"
                  >
                    View booking
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="xl:sticky xl:top-4">
          {mappedVisitCount > 0 ? (
            <OperatorSitterRouteMap
              visits={visits}
              selectedVisitId={selectedVisitId}
              onSelectVisit={setSelectedVisitId}
            />
          ) : (
            <Card className="p-6 text-sm text-[var(--task-text-muted)]">
              Route locations are unavailable for today&apos;s visits.
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
