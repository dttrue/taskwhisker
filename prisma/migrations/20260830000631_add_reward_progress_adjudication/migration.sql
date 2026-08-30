-- Otherwise-qualified completions can be permanently adjudicated without credit.
ALTER TYPE "RewardEventType" ADD VALUE 'PROGRESS_SUPPRESSED';

-- Nullable so later audit/reversal events can still reference the same Booking.
ALTER TABLE "SitterRewardEvent" ADD COLUMN "progressBookingId" TEXT;

CREATE UNIQUE INDEX "SitterRewardEvent_progressBookingId_key" ON "SitterRewardEvent"("progressBookingId");

ALTER TABLE "SitterRewardEvent" ADD CONSTRAINT "SitterRewardEvent_progressBookingId_fkey"
FOREIGN KEY ("progressBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
