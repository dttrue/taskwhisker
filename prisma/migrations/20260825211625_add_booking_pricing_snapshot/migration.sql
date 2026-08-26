-- CreateTable
CREATE TABLE "BookingPricingSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "economicsVersion" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "careOfferingId" TEXT,
    "careOfferingCode" TEXT NOT NULL,
    "careOfferingName" TEXT NOT NULL,
    "careOptionId" TEXT,
    "careOptionCode" TEXT NOT NULL,
    "careOptionLabel" TEXT NOT NULL,
    "primarySpecies" TEXT,
    "billingUnit" "CareBillingUnit" NOT NULL,
    "scheduleKind" "CareScheduleKind" NOT NULL,
    "durationMinutes" INTEGER,
    "quantity" INTEGER NOT NULL,
    "clientRateId" TEXT,
    "clientRateVersion" INTEGER NOT NULL,
    "serviceSubtotalCents" INTEGER NOT NULL,
    "clientFeeBasisPoints" INTEGER NOT NULL,
    "clientFeeCents" INTEGER NOT NULL,
    "clientTotalCents" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "BookingPricingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingPricingSnapshot_bookingId_key" ON "BookingPricingSnapshot"("bookingId");

-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_careOfferingId_idx" ON "BookingPricingSnapshot"("careOfferingId");

-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_careOptionId_idx" ON "BookingPricingSnapshot"("careOptionId");

-- CreateIndex
CREATE INDEX "BookingPricingSnapshot_clientRateId_idx" ON "BookingPricingSnapshot"("clientRateId");

-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_careOfferingId_fkey" FOREIGN KEY ("careOfferingId") REFERENCES "CareOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_careOptionId_fkey" FOREIGN KEY ("careOptionId") REFERENCES "CareOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPricingSnapshot" ADD CONSTRAINT "BookingPricingSnapshot_clientRateId_fkey" FOREIGN KEY ("clientRateId") REFERENCES "ClientCareRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
