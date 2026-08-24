-- AlterTable
ALTER TABLE "SitterCareRate" ADD COLUMN     "defaultAdditionalCents" INTEGER,
ADD COLUMN     "includedPetCount" INTEGER NOT NULL DEFAULT 1;
