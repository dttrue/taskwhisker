export const BUSINESS_TIME_ZONE = "America/New_York";

export function getBusinessDateParts(date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function getTimeZoneOffsetMs(date, timeZone = BUSINESS_TIME_ZONE) {
  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = timeZoneName?.match(/GMT([+-])(\d{2}):(\d{2})/);

  if (!match) return 0;

  const direction = match[1] === "+" ? 1 : -1;
  return direction * (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000;
}

export function getBusinessDayStart(
  referenceDate = new Date(),
  dayOffset = 0,
  timeZone = BUSINESS_TIME_ZONE
) {
  const { year, month, day } = getBusinessDateParts(referenceDate, timeZone);
  const targetWallTime = Date.UTC(year, month - 1, day + dayOffset);
  let instant = new Date(targetWallTime);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = new Date(
      targetWallTime - getTimeZoneOffsetMs(instant, timeZone)
    );
  }

  return instant;
}

export function getBusinessDayRange(
  referenceDate = new Date(),
  timeZone = BUSINESS_TIME_ZONE
) {
  return {
    startsAt: getBusinessDayStart(referenceDate, 0, timeZone),
    endsAt: getBusinessDayStart(referenceDate, 1, timeZone),
  };
}

export function isVisitCurrent(visit, now = new Date()) {
  if (!visit || visit.status !== "CONFIRMED") return false;

  const start = new Date(visit.startTime);
  const end = new Date(visit.endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  const currentTime = now.getTime();
  return start.getTime() <= currentTime && currentTime <= end.getTime();
}

export function isVisitOverdue(visit, now = new Date()) {
  if (!visit || visit.status !== "CONFIRMED") return false;

  const end = new Date(visit.endTime);
  return !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
}

export function getVisitOperationalStatus(visit, now = new Date()) {
  if (visit?.status === "CANCELED") return "CANCELED";
  if (visit?.status === "COMPLETED") return "COMPLETED";
  if (isVisitOverdue(visit, now)) return "MISSED";
  if (isVisitCurrent(visit, now)) return "CURRENT";

  const start = new Date(visit?.startTime);
  if (!Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
    return "UPCOMING";
  }

  return "SCHEDULED";
}

export function sortVisitsChronologically(visits = []) {
  return [...visits].sort((a, b) => {
    const timeDifference =
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

    return timeDifference || String(a.id).localeCompare(String(b.id));
  });
}
