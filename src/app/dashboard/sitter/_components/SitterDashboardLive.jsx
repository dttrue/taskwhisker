// src/app/dashboard/sitter/_components/SitterDashboardLive.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import StatCard from "./StatCard";
import VisitHistorySection from "./VisitHistorySection";
import UpcomingVisitsSection from "./UpcomingVisitsSection";
import SitterRoutePanel from "./SitterRoutePanel";
import TodayVisitsSection from "./TodayVisitsSection";
import ShiftStatusCard from "./ShiftStatusCard";
import { Notice, PageHeader, PageShell } from "@/components/ui/Foundation";
import {
  formatMoney,
  formatDateTime,
  groupBookings,
  getRemainingVisitCountForToday,
  getRemainingPayoutForToday,
  getCompletedThisWeekCount,
  getSitterMapBookings,
  getRemainingMapStops,
  getCurrentMapStop,
  getNextMapStop,
  getLastGraceStop,
  getRemainingTodayVisitEntries,
  getUpcomingVisitEntries,
  getCompletedVisitEntries,
  getCanceledVisitEntries,
  serializeVisitEntry,
  getOverdueVisitEntries,
} from "../lib/sitterDashboardUtils";

export default function SitterDashboardLive({ bookings = [] }) {
  const [now, setNow] = useState(() => new Date());
  const [localBookings, setLocalBookings] = useState(bookings);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const routePanelRef = useRef(null);
  
  

  useEffect(() => {
    setLocalBookings(bookings);
  }, [bookings]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(new Date());
    }, 30000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setNow(new Date());
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function handleVisitCompleted(visitId) {
    const timestamp = new Date().toISOString();

    setLocalBookings((prev) =>
      prev.map((booking) => {
        const updatedVisits = (booking.visits || []).map((visit) =>
          visit.id === visitId
            ? {
                ...visit,
                status: "COMPLETED",
                completedAt: timestamp,
                updatedAt: timestamp,
              }
            : visit
        );

        const hasRemainingVisits = updatedVisits.some(
          (visit) => visit.status !== "COMPLETED" && visit.status !== "CANCELED"
        );

        return {
          ...booking,
          visits: updatedVisits,
          status: hasRemainingVisits ? booking.status : "COMPLETED",
          completedAt: hasRemainingVisits ? booking.completedAt : timestamp,
          updatedAt: timestamp,
        };
      })
    );
  }

  const derived = useMemo(() => {
    const { today } = groupBookings(localBookings, now);
    const overdueVisitEntries = getOverdueVisitEntries(localBookings, now).map(
      (entry) => serializeVisitEntry(entry)
    );
    
    const overdueVisitCount = overdueVisitEntries.length;
    const hasBlockingMissedVisits = overdueVisitCount > 0;

    const todayVisitEntries = getRemainingTodayVisitEntries(
      localBookings,
      now
    ).map((entry) => serializeVisitEntry(entry));

    const upcomingVisitEntries = getUpcomingVisitEntries(
      localBookings,
      now
    ).map((entry) => serializeVisitEntry(entry));

    const completedVisitEntries = getCompletedVisitEntries(localBookings).map(
      (entry) => serializeVisitEntry(entry)
    );

    const canceledVisitEntries = getCanceledVisitEntries(localBookings).map(
      (entry) => serializeVisitEntry(entry)
    );

    const completedVisitCount = completedVisitEntries.length;
    const canceledVisitCount = canceledVisitEntries.length;

    const sitterMapBookings = getSitterMapBookings(today, now);
    const remainingSitterMapBookings = getRemainingMapStops(
      sitterMapBookings,
      now
    );
    const currentStop = getCurrentMapStop(remainingSitterMapBookings, now);
    const nextStop = getNextMapStop(remainingSitterMapBookings, now);
    const lastGraceStop = getLastGraceStop(remainingSitterMapBookings, now);
    const hasActiveRoute = remainingSitterMapBookings.length > 0;

    const defaultBooking =
      remainingSitterMapBookings.find((b) => b.id === currentStop?.id) ??
      remainingSitterMapBookings.find((b) => b.id === nextStop?.id) ??
      remainingSitterMapBookings[0] ??
      null;

    const safeLastGraceStop =
      remainingSitterMapBookings.find((b) => b.id === lastGraceStop?.id) ??
      null;

    const todayVisitCount = getRemainingVisitCountForToday(localBookings, now);
    const remainingTodayPayout = getRemainingPayoutForToday(localBookings, now);
    const completedThisWeek = getCompletedThisWeekCount(localBookings, now);
    
    const earnedToday = completedVisitEntries.reduce(
      (sum, v) => sum + (v.sitterPayoutCents || 0),
      0
    );

    const totalTodayPayout = remainingTodayPayout + earnedToday;

    const nextUpcomingVisit =
      localBookings
        .flatMap((b) => b.visits || [])
        .filter((v) => {
          if (v.status === "COMPLETED" || v.status === "CANCELED") return false;
          return new Date(v.startTime) > now;
        })
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0] ||
      null;

    const nextUpcomingBooking = nextUpcomingVisit
      ? localBookings.find((b) =>
          b.visits?.some((v) => v.id === nextUpcomingVisit.id)
        )
      : null;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowCount = localBookings.reduce((count, booking) => {
      const visits =
        booking.visits?.filter((visit) => {
          if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
            return false;
          }

          const start = new Date(visit.startTime);
          if (Number.isNaN(start.getTime())) return false;

          return start.toDateString() === tomorrow.toDateString();
        }) || [];

      return count + visits.length;
    }, 0);

    return {
      todayVisitEntries,
      upcomingVisitEntries,
      completedVisitEntries,
      canceledVisitEntries,
      completedVisitCount,
      canceledVisitCount,
      sitterMapBookings,
      remainingSitterMapBookings,
      currentStop,
      nextStop,
      lastGraceStop,
      hasActiveRoute,
      defaultBooking,
      safeLastGraceStop,
      todayVisitCount,
      remainingTodayPayout,
      completedThisWeek,
      nextUpcomingVisit,
      nextUpcomingBooking,
      tomorrowCount,
      earnedToday,
      totalTodayPayout,
      overdueVisitEntries,
      overdueVisitCount,
      hasBlockingMissedVisits,
    };
  }, [localBookings, now]);

  useEffect(() => {
    const stops = derived.remainingSitterMapBookings;

    if (!stops.length) {
      setSelectedBookingId(null);
      return;
    }

    const selectedStillExists = selectedBookingId
      ? stops.some((stop) => stop.id === selectedBookingId)
      : false;

    if (selectedStillExists) return;

    const defaultStop =
      getCurrentMapStop(stops, now) || getNextMapStop(stops, now) || stops[0];
    setSelectedBookingId(defaultStop?.id ?? null);
  }, [derived.remainingSitterMapBookings, selectedBookingId, now]);

  

  return (
    <PageShell className="pb-8 sm:pb-10" containerClassName="max-w-6xl">
      <div className="space-y-8">
        <PageHeader
          eyebrow="Sitter workspace"
          title="Your day at a glance"
          description="Track today’s route, upcoming visits, and completed care in one place."
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            title="Remaining stops today"
            value={derived.todayVisitCount}
            helper="Stops still active today"
          />
          <StatCard
            title={derived.currentStop ? "Current stop" : "Next stop"}
            value={
              derived.currentStop?.clientName ||
              derived.nextStop?.clientName ||
              "None"
            }
            helper={
              derived.currentStop?.todayVisitEnd
                ? `In progress until ${formatDateTime(
                    derived.currentStop.todayVisitEnd
                  )}`
                : derived.nextStop?.todayVisitStart
                ? `Scheduled for ${formatDateTime(
                    derived.nextStop.todayVisitStart
                  )}`
                : "No active stop right now"
            }
          />
          <StatCard
            title="Tomorrow’s visits"
            value={derived.tomorrowCount}
            helper="Visits scheduled tomorrow"
          />
          <StatCard
            title="Estimated remaining payout"
            value={formatMoney(derived.remainingTodayPayout)}
            helper="Estimated from remaining stops today"
          />
          <div className="col-span-2 lg:col-span-4">
            <ShiftStatusCard
              overdueVisitCount={derived.overdueVisitCount}
              todayVisitCount={derived.todayVisitCount}
              currentStop={derived.currentStop}
              nextStop={derived.nextStop}
            />
          </div>
        </div>

        {derived.hasBlockingMissedVisits ? (
          <Notice tone="warning" role="status" title="Route paused">
            Complete missed visits to continue through the rest of your route.
          </Notice>
        ) : derived.hasActiveRoute ? (
          <div ref={routePanelRef}>
            <SitterRoutePanel
              bookings={derived.remainingSitterMapBookings}
              defaultBooking={derived.defaultBooking}
              lastGraceStop={derived.safeLastGraceStop}
              selectedBookingId={selectedBookingId}
              onSelectBooking={setSelectedBookingId}
            />
          </div>
        ) : null}

        {derived.overdueVisitCount > 0 ? (
          <VisitHistorySection
            title="Missed Visits"
            description={`Visits that ended before being completed (${derived.overdueVisitCount}).`}
            visits={derived.overdueVisitEntries}
            now={now}
            emptyMessage="No missed visits."
            onCompleteVisit={handleVisitCompleted}
          />
        ) : null}

        <TodayVisitsSection
          visits={derived.todayVisitEntries}
          now={now}
          onCompleteVisit={handleVisitCompleted}
        />

        <UpcomingVisitsSection
          visits={derived.upcomingVisitEntries}
          now={now}
        />

        {derived.completedVisitCount > 0 ? (
          <VisitHistorySection
            title="Completed"
            description={`Finished visits (${derived.completedVisitCount}).`}
            visits={derived.completedVisitEntries}
            now={now}
          />
        ) : null}

        {derived.canceledVisitCount > 0 ? (
          <VisitHistorySection
            title="Canceled"
            description={`Canceled visits (${derived.canceledVisitCount}).`}
            visits={derived.canceledVisitEntries}
            now={now}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
