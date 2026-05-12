-- AlterTable
ALTER TABLE "BookingHistory" ADD COLUMN     "missedVisitReviewNote" TEXT,
ADD COLUMN     "missedVisitReviewStatus" TEXT,
ADD COLUMN     "missedVisitReviewedAt" TIMESTAMP(3),
ADD COLUMN     "missedVisitReviewedById" TEXT;

-- CreateIndex
CREATE INDEX "BookingHistory_missedVisitReviewStatus_idx" ON "BookingHistory"("missedVisitReviewStatus");

-- CreateIndex
CREATE INDEX "BookingHistory_missedVisitReviewedById_idx" ON "BookingHistory"("missedVisitReviewedById");

-- AddForeignKey
ALTER TABLE "BookingHistory" ADD CONSTRAINT "BookingHistory_missedVisitReviewedById_fkey" FOREIGN KEY ("missedVisitReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
