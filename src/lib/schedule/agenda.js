import { calendarRange, aggregateMonth } from "../calendar/calendarRange.js";
import { scheduleAccess } from "./access.js";

export const agendaRange = calendarRange;

export async function loadAgenda(db, actorId, params, now) {
  const access = await scheduleAccess(db, actorId);
  const range = agendaRange(params, now);
  const visits = await db.visit.findMany({
    where: {
      operatorId: access.operatorId, sitterId: access.sitterId,
      booking: { operatorId: access.operatorId },
      startTime: { lt: range.endsAt }, endTime: { gt: range.startsAt },
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    select: range.view === "month" ? {
      id: true, startTime: true, endTime: true, status: true,
    } : {
      id: true, bookingId: true, startTime: true, endTime: true, status: true,
      sitter: { select: { name: true } },
      booking: { select: {
        serviceSummary: true, service: { select: { name: true } }, client: { select: { name: true } },
        petNames: true, bookingPets: { orderBy: { position: "asc" }, select: { nameSnapshot: true } },
      } },
    },
  });
  // Month consumers receive counts only, never raw visit IDs or booking data.
  return range.view === "month" ? { access, range, monthDays: aggregateMonth(range, visits) } : { access, range, visits };
}
