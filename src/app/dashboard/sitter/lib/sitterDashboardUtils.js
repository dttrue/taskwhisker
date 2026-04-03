// src/app/dashboard/sitter/lib/sitterDashboardUtils.js

export function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

const BUSINESS_TZ = "America/New_York";

function toBusinessDayKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isSameDay(a, b) {
  return toBusinessDayKey(a) === toBusinessDayKey(b);
}

export function getRemainingVisitCountForToday(
  bookings = [],
  now = new Date(),
  graceMinutes = 15
) {
  if (!now) return 0;

  const graceMs = graceMinutes * 60 * 1000;

  return bookings.reduce((count, booking) => {
    const remainingTodayVisits =
      booking.visits?.filter((visit) => {
        if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
          return false;
        }

        const start = new Date(visit.startTime);
        if (Number.isNaN(start.getTime())) return false;

        if (!isSameDay(start, now)) return false;

        return start.getTime() + graceMs > now.getTime();
      }) || [];

    return count + remainingTodayVisits.length;
  }, 0);
}

export function getRemainingPayoutForToday(
  bookings = [],
  now = new Date(),
  graceMinutes = 15
) {
  if (!now) return 0;

  const graceMs = graceMinutes * 60 * 1000;

  const total = bookings.reduce((sum, booking) => {
    const visits = booking.visits || [];
    const totalVisits = visits.length;

    if (!totalVisits) return sum;

    const remainingTodayVisits = visits.filter((visit) => {
      if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
        return false;
      }

      const start = new Date(visit.startTime);
      if (Number.isNaN(start.getTime())) return false;

      if (!isSameDay(start, now)) return false;

      return start.getTime() + graceMs > now.getTime();
    });

    if (!remainingTodayVisits.length) return sum;

    const bookingPayout = booking.sitterPayoutCents || 0;
    const payoutPerVisit = bookingPayout / totalVisits;

    return sum + payoutPerVisit * remainingTodayVisits.length;
  }, 0);

  return Math.round(total);
}

export function getActiveVisitCount(bookings = []) {
  return bookings.reduce((count, booking) => {
    const visits =
      booking.visits?.filter(
        (visit) => visit.status !== "COMPLETED" && visit.status !== "CANCELED"
      ) || [];

    return count + visits.length;
  }, 0);
}

export function getCompletedVisitCount(bookings = []) {
  return bookings.reduce((count, booking) => {
    const visits =
      booking.visits?.filter((visit) => visit.status === "COMPLETED") || [];

    return count + visits.length;
  }, 0);
}

export function getCanceledVisitCount(bookings = []) {
  return bookings.reduce((count, booking) => {
    const visits =
      booking.visits?.filter((visit) => visit.status === "CANCELED") || [];

    return count + visits.length;
  }, 0);
}

export function getVisitProgressLabel(visits = []) {
  if (!visits.length) return "No visits scheduled";

  const total = visits.length;
  const completed = visits.filter(
    (visit) => visit.status === "COMPLETED"
  ).length;
  const remaining = visits.filter(
    (visit) => visit.status !== "COMPLETED" && visit.status !== "CANCELED"
  ).length;

  if (remaining === 0 && completed > 0) {
    return `${completed} of ${total} visits completed`;
  }

  if (completed > 0) {
    return `${remaining} remaining of ${total} visits`;
  }

  return total === 1 ? "1 visit scheduled" : `${total} visits scheduled`;
}

export function getBookingNextVisit(booking, now) {
  if (!booking?.visits?.length || !now) return booking?.visits?.[0] || null;

  return (
    booking.visits.find(
      (visit) => visit.status !== "COMPLETED" && new Date(visit.endTime) >= now
    ) || booking.visits[0]
  );
}

export function getVisitSummaryLines(visits = []) {
  if (!visits.length) return ["No visits scheduled"];

  return visits.slice(0, 3).map((visit) => {
    const start = new Date(visit.startTime);
    const end = new Date(visit.endTime);

    return `${start.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    })} • ${formatTime(start)}–${formatTime(end)}`;
  });
}

export function getActionableVisitForBooking(booking, now) {
  if (!booking?.visits?.length || !now) return null;

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const remaining = booking.visits.filter((visit) => {
    const start = new Date(visit.startTime);
    if (Number.isNaN(start.getTime())) return false;

    return (
      visit.status === "CONFIRMED" && start.getTime() + graceMs > now.getTime()
    );
  });

  return (
    remaining.sort(
      (a, b) => new Date(a.startTime) - new Date(b.startTime)
    )[0] || null
  );
}

export function canCompleteVisit(visit, now) {
  if (!visit || !now) return false;

  const start = new Date(visit.startTime);
  if (Number.isNaN(start.getTime())) return false;

  return visit.status === "CONFIRMED" && start.getTime() <= now.getTime();
}

export function shouldAutoCompleteBooking(visits = []) {
  if (!visits.length) return false;

  return visits.every(
    (v) => v.status === "COMPLETED" || v.status === "CANCELED"
  );
}

export function hasRemainingTodayVisit(booking, now) {
  if (!now || !booking?.visits?.length) return false;

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  return booking.visits.some((visit) => {
    if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
      return false;
    }

    const start = new Date(visit.startTime);
    if (Number.isNaN(start.getTime())) return false;

    if (!isSameDay(start, now)) return false;

    return start.getTime() + graceMs > now.getTime();
  });
}

export function getRemainingTodayVisitSummaryLines(
  visits = [],
  now,
  limit = 3
) {
  if (!visits.length || !now) return ["No visits scheduled"];

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const remainingTodayVisits = visits
    .filter((visit) => {
      if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
        return false;
      }

      const start = new Date(visit.startTime);
      if (Number.isNaN(start.getTime())) return false;
      if (!isSameDay(start, now)) return false;

      return start.getTime() + graceMs > now.getTime();
    })
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, limit);

  if (!remainingTodayVisits.length) return ["No remaining visits today"];

  return remainingTodayVisits.map((visit) => {
    const start = new Date(visit.startTime);
    const end = new Date(visit.endTime);

    return `${start.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    })} • ${formatTime(start)}–${formatTime(end)}`;
  });
}

export function getUpcomingVisitSummaryLines(visits = [], now, limit = 3) {
  if (!visits.length || !now) return ["No visits scheduled"];

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const upcomingVisits = visits
    .filter((visit) => {
      const start = new Date(visit.startTime);
      if (Number.isNaN(start.getTime())) return false;

      return start.getTime() + graceMs > now.getTime();
    })
    .slice(0, limit);

  if (!upcomingVisits.length) return ["No upcoming visits"];

  return upcomingVisits.map((visit) => {
    const start = new Date(visit.startTime);
    const end = new Date(visit.endTime);

    return `${start.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    })} • ${formatTime(start)}–${formatTime(end)}`;
  });
}

export function hasFutureVisit(booking, now) {
  if (!now || !booking?.visits?.length) return false;

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  return booking.visits.some((visit) => {
    const start = new Date(visit.startTime);
    if (Number.isNaN(start.getTime())) return false;

    return start.getTime() + graceMs > now.getTime();
  });
}

export function getCompletedThisWeekCount(bookings = [], now) {
  if (!now) return 0;

  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();

  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  return bookings.filter((booking) => {
    if (booking.status !== "COMPLETED") return false;
    const completedAt = booking.updatedAt ? new Date(booking.updatedAt) : null;
    return completedAt && completedAt >= startOfWeek;
  }).length;
}

export function groupBookings(bookings = [], now) {
  if (!now) {
    return {
      today: [],
      upcoming: bookings.filter(
        (b) => b.status !== "COMPLETED" && b.status !== "CANCELED"
      ),
      completed: bookings.filter((b) => b.status === "COMPLETED"),
      canceled: bookings.filter((b) => b.status === "CANCELED"),
    };
  }

  const GRACE_MINUTES = 15;
  const graceMs = GRACE_MINUTES * 60 * 1000;

  const today = [];
  const upcoming = [];
  const completed = [];
  const canceled = [];

  for (const booking of bookings) {
    if (booking.status === "COMPLETED") {
      completed.push(booking);
      continue;
    }

    if (booking.status === "CANCELED") {
      canceled.push(booking);
      continue;
    }

    const visits = booking.visits || [];

    let hasTodayVisit = false;
    let hasRemainingTodayVisit = false;
    let hasFutureVisit = false;

    for (const visit of visits) {
      const start = new Date(visit.startTime);
      if (Number.isNaN(start.getTime())) continue;

      const isToday = isSameDay(start, now);

      if (isToday) {
        hasTodayVisit = true;

        if (start.getTime() + graceMs > now.getTime()) {
          hasRemainingTodayVisit = true;
        }
      }

      if (start.getTime() + graceMs > now.getTime()) {
        hasFutureVisit = true;
      }
    }

    if (hasTodayVisit && hasRemainingTodayVisit) {
      today.push(booking);
    } else if (hasFutureVisit) {
      upcoming.push(booking);
    } else {
      completed.push(booking);
    }
  }

  return { today, upcoming, completed, canceled };
}

export function getSitterMapBookings(bookings = [], now) {
  if (!now) return [];

  return bookings
    .filter((booking) => booking.status !== "CANCELED")
    .map((booking) => {
      const todayVisit =
        booking.visits?.find((visit) =>
          isSameDay(new Date(visit.startTime), now)
        ) || null;

      const nextVisit = getBookingNextVisit(booking, now);

      const address = [
        booking.serviceAddressLine1,
        booking.serviceAddressLine2,
        booking.serviceCity,
        booking.serviceState,
        booking.servicePostalCode,
      ]
        .filter(Boolean)
        .join(", ");

      const lat =
        booking.serviceLat != null ? Number(booking.serviceLat) : null;
      const lng =
        booking.serviceLng != null ? Number(booking.serviceLng) : null;

      return {
        id: booking.id,
        clientName: booking.client?.name || "Client",
        serviceSummary: booking.serviceSummary || "Drop-in visit",
        status: booking.status,
        lat,
        lng,
        address,
        nextVisitStart: nextVisit?.startTime || null,
        todayVisitStart: todayVisit?.startTime || null,
        sitterPayoutCents: booking.sitterPayoutCents || 0,
        visits: booking.visits || [],
      };
    })
    .filter(
      (booking) => Number.isFinite(booking.lat) && Number.isFinite(booking.lng)
    );
}

export function getSortTimeForMapBooking(booking, now) {
  if (!now) return Number.MAX_SAFE_INTEGER;

  const GRACE_MINUTES = 15;

  const today = booking.todayVisitStart
    ? new Date(booking.todayVisitStart)
    : null;

  if (!today) return Number.MAX_SAFE_INTEGER;

  const visitTime = today.getTime();
  if (Number.isNaN(visitTime)) return Number.MAX_SAFE_INTEGER;

  const nowTime = now.getTime();
  const cutoffTime = visitTime + GRACE_MINUTES * 60 * 1000;

  if (nowTime > cutoffTime) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (visitTime > nowTime) {
    return visitTime;
  }

  return nowTime + 24 * 60 * 60 * 1000 + visitTime;
}

export function getSortedSitterMapBookings(bookings = [], now) {
  return [...bookings].sort(
    (a, b) =>
      getSortTimeForMapBooking(a, now) - getSortTimeForMapBooking(b, now)
  );
}

export function getRemainingMapStops(bookings = [], now) {
  if (!now) return [];

  return getSortedSitterMapBookings(bookings, now).filter((booking) => {
    const sortTime = getSortTimeForMapBooking(booking, now);
    return sortTime !== Number.MAX_SAFE_INTEGER;
  });
}

export function getNextMapStop(bookings = [], now) {
  if (!now) return null;

  return getRemainingMapStops(bookings, now)[0] || null;
}

export function getRecentGraceStops(bookings = [], now) {
  if (!now) return [];

  const GRACE_MINUTES = 15;
  const nowTime = now.getTime();

  return bookings.filter((booking) => {
    if (!booking.todayVisitStart) return false;

    const visitTime = new Date(booking.todayVisitStart).getTime();
    if (Number.isNaN(visitTime)) return false;

    const cutoffTime = visitTime + GRACE_MINUTES * 60 * 1000;

    return visitTime <= nowTime && nowTime <= cutoffTime;
  });
}

export function getLastGraceStop(bookings = [], now) {
  const recentStops = getRecentGraceStops(bookings, now);

  return (
    recentStops.sort((a, b) => {
      const aTime = new Date(a.todayVisitStart).getTime();
      const bTime = new Date(b.todayVisitStart).getTime();
      return bTime - aTime;
    })[0] || null
  );
}

export function getVisitEntries(bookings = []) {
  return bookings.flatMap((booking) => {
    const visits = booking.visits || [];
    const totalVisits = visits.length || 1;
    const payoutPerVisit = Math.round(
      (booking.sitterPayoutCents || 0) / totalVisits
    );

    return visits.map((visit) => {
      const address = [
        booking.serviceAddressLine1,
        booking.serviceAddressLine2,
        booking.serviceCity,
        booking.serviceState,
        booking.servicePostalCode,
      ]
        .filter(Boolean)
        .join(", ");

      return {
        id: visit.id,
        visit,
        bookingId: booking.id,
        bookingStatus: booking.status,
        client: booking.client || null,
        clientName: booking.client?.name || "Client",
        serviceSummary: booking.serviceSummary || "Visit",
        payoutPerVisitCents: payoutPerVisit,
        address,
        lat: booking.serviceLat != null ? Number(booking.serviceLat) : null,
        lng: booking.serviceLng != null ? Number(booking.serviceLng) : null,
        booking,
      };
    });
  });
}

export function isVisitInactive(visit) {
  return !visit || visit.status === "COMPLETED" || visit.status === "CANCELED";
}

export function isVisitWithinGrace(visit, now = new Date(), graceMinutes = 15) {
  if (!visit || !now) return false;
  if (isVisitInactive(visit)) return false;

  const start = new Date(visit.startTime);
  if (Number.isNaN(start.getTime())) return false;

  const graceMs = graceMinutes * 60 * 1000;
  return start.getTime() + graceMs > now.getTime();
}

export function getRemainingTodayVisitEntries(
  bookings = [],
  now = new Date(),
  graceMinutes = 15
) {
  return getVisitEntries(bookings)
    .filter(({ visit }) => {
      const start = new Date(visit.startTime);
      if (Number.isNaN(start.getTime())) return false;

      return (
        isSameDay(start, now) && isVisitWithinGrace(visit, now, graceMinutes)
      );
    })
    .sort((a, b) => new Date(a.visit.startTime) - new Date(b.visit.startTime));
}

export function getUpcomingVisitEntries(
  bookings = [],
  now = new Date(),
  graceMinutes = 15
) {
  return getVisitEntries(bookings)
    .filter(({ visit }) => {
      const start = new Date(visit.startTime);
      if (Number.isNaN(start.getTime())) return false;

      if (isSameDay(start, now)) return false;

      return isVisitWithinGrace(visit, now, graceMinutes);
    })
    .sort((a, b) => new Date(a.visit.startTime) - new Date(b.visit.startTime));
}

export function serializeVisitEntry(entry) {
  return {
    id: entry.id,
    bookingId: entry.bookingId,
    bookingStatus: entry.bookingStatus,
    clientName: entry.clientName,
    serviceSummary: entry.serviceSummary,
    payoutPerVisitCents: entry.payoutPerVisitCents,
    address: entry.address,
    lat: entry.lat,
    lng: entry.lng,
    visit: {
      id: entry.visit?.id,
      status: entry.visit?.status,
      startTime:
        entry.visit?.startTime?.toISOString?.() || entry.visit?.startTime,
      endTime: entry.visit?.endTime?.toISOString?.() || entry.visit?.endTime,
    },
  };
}

export function getCompletedVisitEntries(bookings = []) {
  return getVisitEntries(bookings)
    .filter(({ visit }) => visit?.status === "COMPLETED")
    .sort((a, b) => new Date(b.visit.startTime) - new Date(a.visit.startTime));
}

export function getCanceledVisitEntries(bookings = []) {
  return getVisitEntries(bookings)
    .filter(({ visit }) => visit?.status === "CANCELED")
    .sort((a, b) => new Date(b.visit.startTime) - new Date(a.visit.startTime));
}

export function getVisitDisplayLabel(visit, now) {
  if (visit.status === "COMPLETED") return "Done";
  if (visit.status === "CANCELED") return "Canceled";

  if (new Date(visit.startTime) <= now) {
    return "Ready now";
  }

  return "Scheduled";
}

export function formatDateLabel(value) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function buildAddress(booking) {
  return [
    booking.serviceAddressLine1,
    booking.serviceAddressLine2,
    booking.serviceCity,
    booking.serviceState,
    booking.servicePostalCode,
    booking.serviceCountry,
  ]
    .filter(Boolean)
    .join(", ");
}

export function groupVisitsByDay(visits = []) {
  const groups = new Map();

  for (const visit of visits) {
    const key = new Date(visit.startTime).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(visit);
  }

  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: formatDateLabel(items[0].startTime),
    visits: items.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
  }));
}