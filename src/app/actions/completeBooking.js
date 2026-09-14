"use server";

import { completeBooking as guardedCompleteBooking } from "@/app/dashboard/operator/bookings/actions";

// No current callers. Retained compatibility action delegates to the same gate.
export async function completeBooking(bookingId) {
  return guardedCompleteBooking(bookingId);
}
