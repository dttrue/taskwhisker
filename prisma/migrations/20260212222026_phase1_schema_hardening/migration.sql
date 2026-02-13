/*
  Warnings:

  - You are about to drop the column `serviceName` on the `Booking` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "serviceName",
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "serviceSummary" TEXT,
ALTER COLUMN "status" SET DEFAULT 'REQUESTED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Booking_startTime_idx" ON "Booking"("startTime");

-- CreateIndex
CREATE INDEX "Booking_status_startTime_idx" ON "Booking"("status", "startTime");

-- CreateIndex
CREATE INDEX "Booking_clientId_startTime_idx" ON "Booking"("clientId", "startTime");

-- CreateIndex
CREATE INDEX "Booking_sitterId_startTime_idx" ON "Booking"("sitterId", "startTime");

-- CreateIndex
CREATE INDEX "BookingHistory_bookingId_createdAt_idx" ON "BookingHistory"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- AddForeignKey
ALTER TABLE "BookingHistory" ADD CONSTRAINT "BookingHistory_fromSitterId_fkey" FOREIGN KEY ("fromSitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHistory" ADD CONSTRAINT "BookingHistory_toSitterId_fkey" FOREIGN KEY ("toSitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
