-- No backfill or data changes. Legacy economics retain every existing value.
ALTER TABLE "Booking"
  ALTER COLUMN "clientTotalCents" DROP NOT NULL,
  ALTER COLUMN "platformFeeCents" DROP NOT NULL,
  ALTER COLUMN "sitterPayoutCents" DROP NOT NULL,
  ADD COLUMN "canonicalCreationKey" TEXT,
  ADD COLUMN "canonicalInputHash" TEXT,
  ADD COLUMN "careOfferingId" TEXT,
  ADD COLUMN "careOfferingCode" TEXT,
  ADD COLUMN "careOptionId" TEXT,
  ADD COLUMN "careOptionCode" TEXT,
  ADD COLUMN "billingUnit" "CareBillingUnit",
  ADD COLUMN "scheduleKind" "CareScheduleKind",
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "quantity" INTEGER,
  ADD COLUMN "scheduleTimeZone" TEXT,
  ADD COLUMN "canonicalSchedule" JSONB;

CREATE UNIQUE INDEX "Booking_canonicalCreationKey_key" ON "Booking"("canonicalCreationKey");

-- Preflight requires zero existing pricing snapshots; never fabricate history.
ALTER TABLE "BookingPricingSnapshot"
  ADD COLUMN "baseUnitCents" INTEGER NOT NULL,
  ADD COLUMN "baseAggregateCents" INTEGER NOT NULL,
  ADD COLUMN "additionalPetAggregateCents" INTEGER NOT NULL,
  ADD COLUMN "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
