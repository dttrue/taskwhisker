-- CreateEnum
CREATE TYPE "ClientOriginKind" AS ENUM ('BUSINESS', 'SITTER_REFERRAL');

-- CreateEnum
CREATE TYPE "ClientAttributionSource" AS ENUM ('BUSINESS_DEFAULT', 'REFERRAL_LINK', 'OPERATOR_VERIFIED');

-- CreateEnum
CREATE TYPE "BookingCompensationLane" AS ENUM ('BUSINESS_ASSIGNED', 'SITTER_ORIGINATED');

-- CreateTable
CREATE TABLE "ClientOrigin" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "ClientOriginKind" NOT NULL,
    "source" "ClientAttributionSource" NOT NULL,
    "referringSitterId" TEXT,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOriginEvent" (
    "id" TEXT NOT NULL,
    "clientOriginId" TEXT NOT NULL,
    "fromKind" "ClientOriginKind",
    "toKind" "ClientOriginKind" NOT NULL,
    "fromSource" "ClientAttributionSource",
    "toSource" "ClientAttributionSource" NOT NULL,
    "fromSitterId" TEXT,
    "toSitterId" TEXT,
    "reason" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOriginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAttributionSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "clientOriginKind" "ClientOriginKind" NOT NULL,
    "referringSitterId" TEXT,
    "referringSitterName" TEXT,
    "requestedSitterId" TEXT,
    "requestedSitterName" TEXT,
    "compensationLane" "BookingCompensationLane" NOT NULL,
    "attributionSource" "ClientAttributionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAttributionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientOrigin_clientId_key" ON "ClientOrigin"("clientId");

-- CreateIndex
CREATE INDEX "ClientOrigin_kind_idx" ON "ClientOrigin"("kind");

-- CreateIndex
CREATE INDEX "ClientOrigin_referringSitterId_idx" ON "ClientOrigin"("referringSitterId");

-- CreateIndex
CREATE INDEX "ClientOrigin_setByUserId_idx" ON "ClientOrigin"("setByUserId");

-- CreateIndex
CREATE INDEX "ClientOriginEvent_clientOriginId_createdAt_idx" ON "ClientOriginEvent"("clientOriginId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientOriginEvent_fromSitterId_idx" ON "ClientOriginEvent"("fromSitterId");

-- CreateIndex
CREATE INDEX "ClientOriginEvent_toSitterId_idx" ON "ClientOriginEvent"("toSitterId");

-- CreateIndex
CREATE INDEX "ClientOriginEvent_changedByUserId_idx" ON "ClientOriginEvent"("changedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAttributionSnapshot_bookingId_key" ON "BookingAttributionSnapshot"("bookingId");

-- CreateIndex
CREATE INDEX "BookingAttributionSnapshot_referringSitterId_idx" ON "BookingAttributionSnapshot"("referringSitterId");

-- CreateIndex
CREATE INDEX "BookingAttributionSnapshot_requestedSitterId_idx" ON "BookingAttributionSnapshot"("requestedSitterId");

-- CreateIndex
CREATE INDEX "BookingAttributionSnapshot_compensationLane_idx" ON "BookingAttributionSnapshot"("compensationLane");

-- AddForeignKey
ALTER TABLE "ClientOrigin" ADD CONSTRAINT "ClientOrigin_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOrigin" ADD CONSTRAINT "ClientOrigin_referringSitterId_fkey" FOREIGN KEY ("referringSitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOrigin" ADD CONSTRAINT "ClientOrigin_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOriginEvent" ADD CONSTRAINT "ClientOriginEvent_clientOriginId_fkey" FOREIGN KEY ("clientOriginId") REFERENCES "ClientOrigin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOriginEvent" ADD CONSTRAINT "ClientOriginEvent_fromSitterId_fkey" FOREIGN KEY ("fromSitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOriginEvent" ADD CONSTRAINT "ClientOriginEvent_toSitterId_fkey" FOREIGN KEY ("toSitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOriginEvent" ADD CONSTRAINT "ClientOriginEvent_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttributionSnapshot" ADD CONSTRAINT "BookingAttributionSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttributionSnapshot" ADD CONSTRAINT "BookingAttributionSnapshot_referringSitterId_fkey" FOREIGN KEY ("referringSitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttributionSnapshot" ADD CONSTRAINT "BookingAttributionSnapshot_requestedSitterId_fkey" FOREIGN KEY ("requestedSitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
