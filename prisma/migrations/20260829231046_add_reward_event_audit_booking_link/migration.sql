-- AlterTable
ALTER TABLE "SitterRewardEvent" ADD COLUMN     "auditBookingId" TEXT;

-- CreateIndex
CREATE INDEX "SitterRewardEvent_auditBookingId_createdAt_idx" ON "SitterRewardEvent"("auditBookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "SitterRewardEvent" ADD CONSTRAINT "SitterRewardEvent_auditBookingId_fkey" FOREIGN KEY ("auditBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
