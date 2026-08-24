-- CreateEnum
CREATE TYPE "CareBillingUnit" AS ENUM ('VISIT', 'NIGHT');

-- CreateEnum
CREATE TYPE "CareScheduleKind" AS ENUM ('TIMED_VISIT', 'OVERNIGHT_STAY');

-- CreateTable
CREATE TABLE "CareOffering" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billingUnit" "CareBillingUnit" NOT NULL,
    "scheduleKind" "CareScheduleKind" NOT NULL,
    "allowsMixedSpecies" BOOLEAN NOT NULL DEFAULT false,
    "allowsUnlistedSpecies" BOOLEAN NOT NULL DEFAULT false,
    "minimumPetCount" INTEGER NOT NULL DEFAULT 1,
    "maximumPetCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareOption" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareSpeciesPolicy" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "isSupported" BOOLEAN NOT NULL DEFAULT true,
    "minimumCount" INTEGER NOT NULL DEFAULT 0,
    "maximumCount" INTEGER,

    CONSTRAINT "CareSpeciesPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCareRate" (
    "id" TEXT NOT NULL,
    "careOptionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "baseRateCents" INTEGER NOT NULL,
    "includedPetCount" INTEGER NOT NULL DEFAULT 1,
    "defaultAdditionalCents" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "setByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCareRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCareRatePetCharge" (
    "id" TEXT NOT NULL,
    "clientRateId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "includedCount" INTEGER NOT NULL DEFAULT 0,
    "additionalCents" INTEGER NOT NULL,

    CONSTRAINT "ClientCareRatePetCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultSitterCareRate" (
    "id" TEXT NOT NULL,
    "careOptionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "baseCompensationCents" INTEGER NOT NULL,
    "includedPetCount" INTEGER NOT NULL DEFAULT 1,
    "defaultAdditionalCents" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "setByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultSitterCareRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultSitterCareRatePetCharge" (
    "id" TEXT NOT NULL,
    "defaultRateId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "includedCount" INTEGER NOT NULL DEFAULT 0,
    "additionalCents" INTEGER NOT NULL,

    CONSTRAINT "DefaultSitterCareRatePetCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitterCareRate" (
    "id" TEXT NOT NULL,
    "careOptionId" TEXT NOT NULL,
    "sitterId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "baseCompensationCents" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "setByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitterCareRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitterCareRatePetCharge" (
    "id" TEXT NOT NULL,
    "sitterRateId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "includedCount" INTEGER NOT NULL DEFAULT 0,
    "additionalCents" INTEGER NOT NULL,

    CONSTRAINT "SitterCareRatePetCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyServiceMapping" (
    "id" TEXT NOT NULL,
    "legacyServiceId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "optionId" TEXT,
    "notes" TEXT,

    CONSTRAINT "LegacyServiceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareOffering_code_key" ON "CareOffering"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CareOption_code_key" ON "CareOption"("code");

-- CreateIndex
CREATE INDEX "CareOption_offeringId_isActive_idx" ON "CareOption"("offeringId", "isActive");

-- CreateIndex
CREATE INDEX "CareSpeciesPolicy_offeringId_idx" ON "CareSpeciesPolicy"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "CareSpeciesPolicy_offeringId_species_key" ON "CareSpeciesPolicy"("offeringId", "species");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCareRate_careOptionId_key" ON "ClientCareRate"("careOptionId");

-- CreateIndex
CREATE INDEX "ClientCareRate_setByUserId_idx" ON "ClientCareRate"("setByUserId");

-- CreateIndex
CREATE INDEX "ClientCareRatePetCharge_clientRateId_idx" ON "ClientCareRatePetCharge"("clientRateId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCareRatePetCharge_clientRateId_species_key" ON "ClientCareRatePetCharge"("clientRateId", "species");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultSitterCareRate_careOptionId_key" ON "DefaultSitterCareRate"("careOptionId");

-- CreateIndex
CREATE INDEX "DefaultSitterCareRate_setByUserId_idx" ON "DefaultSitterCareRate"("setByUserId");

-- CreateIndex
CREATE INDEX "DefaultSitterCareRatePetCharge_defaultRateId_idx" ON "DefaultSitterCareRatePetCharge"("defaultRateId");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultSitterCareRatePetCharge_defaultRateId_species_key" ON "DefaultSitterCareRatePetCharge"("defaultRateId", "species");

-- CreateIndex
CREATE INDEX "SitterCareRate_sitterId_isActive_idx" ON "SitterCareRate"("sitterId", "isActive");

-- CreateIndex
CREATE INDEX "SitterCareRate_setByUserId_idx" ON "SitterCareRate"("setByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SitterCareRate_careOptionId_sitterId_key" ON "SitterCareRate"("careOptionId", "sitterId");

-- CreateIndex
CREATE INDEX "SitterCareRatePetCharge_sitterRateId_idx" ON "SitterCareRatePetCharge"("sitterRateId");

-- CreateIndex
CREATE UNIQUE INDEX "SitterCareRatePetCharge_sitterRateId_species_key" ON "SitterCareRatePetCharge"("sitterRateId", "species");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyServiceMapping_legacyServiceId_key" ON "LegacyServiceMapping"("legacyServiceId");

-- CreateIndex
CREATE INDEX "LegacyServiceMapping_offeringId_idx" ON "LegacyServiceMapping"("offeringId");

-- CreateIndex
CREATE INDEX "LegacyServiceMapping_optionId_idx" ON "LegacyServiceMapping"("optionId");

-- AddForeignKey
ALTER TABLE "CareOption" ADD CONSTRAINT "CareOption_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CareOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareSpeciesPolicy" ADD CONSTRAINT "CareSpeciesPolicy_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CareOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCareRate" ADD CONSTRAINT "ClientCareRate_careOptionId_fkey" FOREIGN KEY ("careOptionId") REFERENCES "CareOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCareRate" ADD CONSTRAINT "ClientCareRate_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCareRatePetCharge" ADD CONSTRAINT "ClientCareRatePetCharge_clientRateId_fkey" FOREIGN KEY ("clientRateId") REFERENCES "ClientCareRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultSitterCareRate" ADD CONSTRAINT "DefaultSitterCareRate_careOptionId_fkey" FOREIGN KEY ("careOptionId") REFERENCES "CareOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultSitterCareRate" ADD CONSTRAINT "DefaultSitterCareRate_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultSitterCareRatePetCharge" ADD CONSTRAINT "DefaultSitterCareRatePetCharge_defaultRateId_fkey" FOREIGN KEY ("defaultRateId") REFERENCES "DefaultSitterCareRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterCareRate" ADD CONSTRAINT "SitterCareRate_careOptionId_fkey" FOREIGN KEY ("careOptionId") REFERENCES "CareOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterCareRate" ADD CONSTRAINT "SitterCareRate_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterCareRate" ADD CONSTRAINT "SitterCareRate_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterCareRatePetCharge" ADD CONSTRAINT "SitterCareRatePetCharge_sitterRateId_fkey" FOREIGN KEY ("sitterRateId") REFERENCES "SitterCareRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyServiceMapping" ADD CONSTRAINT "LegacyServiceMapping_legacyServiceId_fkey" FOREIGN KEY ("legacyServiceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyServiceMapping" ADD CONSTRAINT "LegacyServiceMapping_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CareOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyServiceMapping" ADD CONSTRAINT "LegacyServiceMapping_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CareOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
