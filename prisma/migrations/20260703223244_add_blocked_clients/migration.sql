-- CreateTable
CREATE TABLE "BlockedClient" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,

    CONSTRAINT "BlockedClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedClient_email_idx" ON "BlockedClient"("email");

-- CreateIndex
CREATE INDEX "BlockedClient_phone_idx" ON "BlockedClient"("phone");

-- CreateIndex
CREATE INDEX "BlockedClient_name_idx" ON "BlockedClient"("name");

-- CreateIndex
CREATE INDEX "BlockedClient_postalCode_idx" ON "BlockedClient"("postalCode");

-- CreateIndex
CREATE INDEX "BlockedClient_isActive_idx" ON "BlockedClient"("isActive");

-- CreateIndex
CREATE INDEX "BlockedClient_createdByUserId_idx" ON "BlockedClient"("createdByUserId");

-- AddForeignKey
ALTER TABLE "BlockedClient" ADD CONSTRAINT "BlockedClient_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
