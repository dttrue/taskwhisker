import { economicsInclude, isCanonicalBooking } from "../economics/bookingEconomics.js";
import { activeAuthorization, visitFinancialInclude } from "../visitCompensation/contract.js";
import { careReadiness } from "../visitCompensation/readiness.js";

export function participationKind(booking, userId) {
  if (!booking || !userId) return "NONE";
  if (booking.sitterId === userId) return "LEAD";
  return booking.visits?.some(v => v.sitterId === userId && v.status !== "CANCELED") ? "VISIT_PARTICIPANT" : "NONE";
}
export function ownVisitMoney(booking, visit, userId) {
  if (!visit || visit.sitterId !== userId || !isCanonicalBooking(booking) || !careReadiness(booking, visit.id).ok) return null;
  const a = activeAuthorization(visit), earned = visit.compensationAllocation;
  if (visit.status === "CANCELED" || !a || a.sitterId !== userId) return null;
  if (visit.status === "COMPLETED") {
    if (!earned || earned.authorizationId !== a.id || earned.performedBySitterId !== userId || visit.performedBySitterId !== userId ||
        earned.sitterPayoutCents !== a.sitterPayoutCents || earned.currency !== a.currency) return null;
    return { status: "EARNED", payoutCents: earned.sitterPayoutCents, currency: earned.currency };
  }
  return { status: "AUTHORIZED", payoutCents: a.sitterPayoutCents, currency: a.currency };
}
// Lead operational visibility is whole-booking; financial rows never cross this DTO.
export function leadVisibleVisits(booking, userId) {
  if (participationKind(booking, userId) !== "LEAD") return [];
  return booking.visits.map(v => ({
    id: v.id, bookingId: v.bookingId, sitterId: v.sitterId,
    scheduledSitterName: v.sitter?.name || (v.sitterId ? `Sitter ${v.sitterId}` : "Unassigned"),
    startTime: v.startTime, endTime: v.endTime, date: v.date,
    status: v.status, completedAt: v.completedAt,
    canExecute: v.sitterId === userId,
    ownMoney: ownVisitMoney(booking, v, userId),
  }));
}
// Explicit allowlist. No raw Booking/Client/auth/allocation spreads may cross this boundary.
export function participantCareDto(booking, userId) {
  const kind = participationKind(booking, userId);
  if (kind === "NONE") return null;
  if (kind === "LEAD") return { kind, bookingId: booking.id, useLeadView: true };
  const visits = booking.visits.filter(v => v.sitterId === userId && v.status !== "CANCELED");
  if (!isCanonicalBooking(booking) || !visits.length || visits.some(v => !careReadiness(booking, v.id).ok)) return { kind, bookingId: booking.id, unavailable: true };
  return { kind, bookingId: booking.id, status: booking.status,
    service: { label: booking.serviceSummary, durationMinutes: booking.durationMinutes },
    client: { name: booking.client?.name ?? null, phone: booking.client?.phone ?? null },
    care: { petDetails: booking.petDetails, petNames: booking.petNames, accessInstructions: booking.accessInstructions, locationNotes: booking.locationNotes },
    location: { addressLine1: booking.serviceAddressLine1, addressLine2: booking.serviceAddressLine2, city: booking.serviceCity, state: booking.serviceState,
      postalCode: booking.servicePostalCode, lat: booking.serviceLat == null ? null : Number(booking.serviceLat), lng: booking.serviceLng == null ? null : Number(booking.serviceLng) },
    visits: visits.map(v => ({ id: v.id, startTime: v.startTime, endTime: v.endTime, status: v.status, completedAt: v.completedAt,
      money: ownVisitMoney(booking, v, userId), canExecute: booking.status === "CONFIRMED" && v.status === "CONFIRMED" && !v.performedBySitterId })),
  };
}
// Internal authenticated-server seam; userId must come from the session, never a browser role flag.
// Intentionally unwired until a dedicated participant UI has been reviewed.
export async function resolveSitterBookingParticipationWithDb({ db, bookingId, userId }) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "SITTER") return null;
  return db.$transaction(async tx => {
    const booking = await tx.booking.findFirst({ where: { id: bookingId, OR: [{ sitterId: userId }, { visits: { some: { sitterId: userId, status: { not: "CANCELED" } } } }] },
      include: { ...economicsInclude, visits: { include: visitFinancialInclude }, client: { select: { name: true, phone: true } } } });
    return participantCareDto(booking, userId);
  }, { isolationLevel: "RepeatableRead" });
}
