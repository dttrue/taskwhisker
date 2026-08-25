-- DropIndex
DROP INDEX "ClientCareRatePetCharge_clientRateId_species_key";

-- DropIndex
DROP INDEX "DefaultSitterCareRatePetCharge_defaultRateId_species_key";

-- DropIndex
DROP INDEX "SitterCareRatePetCharge_sitterRateId_species_key";

-- AlterTable
ALTER TABLE "CareOption" ADD COLUMN     "primarySpecies" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClientCareRatePetCharge_clientRateId_species_includedCount_key" ON "ClientCareRatePetCharge"("clientRateId", "species", "includedCount");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultSitterCareRatePetCharge_defaultRateId_species_includ_key" ON "DefaultSitterCareRatePetCharge"("defaultRateId", "species", "includedCount");

-- CreateIndex
CREATE UNIQUE INDEX "SitterCareRatePetCharge_sitterRateId_species_includedCount_key" ON "SitterCareRatePetCharge"("sitterRateId", "species", "includedCount");
