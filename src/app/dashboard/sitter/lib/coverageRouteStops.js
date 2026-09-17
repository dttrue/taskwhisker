import { isSameDay } from './sitterDashboardUtils';
// One stop per assigned Visit. These inputs are already bounded participant DTOs.
export function coverageRouteStops(entries, now) {
  return entries.filter(e => e.visit.canExecute && e.visit.status === 'CONFIRMED' &&
    isSameDay(new Date(e.visit.startTime), now) && new Date(e.visit.endTime) >= now &&
    Number.isFinite(e.location.lat) && Number.isFinite(e.location.lng)).map(e => ({
      id: e.id, coverageVisitId: e.id, coverageMoney: e.visit.money,
      clientName: e.clientName, serviceSummary: e.service.label, petDisplayName: e.petNames.join(', '),
      lat: e.location.lat, lng: e.location.lng,
      address: [e.location.addressLine1, e.location.addressLine2, e.location.city, e.location.state, e.location.postalCode].filter(Boolean).join(', '),
      todayVisitStart: e.visit.startTime, todayVisitEnd: e.visit.endTime, todayVisitStatus: e.visit.status,
      visits: [e.visit], status: 'CONFIRMED',
    }));
}
