import { isCanonicalBooking, readBookingEconomics } from "../economics/bookingEconomics.js";
import { inspectFinancialReadiness } from "./contract.js";

export function careReadiness(booking, visitId = null) {
  if (!isCanonicalBooking(booking)) return { ok: true };
  if (!["CONFIRMED", "COMPLETED"].includes(booking.status) || readBookingEconomics(booking).sitter.status !== "COMMITTED") return {
    ok: false, code: "FINANCIAL_READINESS_MISSING", reason: "COMPENSATION_INVALID",
    error: "This canonical visit is unavailable for service. Financial preparation requires operator review.",
  };
  return inspectFinancialReadiness(booking, visitId);
}
// Historical terminal records remain readable. Live canonical care is withheld
// by server pages/DTOs, and checked again inside the execution transaction.
export function actionableCareUnavailable(booking) {
  if (booking.visits?.length && booking.visits.every((v) => ["COMPLETED", "CANCELED"].includes(v.status))) return false;
  return isCanonicalBooking(booking) && !["COMPLETED", "CANCELED"].includes(booking.status) &&
    (booking.status !== "CONFIRMED" || !careReadiness(booking).ok);
}
