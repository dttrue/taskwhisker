-- CreateTable
CREATE TABLE "SitterReferralCode" (
    "id" TEXT NOT NULL,
    "sitterId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "activeSitterKey" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "revokedByUserId" TEXT,
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SitterReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SitterReferralCode_codeHash_key" ON "SitterReferralCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "SitterReferralCode_activeSitterKey_key" ON "SitterReferralCode"("activeSitterKey");

-- CreateIndex
CREATE INDEX "SitterReferralCode_sitterId_createdAt_idx" ON "SitterReferralCode"("sitterId", "createdAt");

-- CreateIndex
CREATE INDEX "SitterReferralCode_createdByUserId_idx" ON "SitterReferralCode"("createdByUserId");

-- CreateIndex
CREATE INDEX "SitterReferralCode_revokedByUserId_idx" ON "SitterReferralCode"("revokedByUserId");

-- CreateIndex
CREATE INDEX "SitterReferralCode_revokedAt_idx" ON "SitterReferralCode"("revokedAt");

-- AddForeignKey
ALTER TABLE "SitterReferralCode" ADD CONSTRAINT "SitterReferralCode_sitterId_fkey" FOREIGN KEY ("sitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterReferralCode" ADD CONSTRAINT "SitterReferralCode_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitterReferralCode" ADD CONSTRAINT "SitterReferralCode_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
