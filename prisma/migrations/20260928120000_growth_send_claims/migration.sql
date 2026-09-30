-- Growth safety: atomic email-send claims and named claims. Additive only (two new tables). No drops, no data changes.
-- CreateTable
CREATE TABLE "GrowthEmailSend" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "GrowthEmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthClaim" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthClaim_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "GrowthEmailSend_status_claimedAt_idx" ON "GrowthEmailSend"("status", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthEmailSend_enrollmentId_step_key" ON "GrowthEmailSend"("enrollmentId", "step");

-- AddForeignKey
ALTER TABLE "GrowthEmailSend" ADD CONSTRAINT "GrowthEmailSend_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "SequenceEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

