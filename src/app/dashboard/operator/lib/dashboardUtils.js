// src/app/dashboard/operator/lib/dashboardUtils.js

export function formatDateOnly(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatTimeOnly(value) {
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

export function getTodayVisitCount(bookings, now = new Date()) {
  return bookings.reduce((count, booking) => {
    const todayVisits =
      booking.visits?.filter((visit) =>
        isSameDay(new Date(visit.startTime), now)
      ) || [];

    return count + todayVisits.length;
  }, 0);
}

export function getConfirmedRevenue(bookings) {
  return bookings
    .filter((b) => b.status === "CONFIRMED")
    .reduce((sum, b) => sum + (b.clientTotalCents || 0), 0);
}

export function getBookingNextVisit(booking, now = new Date()) {
  if (!booking?.visits?.length) return null;

  return (
    booking.visits.find((visit) => new Date(visit.endTime) >= now) ||
    booking.visits[0]
  );
}

export function groupBookings(bookings = [], now = new Date()) {
  const requested = [];
  const today = [];
  const overdue = [];
  const upcoming = [];
  const completed = [];
  const canceled = [];

  for (const booking of bookings) {
    if (booking.status === "REQUESTED") {
      requested.push(booking);
      continue;
    }

    if (booking.status === "COMPLETED") {
      completed.push(booking);
      continue;
    }

    if (booking.status === "CANCELED") {
      canceled.push(booking);
      continue;
    }

    const visits = booking.visits || [];

    const hasVisitToday = visits.some((visit) =>
      isSameDay(new Date(visit.startTime), now)
    );

    const hasOverdueVisit = visits.some((visit) => {
      if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
        return false;
      }

      const end = new Date(visit.endTime);
      if (Number.isNaN(end.getTime())) return false;

      return end < now;
    });

    const hasFutureVisit = visits.some((visit) => {
      if (visit.status === "COMPLETED" || visit.status === "CANCELED") {
        return false;
      }

      const start = new Date(visit.startTime);
      if (Number.isNaN(start.getTime())) return false;

      return start > now;
    });

    if (hasOverdueVisit) {
      overdue.push(booking);
    } else if (hasVisitToday) {
      today.push(booking);
    } else if (hasFutureVisit) {
      upcoming.push(booking);
    } else {
      overdue.push(booking);
    }
  }

  return { requested, today, overdue, upcoming, completed, canceled };
}
export function getNeedsAttentionBooking(bookings, now = new Date()) {
  const priorityPool = bookings
    .filter(
      (b) =>
        b.status === "REQUESTED" || (b.status === "CONFIRMED" && !b.sitterId)
    )
    .map((booking) => ({
      booking,
      nextVisit: getBookingNextVisit(booking, now),
    }));

  priorityPool.sort((a, b) => {
    const aTime = a.nextVisit
      ? new Date(a.nextVisit.startTime).getTime()
      : new Date(a.booking.startTime).getTime();

    const bTime = b.nextVisit
      ? new Date(b.nextVisit.startTime).getTime()
      : new Date(b.booking.startTime).getTime();

    return aTime - bTime;
  });

  return priorityPool[0] || null;
}

export function getTodaysVisits(bookings, now = new Date()) {
  const rows = [];

  for (const booking of bookings) {
    for (const visit of booking.visits || []) {
      const start = new Date(visit.startTime);

      if (isSameDay(start, now)) {
        rows.push({
          id: visit.id,
          bookingId: booking.id,
          clientName: booking.client?.name || "—",
          sitterName:
            booking.sitter?.name || booking.sitter?.email || "Unassigned",
          serviceSummary: booking.serviceSummary || "Booking",
          startTime: visit.startTime,
          endTime: visit.endTime,
          bookingStatus: booking.status,
          visitStatus: visit.status,
          clientTotalCents: booking.clientTotalCents || 0,
        });
      }
    }
  }

  rows.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  return rows;
}
