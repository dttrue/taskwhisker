// src/app/dashboard/lib/bookingDisplayUtils.js

export function formatCompletedAt(value) {
  if (!value) return null;

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getOverdueVisits(visits = [], now = new Date()) {
  return visits.filter((v) => {
    if (v.status !== "CONFIRMED") return false;

    const end = new Date(v.endTime);
    if (Number.isNaN(end.getTime())) return false;

    return end < now;
  });
}

export function formatVisitSummary(visits = []) {
  if (!visits.length) return "No visits";

  const firstTwo = visits.slice(0, 2).map((v) =>
    new Date(v.startTime).toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  );

  if (visits.length <= 2) return firstTwo.join(" • ");

  return `${firstTwo.join(" • ")} • +${visits.length - 2} more`;
}
