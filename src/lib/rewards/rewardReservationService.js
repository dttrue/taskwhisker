import "server-only";

import { prisma } from "../db.js";
import {
  reserveRewardForBookingWithDb,
  consumeRewardReservationWithDb,
  releaseRewardReservationWithDb,
} from "./rewardReservationWrites.js";

// Internal server functions, not browser-callable server actions. Explicitly
// allowlist input: no caller DB, sitter, grant, economics, status, or clock.
export function reserveRewardForBooking({ bookingId } = {}) {
  return reserveRewardForBookingWithDb({ db: prisma, bookingId });
}

export function consumeRewardReservation({ bookingId } = {}) {
  return consumeRewardReservationWithDb({ db: prisma, bookingId });
}

// Future compensation integration MUST verify that no compensation has been
// earned before calling release. Phase 1 cannot prove that without the future
// BookingSitterCompensation record; this entry point stays server-only/internal.
export function releaseRewardReservation({ bookingId, reason } = {}) {
  return releaseRewardReservationWithDb({ db: prisma, bookingId, reason });
}
