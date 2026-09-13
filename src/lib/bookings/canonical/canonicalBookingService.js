import "server-only";
import { prisma } from "../../db.js";
import { createCanonicalBookingWithDb } from "./createCanonicalBooking.js";

// Internal, unwired. The calling server operation must authenticate operatorId
// and retain creationKey. Do not import from a public action before reader,
// availability/confirmation, messaging and cancellation activation work.
export function createCanonicalBooking({ operatorId, creationKey, input } = {}) {
  return createCanonicalBookingWithDb({ db: prisma, operatorId, creationKey, input });
}
