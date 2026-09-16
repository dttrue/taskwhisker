-- CreateEnum
CREATE TYPE "CompensationPerformerPolicy" AS ENUM ('ORDINARY', 'OWNER_OPERATOR');

-- CreateEnum
CREATE TYPE "CompensationFeePolicy" AS ENUM ('STANDARD_10_PERCENT', 'REWARD_5_PERCENT', 'OWNER_0_PERCENT');

-- AlterEnum
ALTER TYPE "BookingSitterRateSource" ADD VALUE 'OWNER_FROZEN_CLIENT_SERVICE';

-- AlterTable
ALTER TABLE "BookingSitterCompensation" ADD COLUMN     "feePolicy" "CompensationFeePolicy",
ADD COLUMN     "performerPolicy" "CompensationPerformerPolicy";

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "canonicalUnitPosition" INTEGER;

-- CreateTable
CREATE TABLE "VisitSitterCompensationAuthorization" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "predecessorId" TEXT,
    "sitterId" TEXT NOT NULL,
    "compensationLane" "BookingCompensationLane" NOT NULL,
    "performerPolicy" "CompensationPerformerPolicy" NOT NULL,
    "feePolicy" "CompensationFeePolicy" NOT NULL,
    "currency" TEXT NOT NULL,
    "canonicalUnitPosition" INTEGER NOT NULL,
    "unitBaseCents" INTEGER NOT NULL,
    "unitAdditionalPetCents" INTEGER NOT NULL,
    "unitServiceSubtotalCents" INTEGER NOT NULL,
    "sitterBaseCents" INTEGER NOT NULL,
    "sitterPetCents" INTEGER NOT NULL,
    "sitterCompensationSubtotalCents" INTEGER NOT NULL,
    "sitterFeeBasisPoints" INTEGER NOT NULL,
    "sitterFeeCents" INTEGER NOT NULL,
    "sitterPayoutCents" INTEGER NOT NULL,
    "rateSource" "BookingSitterRateSource" NOT NULL,
    "sourceRateId" TEXT,
    "rateVersion" INTEGER,
    "includedPetCount" INTEGER,
    "defaultAdditionalCents" INTEGER,
    "rewardReservationId" TEXT,
    "rewardGrantId" TEXT,
    "policyVersion" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitSitterCompensationAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitCompensationAuthorizationPetCharge" (
    "id" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "petPosition" INTEGER NOT NULL,
    "species" TEXT NOT NULL,
    "sourcePetChargeId" TEXT,
    "thresholdIncludedCount" INTEGER,
    "unitAmountCents" INTEGER NOT NULL,

    CONSTRAINT "VisitCompensationAuthorizationPetCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitCompensationAuthorizationVoid" (
    "id" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitCompensationAuthorizationVoid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitSitterCompensationAllocation" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "performedBySitterId" TEXT NOT NULL,
    "compensationLane" "BookingCompensationLane" NOT NULL,
    "performerPolicy" "CompensationPerformerPolicy" NOT NULL,
    "feePolicy" "CompensationFeePolicy" NOT NULL,
    "currency" TEXT NOT NULL,
    "sitterCompensationSubtotalCents" INTEGER NOT NULL,
    "sitterFeeBasisPoints" INTEGER NOT NULL,
    "sitterFeeCents" INTEGER NOT NULL,
    "sitterPayoutCents" INTEGER NOT NULL,
    "rewardReservationId" TEXT,
    "rewardGrantId" TEXT,
    "allocatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitSitterCompensationAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitFinancialReview" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "authorizationId" TEXT,
    "performedBySitterId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitFinancialReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitSitterCompensationAuthorization_predecessorId_key" ON "VisitSitterCompensationAuthorization"("predecessorId");

-- CreateIndex
CREATE INDEX "VisitSitterCompensationAuthorization_bookingId_idx" ON "VisitSitterCompensationAuthorization"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitSitterCompensationAuthorization_visitId_revision_key" ON "VisitSitterCompensationAuthorization"("visitId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "VisitSitterCompensationAuthorization_visitId_operationId_key" ON "VisitSitterCompensationAuthorization"("visitId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitCompensationAuthorizationPetCharge_authorizationId_pet_key" ON "VisitCompensationAuthorizationPetCharge"("authorizationId", "petPosition");

-- CreateIndex
CREATE UNIQUE INDEX "VisitCompensationAuthorizationVoid_authorizationId_key" ON "VisitCompensationAuthorizationVoid"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitSitterCompensationAllocation_visitId_key" ON "VisitSitterCompensationAllocation"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitSitterCompensationAllocation_authorizationId_key" ON "VisitSitterCompensationAllocation"("authorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitFinancialReview_visitId_reason_evidenceKey_key" ON "VisitFinancialReview"("visitId", "reason", "evidenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_bookingId_canonicalUnitPosition_key" ON "Visit"("bookingId", "canonicalUnitPosition");

-- AddForeignKey
ALTER TABLE "VisitSitterCompensationAuthorization" ADD CONSTRAINT "VisitSitterCompensationAuthorization_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSitterCompensationAuthorization" ADD CONSTRAINT "VisitSitterCompensationAuthorization_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "BookingSitterCompensation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSitterCompensationAuthorization" ADD CONSTRAINT "VisitSitterCompensationAuthorization_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSitterCompensationAuthorization" ADD CONSTRAINT "VisitSitterCompensationAuthorization_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "VisitSitterCompensationAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitCompensationAuthorizationPetCharge" ADD CONSTRAINT "VisitCompensationAuthorizationPetCharge_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "VisitSitterCompensationAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitCompensationAuthorizationVoid" ADD CONSTRAINT "VisitCompensationAuthorizationVoid_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "VisitSitterCompensationAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSitterCompensationAllocation" ADD CONSTRAINT "VisitSitterCompensationAllocation_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSitterCompensationAllocation" ADD CONSTRAINT "VisitSitterCompensationAllocation_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "VisitSitterCompensationAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSitterCompensationAllocation" ADD CONSTRAINT "VisitSitterCompensationAllocation_performedBySitterId_fkey" FOREIGN KEY ("performedBySitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitFinancialReview" ADD CONSTRAINT "VisitFinancialReview_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "BookingSitterCompensation" DROP CONSTRAINT "BookingSitterCompensation_money_check";
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_money_check" CHECK (
  (
  "currency" = 'USD' AND "quantity" BETWEEN 1 AND 366 AND
  "sitterCompensationSubtotalCents" >= 0 AND "sitterFeeCents" >= 0 AND "sitterPayoutCents" >= 0 AND
  "sitterCompensationSubtotalCents"::bigint = "sitterFeeCents"::bigint + "sitterPayoutCents"::bigint AND
  "sitterFeeBasisPoints" IN (500, 1000)
  ) OR COALESCE(("performerPolicy" = 'OWNER_OPERATOR' AND "feePolicy" = 'OWNER_0_PERCENT' AND
  "currency" = 'USD' AND "quantity" BETWEEN 1 AND 366 AND
  "rateSource"::text = 'OWNER_FROZEN_CLIENT_SERVICE' AND
  "clientServiceSubtotalCents" IS NOT NULL AND "clientServiceSubtotalCents" >= 0 AND
  "sitterCompensationSubtotalCents" = "clientServiceSubtotalCents" AND
  "sitterPayoutCents" = "sitterCompensationSubtotalCents" AND "sitterFeeCents" = 0 AND "sitterFeeBasisPoints" = 0 AND
  NOT "rewardApplied" AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL AND "rewardLevel" IS NULL AND
  "clientBaseAggregateCents" IS NULL AND "sourceRateId" IS NULL AND "rateVersion" IS NULL AND
  "baseUnitCompensationCents" IS NULL AND "baseAggregateCompensationCents" IS NULL AND "additionalPetCompensationCents" IS NULL AND
  "includedPetCount" IS NULL AND "defaultAdditionalCents" IS NULL), false)
);

ALTER TABLE "BookingSitterCompensation" DROP CONSTRAINT "BookingSitterCompensation_reward_check";
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_reward_check" CHECK (
  (
  ("rewardApplied" AND "compensationLane" = 'SITTER_ORIGINATED' AND "sitterFeeBasisPoints" = 500 AND
   "rewardReservationId" IS NOT NULL AND "rewardGrantId" IS NOT NULL AND "rewardLevel" IS NOT NULL AND "rewardLevel" >= 1)
  OR (NOT "rewardApplied" AND "sitterFeeBasisPoints" = 1000 AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL AND "rewardLevel" IS NULL)
  ) OR COALESCE(("performerPolicy" = 'OWNER_OPERATOR' AND "feePolicy" = 'OWNER_0_PERCENT' AND
  "currency" = 'USD' AND "quantity" BETWEEN 1 AND 366 AND
  "rateSource"::text = 'OWNER_FROZEN_CLIENT_SERVICE' AND
  "clientServiceSubtotalCents" IS NOT NULL AND "clientServiceSubtotalCents" >= 0 AND
  "sitterCompensationSubtotalCents" = "clientServiceSubtotalCents" AND
  "sitterPayoutCents" = "sitterCompensationSubtotalCents" AND "sitterFeeCents" = 0 AND "sitterFeeBasisPoints" = 0 AND
  NOT "rewardApplied" AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL AND "rewardLevel" IS NULL AND
  "clientBaseAggregateCents" IS NULL AND "sourceRateId" IS NULL AND "rateVersion" IS NULL AND
  "baseUnitCompensationCents" IS NULL AND "baseAggregateCompensationCents" IS NULL AND "additionalPetCompensationCents" IS NULL AND
  "includedPetCount" IS NULL AND "defaultAdditionalCents" IS NULL), false)
);

ALTER TABLE "BookingSitterCompensation" DROP CONSTRAINT "BookingSitterCompensation_source_check";
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingSitterCompensation_source_check" CHECK (
  (
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
  ) OR COALESCE(("performerPolicy" = 'OWNER_OPERATOR' AND "feePolicy" = 'OWNER_0_PERCENT' AND
  "currency" = 'USD' AND "quantity" BETWEEN 1 AND 366 AND
  "rateSource"::text = 'OWNER_FROZEN_CLIENT_SERVICE' AND
  "clientServiceSubtotalCents" IS NOT NULL AND "clientServiceSubtotalCents" >= 0 AND
  "sitterCompensationSubtotalCents" = "clientServiceSubtotalCents" AND
  "sitterPayoutCents" = "sitterCompensationSubtotalCents" AND "sitterFeeCents" = 0 AND "sitterFeeBasisPoints" = 0 AND
  NOT "rewardApplied" AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL AND "rewardLevel" IS NULL AND
  "clientBaseAggregateCents" IS NULL AND "sourceRateId" IS NULL AND "rateVersion" IS NULL AND
  "baseUnitCompensationCents" IS NULL AND "baseAggregateCompensationCents" IS NULL AND "additionalPetCompensationCents" IS NULL AND
  "includedPetCount" IS NULL AND "defaultAdditionalCents" IS NULL), false)
);

-- Historical rows retain a NULL policy pair; new writers always specify both.
ALTER TABLE "BookingSitterCompensation" ADD CONSTRAINT "BookingCompensation_policy_check" CHECK (
 ("performerPolicy" IS NULL AND "feePolicy" IS NULL AND "sitterFeeBasisPoints" IN (500,1000) AND "rateSource"::text <> 'OWNER_FROZEN_CLIENT_SERVICE') OR
 ("performerPolicy" IS NOT NULL AND "feePolicy" IS NOT NULL AND (
  ("performerPolicy" = 'ORDINARY' AND (("feePolicy" = 'STANDARD_10_PERCENT' AND "sitterFeeBasisPoints" = 1000 AND NOT "rewardApplied") OR
   ("feePolicy" = 'REWARD_5_PERCENT' AND "sitterFeeBasisPoints" = 500 AND "rewardApplied"))) OR
  ("performerPolicy" = 'OWNER_OPERATOR' AND "feePolicy" = 'OWNER_0_PERCENT' AND "sitterFeeBasisPoints" = 0)))
);
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_unit_position_check" CHECK ("canonicalUnitPosition" IS NULL OR "canonicalUnitPosition" >= 0);

ALTER TABLE "VisitSitterCompensationAuthorization" ADD CONSTRAINT "VisitSitterCompensationAuthorization_money" CHECK (
 "currency" = 'USD' AND "sitterCompensationSubtotalCents" >= 0 AND "sitterFeeCents" >= 0 AND "sitterPayoutCents" >= 0 AND
 "sitterCompensationSubtotalCents"::bigint = "sitterFeeCents"::bigint + "sitterPayoutCents"::bigint AND
 "sitterFeeCents"::bigint = ("sitterCompensationSubtotalCents"::bigint * "sitterFeeBasisPoints" + 5000) / 10000 AND
 (("performerPolicy" = 'OWNER_OPERATOR' AND "feePolicy" = 'OWNER_0_PERCENT' AND "sitterFeeBasisPoints" = 0 AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL) OR
 ("performerPolicy" = 'ORDINARY' AND "feePolicy" = 'STANDARD_10_PERCENT' AND "sitterFeeBasisPoints" = 1000 AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL) OR
 ("performerPolicy" = 'ORDINARY' AND "compensationLane" = 'SITTER_ORIGINATED' AND "feePolicy" = 'REWARD_5_PERCENT' AND "sitterFeeBasisPoints" = 500 AND "rewardReservationId" IS NOT NULL AND "rewardGrantId" IS NOT NULL))
);

ALTER TABLE "VisitSitterCompensationAllocation" ADD CONSTRAINT "VisitSitterCompensationAllocation_money" CHECK (
 "currency" = 'USD' AND "sitterCompensationSubtotalCents" >= 0 AND "sitterFeeCents" >= 0 AND "sitterPayoutCents" >= 0 AND
 "sitterCompensationSubtotalCents"::bigint = "sitterFeeCents"::bigint + "sitterPayoutCents"::bigint AND
 "sitterFeeCents"::bigint = ("sitterCompensationSubtotalCents"::bigint * "sitterFeeBasisPoints" + 5000) / 10000 AND
 (("performerPolicy" = 'OWNER_OPERATOR' AND "feePolicy" = 'OWNER_0_PERCENT' AND "sitterFeeBasisPoints" = 0 AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL) OR
 ("performerPolicy" = 'ORDINARY' AND "feePolicy" = 'STANDARD_10_PERCENT' AND "sitterFeeBasisPoints" = 1000 AND "rewardReservationId" IS NULL AND "rewardGrantId" IS NULL) OR
 ("performerPolicy" = 'ORDINARY' AND "compensationLane" = 'SITTER_ORIGINATED' AND "feePolicy" = 'REWARD_5_PERCENT' AND "sitterFeeBasisPoints" = 500 AND "rewardReservationId" IS NOT NULL AND "rewardGrantId" IS NOT NULL))
);

ALTER TABLE "VisitSitterCompensationAuthorization" ADD CONSTRAINT "VisitAuthorization_components" CHECK (
 "canonicalUnitPosition" >= 0 AND "revision" >= 1 AND "policyVersion" = 1 AND
 (("revision" = 1 AND "predecessorId" IS NULL) OR ("revision" > 1 AND "predecessorId" IS NOT NULL)) AND
 "unitBaseCents" >= 0 AND "unitAdditionalPetCents" >= 0 AND "unitServiceSubtotalCents" >= 0 AND
 "unitServiceSubtotalCents"::bigint = "unitBaseCents"::bigint + "unitAdditionalPetCents"::bigint AND
 "sitterBaseCents" >= 0 AND "sitterPetCents" >= 0 AND "sitterCompensationSubtotalCents"::bigint = "sitterBaseCents"::bigint + "sitterPetCents"::bigint AND
 length("actorUserId") > 0 AND length("reason") > 0 AND length("operationId") > 0 AND
 (("performerPolicy" = 'OWNER_OPERATOR' AND "rateSource"::text = 'OWNER_FROZEN_CLIENT_SERVICE' AND "sourceRateId" IS NULL AND "rateVersion" IS NULL AND
   "sitterBaseCents" = "unitBaseCents" AND "sitterPetCents" = "unitAdditionalPetCents") OR
  ("performerPolicy" = 'ORDINARY' AND "compensationLane" = 'SITTER_ORIGINATED' AND "rateSource"::text = 'CANONICAL_CLIENT_SERVICE_SUBTOTAL' AND
   "sourceRateId" IS NULL AND "rateVersion" IS NULL AND "sitterBaseCents" = "unitBaseCents" AND "sitterPetCents" = "unitAdditionalPetCents") OR
  ("performerPolicy" = 'ORDINARY' AND "compensationLane" = 'BUSINESS_ASSIGNED' AND "rateSource"::text IN ('SITTER_OVERRIDE','DEFAULT_RATE') AND
   "sourceRateId" IS NOT NULL AND "rateVersion" IS NOT NULL AND "rateVersion" >= 1 AND "sitterBaseCents"::bigint * 10000 <= "unitBaseCents"::bigint * 9000))
);
ALTER TABLE "VisitCompensationAuthorizationPetCharge" ADD CONSTRAINT "VisitAuthorizationPet_money" CHECK (
 "petPosition" >= 0 AND "unitAmountCents" >= 0 AND
 (("sourcePetChargeId" IS NULL AND "thresholdIncludedCount" IS NULL) OR ("sourcePetChargeId" IS NOT NULL AND "thresholdIncludedCount" >= 0))
);
ALTER TABLE "VisitFinancialReview" ADD CONSTRAINT "VisitFinancialReview_reason" CHECK ("reason" IN (
 'PERFORMER_REQUIRED_FOR_ALLOCATION', 'PERFORMER_AUTHORIZATION_MISMATCH', 'AUTHORIZATION_MISSING', 'AUTHORIZATION_INVALID', 'FINANCIAL_READINESS_MISSING'));

CREATE FUNCTION "protectVisitFinancialHistory"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Visit financial history is immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "VisitAuthorization_immutable" BEFORE UPDATE ON "VisitSitterCompensationAuthorization" FOR EACH ROW EXECUTE FUNCTION "protectVisitFinancialHistory"();
CREATE TRIGGER "VisitAuthorizationPet_immutable" BEFORE UPDATE ON "VisitCompensationAuthorizationPetCharge" FOR EACH ROW EXECUTE FUNCTION "protectVisitFinancialHistory"();
CREATE TRIGGER "VisitAuthorizationVoid_immutable" BEFORE UPDATE ON "VisitCompensationAuthorizationVoid" FOR EACH ROW EXECUTE FUNCTION "protectVisitFinancialHistory"();
CREATE TRIGGER "VisitAllocation_immutable" BEFORE UPDATE ON "VisitSitterCompensationAllocation" FOR EACH ROW EXECUTE FUNCTION "protectVisitFinancialHistory"();
CREATE TRIGGER "VisitReview_immutable" BEFORE UPDATE ON "VisitFinancialReview" FOR EACH ROW EXECUTE FUNCTION "protectVisitFinancialHistory"();
CREATE FUNCTION "protectVisitUnitPosition"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."canonicalUnitPosition" IS DISTINCT FROM OLD."canonicalUnitPosition" THEN
   RAISE EXCEPTION 'Canonical unit position is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Visit_position_immutable" BEFORE UPDATE ON "Visit" FOR EACH ROW EXECUTE FUNCTION "protectVisitUnitPosition"();
