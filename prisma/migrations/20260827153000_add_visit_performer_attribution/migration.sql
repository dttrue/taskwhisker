-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "performedBySitterId" TEXT;

-- CreateIndex
CREATE INDEX "Visit_performedBySitterId_idx" ON "Visit"("performedBySitterId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_performedBySitterId_fkey" FOREIGN KEY ("performedBySitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
