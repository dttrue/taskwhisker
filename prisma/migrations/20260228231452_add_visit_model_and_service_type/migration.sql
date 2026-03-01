-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('OVERNIGHT', 'WALK', 'DROP_IN');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "operatorId" TEXT,
ADD COLUMN     "serviceType" "ServiceType";

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "sitterId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'CONFIRMED',

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visit_bookingId_idx" ON "Visit"("bookingId");

-- CreateIndex
CREATE INDEX "Visit_operatorId_date_idx" ON "Visit"("operatorId", "date");

-- CreateIndex
CREATE INDEX "Visit_sitterId_date_idx" ON "Visit"("sitterId", "date");

-- CreateIndex
CREATE INDEX "Visit_startTime_endTime_idx" ON "Visit"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "Booking_operatorId_startTime_idx" ON "Booking"("operatorId", "startTime");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
