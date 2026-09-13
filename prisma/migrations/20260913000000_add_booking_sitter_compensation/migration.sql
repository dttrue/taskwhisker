-- CreateEnum
CREATE TYPE "BookingSitterRateSource" AS ENUM ('SITTER_OVERRIDE', 'DEFAULT_RATE', 'CANONICAL_CLIENT_SERVICE_SUBTOTAL');

-- CreateTable
CREATE TABLE "BookingSitterCompensation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sitterId" TEXT NOT NULL,
    "compensationLane" "BookingCompensationLane" NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "clientBaseAggregateCents" INTEGER,
    "clientServiceSubtotalCents" INTEGER,
    "sitterCompensationSubtotalCents" INTEGER NOT NULL,
    "sitterFeeBasisPoints" INTEGER NOT NULL,
    "sitterFeeCents" INTEGER NOT NULL,
    "sitterPayoutCents" INTEGER NOT NULL,
    "rateSource" "BookingSitterRateSource" NOT NULL,
    "sourceRateId" TEXT,
    "rateVersion" INTEGER,
    "baseUnitCompensationCents" INTEGER,
    "baseAggregateCompensationCents" INTEGER,
    "additionalPetCompensationCents" INTEGER,
    "includedPetCount" INTEGER,
    "defaultAdditionalCents" INTEGER,
    "rewardApplied" BOOLEAN NOT NULL DEFAULT false,
    "rewardReservationId" TEXT,
    "rewardGrantId" TEXT,
    "rewardLevel" INTEGER,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSitterCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSitterCompensationPetCharge" (
    "id" TEXT NOT NULL,
    "compensationId" TEXT NOT NULL,
    "petPosition" INTEGER NOT NULL,
    "species" TEXT NOT NULL,
    "sourcePetChargeId" TEXT,
    "thresholdIncludedCount" INTEGER,
    "unitAmountCents" INTEGER NOT NULL,
    "aggregateAmountCents" INTEGER NOT NULL,

    CONSTRAINT "BookingSitterCompensationPetCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingSitterCompensation_bookingId_key" ON "BookingSitterCompensation"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSitterCompensation_rewardReservationId_key" ON "BookingSitterCompensation"("rewardReservationId");

-- CreateIndex
CREATE INDEX "BookingSitterCompensation_sitterId_committedAt_idx" ON "BookingSitterCompensation"("sitterId", "committedAt");

-- CreateIndex
CREATE INDEX "BookingSitterCompensation_rewardGrantId_idx" ON "BookingSitterCompensation"("rewardGrantId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSitterCompensationPetCharge_compensationId_petPositi_key" ON "BookingSitterCompensationPetCharge"("compensationId", "petPosition");

-- AddForeignKey
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_rewardReservationId_fkey" FOREIGN KEY ("rewardReservationId") REFERENCES "SitterRewardReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_rewardGrantId_fkey" FOREIGN KEY ("rewardGrantId") REFERENCES "SitterRewardGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSitterCompensationPetCharge" ADD CONSTRAINT "BookingSitterCompensationPetCharge_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "BookingSitterCompensation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants on the new tables only; no historical mutations/backfill.
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_money_check" CHECK (
  "currency" = 'USD' AND "quantity" BETWEEN 1 AND 366 AND
  "sitterCompensationSubtotalCents" >= 0 AND "sitterFeeCents" >= 0 AND "sitterPayoutCents" >= 0 AND
  "sitterCompensationSubtotalCents"::bigint = "sitterFeeCents"::bigint + "sitterPayoutCents"::bigint AND
  "sitterFeeBasisPoints" IN (500, 1000)
);
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_reward_check" CHECK (
  ("rewardApplied" AND "compensationLane" = 'SITTER_ORIGINATED' AND "sitterFeeBasisPoints" = 500 AND
   "rewardReservationId" IS NOT NULL AND "rewardGrantId" IS NOT NULL AND "rewardLevel" IS NOT NULL AND "rewardLevel" >= 1)
  OR (NOT "rewardApplied" AND "sitterFeeBasisPoints" = 1000 AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL AND "rewardLevel" IS NULL)
);
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_source_check" CHECK (
  ("compensationLane" = 'SITTER_ORIGINATED' AND "rateSource" = 'CANONICAL_CLIENT_SERVICE_SUBTOTAL' AND
   "clientServiceSubtotalCents" IS NOT NULL AND "clientServiceSubtotalCents" = "sitterCompensationSubtotalCents" AND
   "clientBaseAggregateCents" IS NULL AND "sourceRateId" IS NULL AND "rateVersion" IS NULL AND
   "baseUnitCompensationCents" IS NULL AND "baseAggregateCompensationCents" IS NULL AND
   "additionalPetCompensationCents" IS NULL AND "includedPetCount" IS NULL AND "defaultAdditionalCents" IS NULL)
  OR ("compensationLane" = 'BUSINESS_ASSIGNED' AND "rateSource" IN ('DEFAULT_RATE', 'SITTER_OVERRIDE') AND
   "clientBaseAggregateCents" IS NOT NULL AND "clientBaseAggregateCents" >= 0 AND "clientServiceSubtotalCents" IS NULL AND
   "sourceRateId" IS NOT NULL AND "rateVersion" IS NOT NULL AND "rateVersion" >= 1 AND
   "baseUnitCompensationCents" IS NOT NULL AND "baseUnitCompensationCents" >= 0 AND
   "baseAggregateCompensationCents" IS NOT NULL AND "baseAggregateCompensationCents" >= 0 AND
   "additionalPetCompensationCents" IS NOT NULL AND "additionalPetCompensationCents" >= 0 AND
   "includedPetCount" IS NOT NULL AND "includedPetCount" >= 0 AND ("defaultAdditionalCents" IS NULL OR "defaultAdditionalCents" >= 0) AND
   "baseAggregateCompensationCents"::bigint = "baseUnitCompensationCents"::bigint * "quantity" AND
   "sitterCompensationSubtotalCents"::bigint = "baseAggregateCompensationCents"::bigint + "additionalPetCompensationCents"::bigint AND
   "baseAggregateCompensationCents"::bigint * 10000 <= "clientBaseAggregateCents"::bigint * 9000)
);
ALTER TABLE "BookingSitterCompensationPetCharge" ADD CONSTRAINT "BookingSitterCompensationPetCharge_money_check" CHECK (
  "petPosition" >= 0 AND "unitAmountCents" >= 0 AND "aggregateAmountCents" >= 0 AND
  (("sourcePetChargeId" IS NULL AND "thresholdIncludedCount" IS NULL) OR
   ("sourcePetChargeId" IS NOT NULL AND "thresholdIncludedCount" IS NOT NULL AND "thresholdIncludedCount" >= 0))
);
