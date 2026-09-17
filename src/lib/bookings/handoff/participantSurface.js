import { resolveSitterBookingParticipationWithDb } from './participation.js';

// Identity comes only from an authenticated server caller. Recheck assignment in
// the bounded resolver after discovery so a revoked visit never reaches the UI.
export async function loadParticipantVisit({ db, visitId, userId }) {
  const identity = await db.visit.findFirst({ where: { id: visitId, OR: [{ sitterId: userId }, { booking: { sitterId: userId } }] }, select: { bookingId: true } });
  if (!identity) return null;
  const dto = await resolveSitterBookingParticipationWithDb({ db, bookingId: identity.bookingId, userId });
  if (!dto || dto.kind === 'LEAD') return dto;
  if (dto.unavailable) return dto;
  const visit = dto.visits.find(v => v.id === visitId);
  return visit ? { ...dto, visits: [visit] } : null;
}
export async function loadParticipantDashboard({ db, userId }) {
  const assigned = await db.visit.findMany({ where: { sitterId: userId, status: { not: 'CANCELED' },
    booking: { sitterId: { not: userId }, careInstructionsVersion: 1, status: { not: 'CANCELED' } } },
    select: { id: true, bookingId: true }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }] });
  const result = [];
  for (const bookingId of new Set(assigned.map(v => v.bookingId))) {
    const dto = await resolveSitterBookingParticipationWithDb({ db, bookingId, userId });
    if (dto?.kind !== 'VISIT_PARTICIPANT' || dto.unavailable) continue;
    for (const visit of dto.visits) result.push(participantVisitEntry(dto, visit));
  }
  return result.sort((a,b) => new Date(a.visit.startTime) - new Date(b.visit.startTime));
}
export function participantVisitEntry(dto, visit) {
  return { id: visit.id, bookingId: dto.bookingId, service: dto.service,
    clientName: dto.client.name, petNames: dto.care.petNames || [],
    location: dto.location, visit: { ...visit, startTime: new Date(visit.startTime).toISOString(), endTime: new Date(visit.endTime).toISOString(),
      completedAt: visit.completedAt ? new Date(visit.completedAt).toISOString() : null } };
}
