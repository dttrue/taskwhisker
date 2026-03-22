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

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getBookingNextVisit(booking, now = new Date()) {
  if (!booking?.visits?.length) return null;

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

export function getVisitCountForToday(bookings, now = new Date()) {
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

export function getCompletedThisWeekCount(bookings, now = new Date()) {
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

export function groupBookings(bookings, now = new Date()) {
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

export function getNextUpBooking(bookings, now = new Date()) {
  const confirmed = bookings.filter(
    (booking) => booking.status === "CONFIRMED"
  );

  const withNextVisit = confirmed
    .map((booking) => ({
      booking,
      nextVisit: getBookingNextVisit(booking, now),
    }))
    .filter((item) => item.nextVisit);

  withNextVisit.sort(
    (a, b) =>
      new Date(a.nextVisit.startTime).getTime() -
      new Date(b.nextVisit.startTime).getTime()
  );

  return withNextVisit[0] || null;
}

export function getSitterMapBookings(bookings, now = new Date()) {
  return bookings
    .filter((booking) => booking.status !== "CANCELED")
    .map((booking) => {
      const todayVisit =
        booking.visits?.find((visit) =>
          isSameDay(new Date(visit.startTime), now)
        ) || null;

      const nextVisit = getBookingNextVisit(booking, now);

      return {
        id: booking.id,
        clientName: booking.client?.name || "Client",
        serviceSummary: booking.serviceSummary || "Drop-in visit",
        status: booking.status,
        lat: Number(booking.serviceLat),
        lng: Number(booking.serviceLng),
        address: [
          booking.serviceAddressLine1,
          booking.serviceAddressLine2,
          booking.serviceCity,
          booking.serviceState,
          booking.servicePostalCode,
        ]
          .filter(Boolean)
          .join(", "),
        nextVisitStart: nextVisit?.startTime || null,
        todayVisitStart: todayVisit?.startTime || null,
        sitterPayoutCents: booking.sitterPayoutCents || 0,
      };
    })
    .filter(
      (booking) => Number.isFinite(booking.lat) && Number.isFinite(booking.lng)
    );
}
