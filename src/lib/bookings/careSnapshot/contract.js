// Only creation paths collecting client care text may call this writer contract.
// Never call it on stored generic Booking.notes or administrative fixture metadata.
export function captureCareInstructions(value) {
  if (value != null && typeof value !== "string") throw new Error("Care instructions must be text.");
  const text = value?.trim() || null;
  if (text && text.length > 1000) throw new Error("Care instructions must be at most 1000 characters.");
  return { careInstructionsVersion: 1, careInstructions: text };
}

export function participantCareReady(booking) {
  return booking?.careInstructionsVersion === 1 &&
    (booking.careInstructions == null || typeof booking.careInstructions === "string");
}
