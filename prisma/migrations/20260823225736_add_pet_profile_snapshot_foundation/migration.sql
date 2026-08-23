-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPet" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "petId" TEXT,
    "position" INTEGER NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "speciesSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingPet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pet_clientId_archivedAt_idx" ON "Pet"("clientId", "archivedAt");

-- CreateIndex
CREATE INDEX "BookingPet_bookingId_idx" ON "BookingPet"("bookingId");

-- CreateIndex
CREATE INDEX "BookingPet_petId_idx" ON "BookingPet"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPet_bookingId_position_key" ON "BookingPet"("bookingId", "position");

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPet" ADD CONSTRAINT "BookingPet_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPet" ADD CONSTRAINT "BookingPet_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
