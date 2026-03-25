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

export function getBookingNextVisit(booking, now) {
  if (!booking?.visits?.length || !now) return booking?.visits?.[0] || null;

  return (
    booking.visits.find((visit) => new Date(visit.endTime) >= now) ||
    booking.visits[0]
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
        (booking) =>
          booking.status !== "COMPLETED" && booking.status !== "CANCELED"
      ),
      completed: bookings.filter((booking) => booking.status === "COMPLETED"),
      canceled: bookings.filter((booking) => booking.status === "CANCELED"),
    };
  }

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

    const hasVisitToday =
      booking.visits?.some((visit) =>
        isSameDay(new Date(visit.startTime), now)
      ) || false;

    if (hasVisitToday) {
      today.push(booking);
    } else {
      upcoming.push(booking);
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
