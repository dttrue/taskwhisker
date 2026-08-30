/*
  Warnings:

  - Added the required column `occurredAt` to the `SitterRewardEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SitterRewardEvent" ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "SitterRewardEvent_sitterId_rewardCycle_occurredAt_idx" ON "SitterRewardEvent"("sitterId", "rewardCycle", "occurredAt");
