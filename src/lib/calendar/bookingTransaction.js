import { checkAvailabilityWithDb } from "./availabilityContract.js";
import { formatBusinessDate, formatBusinessTime } from "./businessTime.js";

export class ScheduleConflictError extends Error {
  constructor(availability) {
    const conflict = availability.conflicts?.[0];
    super(conflict
      ? `Unavailable: ${formatBusinessDate(conflict.startTime)}, ${formatBusinessTime(conflict.startTime)}–${formatBusinessTime(conflict.endTime)}. Allow 15 minutes between bookings.`
      : "Selected time slot is no longer available.");
    this.code = "SCHEDULE_CONFLICT";
    this.availability = availability;
  }
}

export async function assertBookingAvailability(tx, sitterId, windows) {
  for (const window of windows) {
    const availability = await checkAvailabilityWithDb(tx, { sitterId, ...window, bufferMinutes: 15 });
    if (!availability.valid) throw new ScheduleConflictError(availability);
  }
}

// Both public and manual creation use the same predicate reads and isolation.
// A serialization failure retries the whole check/write operation; side effects
// such as email must remain outside the callback.
export async function bookingTransaction(db, work, { retryUnique = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (!(error?.code === "P2034" || retryUnique && error?.code === "P2002") || attempt === 2) throw error;
    }
  }
}
