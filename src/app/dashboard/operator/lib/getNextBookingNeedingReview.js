// src/lib/getNextBookingNeedingReview.js
import { bookingNeedsReview } from "@/app/dashboard/operator/lib/bookingNeedsReview";

export function getNextBookingNeedingReview(
  bookings,
  currentBookingId,
  now = new Date()
) {
  if (!bookings?.length) return null;

  const needingReview = bookings.filter((b) => bookingNeedsReview(b, now));

  if (needingReview.length === 0) return null;

  const currentIndex = needingReview.findIndex(
    (b) => b.id === currentBookingId
  );

  // If not found → start from first
  if (currentIndex === -1) return needingReview[0];

  // 🔁 LOOP instead of stopping
  return needingReview[(currentIndex + 1) % needingReview.length];
}
