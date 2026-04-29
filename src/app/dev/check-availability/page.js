// src/app/dev/check-availability/page.jsx

import { checkAvailability } from "@/lib/calendar/checkAvailability";
import { getAvailableTimesForDate } from "@/lib/calendar/getAvailableTimesForDate";
import { prisma } from "@/lib/db";

function getParam(params, ...keys) {
  for (const key of keys) {
    const val = params?.[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}

function formatLocal(date) {
  return new Date(date).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function formatTimeLocal(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function Page(props) {
  const resolvedSearchParams = await props.searchParams;

  const sitterId = getParam(resolvedSearchParams, "sitterId");

  const bufferMinutes = Number(
    getParam(resolvedSearchParams, "bufferMinutes", "buffer") || 15
  );

  const durationMinutes = Number(
    getParam(resolvedSearchParams, "durationMinutes", "duration") || 30
  );

  const start = new Date(
    getParam(resolvedSearchParams, "start") || "2026-04-20T14:50:00.000Z"
  );

  const end = new Date(
    getParam(resolvedSearchParams, "end") || "2026-04-20T15:20:00.000Z"
  );

  if (!sitterId) {
    return (
      <div className="p-6">
        Missing sitterId
        <pre className="mt-4 rounded bg-zinc-100 p-4 text-sm">
          {JSON.stringify(resolvedSearchParams, null, 2)}
        </pre>
      </div>
    );
  }

  const sitter = await prisma.user.findUnique({
    where: { id: sitterId },
    select: { id: true, name: true, email: true },
  });

  if (!sitter) {
    return <div className="p-6">Sitter not found</div>;
  }

  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(start);
  dayEnd.setHours(24, 0, 0, 0);

  const visits = await prisma.visit.findMany({
    where: {
      sitterId,
      startTime: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { startTime: "asc" },
  });

  const availability = await checkAvailability({
    sitterId,
    startTime: start,
    endTime: end,
    bufferMinutes,
  });

  const slotResults = await getAvailableTimesForDate({
    sitterId,
    date: start,
    durationMinutes,
    bufferMinutes,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Availability Debug</h1>

      <div className="bg-white p-4 rounded border">
        <p>
          <strong>Sitter:</strong> {sitter.name || sitter.email}
        </p>
        <p>
          <strong>Sitter ID:</strong> {sitter.id}
        </p>
        <p>
          <strong>Start:</strong> {formatLocal(start)}
        </p>
        <p>
          <strong>End:</strong> {formatLocal(end)}
        </p>
        <p>
          <strong>Buffer:</strong> {bufferMinutes} min
        </p>
        <p>
          <strong>Duration:</strong> {durationMinutes} min
        </p>
      </div>

      <div>
        <h2 className="font-semibold">Visits</h2>
        <pre className="bg-zinc-100 p-4 text-sm rounded overflow-x-auto">
          {JSON.stringify(visits, null, 2)}
        </pre>
      </div>

      <div>
        <h2 className="font-semibold">checkAvailability()</h2>
        <pre className="bg-zinc-100 p-4 text-sm rounded overflow-x-auto">
          {JSON.stringify(availability, null, 2)}
        </pre>
      </div>

      <div>
        <h2 className="font-semibold">Slots</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {slotResults.slots.map((slot) => (
            <div
              key={slot.startTime}
              className={`p-3 rounded border text-sm ${
                slot.available
                  ? "bg-green-100 border-green-300"
                  : "bg-red-100 border-red-300"
              }`}
            >
              <div className="font-medium">
                {slot.start} – {slot.end}
              </div>

              <div className="text-xs mt-1">
                {formatTimeLocal(slot.startTime)} →{" "}
                {formatTimeLocal(slot.endTime)}
              </div>

              {!slot.available && (
                <div className="text-xs mt-1 font-semibold">
                  ❌ {slot.reason}
                </div>
              )}

              {!slot.available && slot.conflicts?.length > 0 && (
                <div className="text-xs mt-1">
                  {slot.conflicts.map((c) => (
                    <div key={c.id}>
                      ⚠ {formatTimeLocal(c.startTime)}–
                      {formatTimeLocal(c.endTime)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
