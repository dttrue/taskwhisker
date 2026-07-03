-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancellationFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancellationFeeRateBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancellationFeeReviewedAt" TIMESTAMP(3),
ADD COLUMN     "cancellationFeeReviewedById" TEXT,
ADD COLUMN     "cancellationFeeWaived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Booking_cancellationFeeReviewedById_idx" ON "Booking"("cancellationFeeReviewedById");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancellationFeeReviewedById_fkey" FOREIGN KEY ("cancellationFeeReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
