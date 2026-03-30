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

export function getVisitCountForToday(bookings = [], now) {
  if (!now) return 0;

  return bookings.reduce((count, booking) => {
    const todayVisits =
      booking.visits?.filter((visit) =>
        isSameDay(new Date(visit.startTime), now)
      ) || [];

    return count + todayVisits.length;
  }, 0);
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
    if (visit.status === "COMPLETED" || visit.status === "CANCELED")
      return false;

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
      if (visit.status === "COMPLETED" || visit.status === "CANCELED")
        return false;

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

export function getFutureVisits(
  visits = [],
  now = new Date(),
  graceMinutes = 15
) {
  const graceMs = graceMinutes * 60 * 1000;

  return visits.filter((visit) => {
    if (visit.status === "COMPLETED" || visit.status === "CANCELED")
      return false;

    const end = new Date(visit.endTime);
    if (Number.isNaN(end.getTime())) return false;

    return end.getTime() + graceMs > now.getTime();
  });
}

export function getRemainingVisits(
  visits = [],
  now = new Date(),
  graceMinutes = 15
) {
  const graceMs = graceMinutes * 60 * 1000;

  return visits.filter((visit) => {
    const end = new Date(visit.endTime);
    if (Number.isNaN(end.getTime())) return false;

    return end.getTime() + graceMs > now.getTime();
  });
}

export function canCompleteBooking(
  booking,
  now = new Date(),
  graceMinutes = 15
) {
  if (!booking || booking.status !== "CONFIRMED") return false;

  const remainingVisits = getRemainingVisits(booking.visits, now, graceMinutes);

  return remainingVisits.length === 0;
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

export function getUpcomingPayout(bookings) {
  return bookings
    .filter((booking) => booking.status === "CONFIRMED")
    .reduce((sum, booking) => sum + (booking.sitterPayoutCents || 0), 0);
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

    

    // 🎯 New classification logic

    if (hasTodayVisit && hasRemainingTodayVisit) {
      today.push(booking);
    } else if (hasFutureVisit) {
      upcoming.push(booking);
    } else {
      // optional: treat fully past bookings as completed-like
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

  // ❌ HARD STOP — past grace → REMOVE
  if (nowTime > cutoffTime) {
    return Number.MAX_SAFE_INTEGER;
  }

  // ✅ Future visit
  if (visitTime > nowTime) {
    return visitTime;
  }

  // ✅ Within grace window → keep but deprioritize
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