-- No defaults or backfill: existing bookings retain unknown care provenance.
ALTER TABLE "Booking"
  ADD COLUMN "careInstructions" TEXT,
  ADD COLUMN "careInstructionsVersion" INTEGER;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_care_snapshot_check"
  CHECK (("careInstructionsVersion" IS NULL AND "careInstructions" IS NULL)
    OR ("careInstructionsVersion" IS NOT NULL AND "careInstructionsVersion" = 1));
