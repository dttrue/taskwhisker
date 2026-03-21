-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "accessInstructions" TEXT,
ADD COLUMN     "locationNotes" TEXT,
ADD COLUMN     "serviceAddressLine1" TEXT,
ADD COLUMN     "serviceAddressLine2" TEXT,
ADD COLUMN     "serviceCity" TEXT,
ADD COLUMN     "serviceCountry" TEXT DEFAULT 'US',
ADD COLUMN     "serviceLat" DECIMAL(10,7),
ADD COLUMN     "serviceLng" DECIMAL(10,7),
ADD COLUMN     "servicePostalCode" TEXT,
ADD COLUMN     "serviceState" TEXT;
