-- CreateEnum
CREATE TYPE "RewardGrantStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RewardReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "RewardEventType" AS ENUM ('QUALIFYING_COMPLETION', 'QUALIFICATION_REVERSAL', 'OPERATOR_PROGRESS_ADJUSTMENT', 'OPERATOR_LEVEL_ADJUSTMENT', 'GRANT_REVOKED');

-- CreateTable
CREATE TABLE "SitterRewardAccount" (
    "id" TEXT NOT NULL,
    "sitterId" TEXT NOT NULL,
    "rewardLevel" INTEGER NOT NULL DEFAULT 0,
    "progressCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "currentGrantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitterRewardAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitterRewardEvent" (
    "id" TEXT NOT NULL,
    "sitterId" TEXT NOT NULL,
    "bookingId" TEXT,
    "grantId" TEXT,
    "type" "RewardEventType" NOT NULL,
    "progressDelta" INTEGER NOT NULL,
    "rewardCycle" INTEGER NOT NULL,
    "reversesEventId" TEXT,
    "reason" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitterRewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitterRewardGrant" (
    "id" TEXT NOT NULL,
    "sitterId" TEXT NOT NULL,
    "rewardLevel" INTEGER NOT NULL,
    "feeBasisPoints" INTEGER NOT NULL,
    "maximumUses" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RewardGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "triggerEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitterRewardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitterRewardReservation" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sitterId" TEXT NOT NULL,
    "status" "RewardReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitterRewardReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitterRewardAccount_sitterId_key" ON "SitterRewardAccount"("sitterId");

-- CreateIndex
CREATE UNIQUE INDEX "SitterRewardAccount_currentGrantId_key" ON "SitterRewardAccount"("currentGrantId");

-- CreateIndex
CREATE INDEX "SitterRewardAccount_rewardLevel_idx" ON "SitterRewardAccount"("rewardLevel");

-- CreateIndex
CREATE UNIQUE INDEX "SitterRewardEvent_bookingId_key" ON "SitterRewardEvent"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "SitterRewardEvent_reversesEventId_key" ON "SitterRewardEvent"("reversesEventId");

-- CreateIndex
CREATE INDEX "SitterRewardEvent_sitterId_rewardCycle_createdAt_idx" ON "SitterRewardEvent"("sitterId", "rewardCycle", "createdAt");

-- CreateIndex
CREATE INDEX "SitterRewardEvent_grantId_createdAt_idx" ON "SitterRewardEvent"("grantId", "createdAt");

-- CreateIndex
CREATE INDEX "SitterRewardEvent_type_createdAt_idx" ON "SitterRewardEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SitterRewardEvent_actorUserId_idx" ON "SitterRewardEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SitterRewardGrant_triggerEventId_key" ON "SitterRewardGrant"("triggerEventId");

-- CreateIndex
CREATE INDEX "SitterRewardGrant_sitterId_status_expiresAt_idx" ON "SitterRewardGrant"("sitterId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "SitterRewardGrant_status_expiresAt_idx" ON "SitterRewardGrant"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SitterRewardReservation_bookingId_key" ON "SitterRewardReservation"("bookingId");

-- CreateIndex
CREATE INDEX "SitterRewardReservation_grantId_status_idx" ON "SitterRewardReservation"("grantId", "status");

-- CreateIndex
CREATE INDEX "SitterRewardReservation_sitterId_status_idx" ON "SitterRewardReservation"("sitterId", "status");

-- AddForeignKey
ALTER TABLE "SitterRewardAccount" ADD CONSTRAINT "SitterRewardAccount_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardAccount" ADD CONSTRAINT "SitterRewardAccount_currentGrantId_fkey" FOREIGN KEY ("currentGrantId") REFERENCES "SitterRewardGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardEvent" ADD CONSTRAINT "SitterRewardEvent_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardEvent" ADD CONSTRAINT "SitterRewardEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardEvent" ADD CONSTRAINT "SitterRewardEvent_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "SitterRewardGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardEvent" ADD CONSTRAINT "SitterRewardEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardEvent" ADD CONSTRAINT "SitterRewardEvent_reversesEventId_fkey" FOREIGN KEY ("reversesEventId") REFERENCES "SitterRewardEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardGrant" ADD CONSTRAINT "SitterRewardGrant_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardGrant" ADD CONSTRAINT "SitterRewardGrant_triggerEventId_fkey" FOREIGN KEY ("triggerEventId") REFERENCES "SitterRewardEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardReservation" ADD CONSTRAINT "SitterRewardReservation_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "SitterRewardGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardReservation" ADD CONSTRAINT "SitterRewardReservation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterRewardReservation" ADD CONSTRAINT "SitterRewardReservation_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
