-- Growth department: additive only (new nullable columns on Lead/Campaign and new tables). No drops, no data changes.
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "growthScore" INTEGER,
ADD COLUMN     "growthTier" TEXT,
ADD COLUMN     "qualifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cta" TEXT,
ADD COLUMN     "dailyLeadTarget" INTEGER,
ADD COLUMN     "icp" TEXT,
ADD COLUMN     "market" TEXT,
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "offer" TEXT;

-- CreateTable
CREATE TABLE "LeadQualification" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fit" INTEGER NOT NULL,
    "intent" INTEGER NOT NULL,
    "engagement" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "timeline" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "campaign" TEXT,
    "scoredBy" TEXT NOT NULL DEFAULT 'rules',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthTouch" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "visitorId" TEXT,
    "campaignId" TEXT,
    "channel" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "url" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'VISIT',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "externalId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "platform" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "format" TEXT NOT NULL DEFAULT 'POST',
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "qa" JSONB,
    "error" TEXT,
    "campaignId" TEXT,
    "sourceAssetId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdByAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMetric" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "engagements" INTEGER,
    "clicks" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "qa" JSONB,
    "mediaUrl" TEXT,
    "createdById" TEXT,
    "createdByAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "domain" TEXT,
    "contactName" TEXT,
    "title" TEXT,
    "email" TEXT,
    "country" TEXT,
    "industry" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "fitScore" INTEGER,
    "notes" TEXT,
    "provenance" JSONB,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'NURTURE',
    "language" TEXT NOT NULL DEFAULT 'en',
    "steps" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceEnrollment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "leadId" TEXT,
    "prospectId" TEXT,
    "step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "website" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "country" TEXT,
    "terms" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthUsage" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "GrowthUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL DEFAULT 'SCHEDULE',
    "steps" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GrowthRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadQualification_leadId_createdAt_idx" ON "LeadQualification"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadQualification_tier_createdAt_idx" ON "LeadQualification"("tier", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthTouch_leadId_occurredAt_idx" ON "GrowthTouch"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "GrowthTouch_campaignId_occurredAt_idx" ON "GrowthTouch"("campaignId", "occurredAt");

-- CreateIndex
CREATE INDEX "GrowthTouch_occurredAt_idx" ON "GrowthTouch"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_platform_handle_key" ON "SocialAccount"("platform", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_idempotencyKey_key" ON "SocialPost"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SocialPost_status_scheduledAt_idx" ON "SocialPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SocialPost_platform_createdAt_idx" ON "SocialPost"("platform", "createdAt");

-- CreateIndex
CREATE INDEX "SocialMetric_date_idx" ON "SocialMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMetric_platform_date_source_key" ON "SocialMetric"("platform", "date", "source");

-- CreateIndex
CREATE INDEX "ContentAsset_status_createdAt_idx" ON "ContentAsset"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Prospect_status_createdAt_idx" ON "Prospect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Prospect_domain_idx" ON "Prospect"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_source_email_key" ON "Prospect"("source", "email");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_status_nextAt_idx" ON "SequenceEnrollment"("status", "nextAt");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEnrollment_sequenceId_email_key" ON "SequenceEnrollment"("sequenceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

-- CreateIndex
CREATE INDEX "GrowthPartner_status_idx" ON "GrowthPartner"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthUsage_date_kind_key" ON "GrowthUsage"("date", "kind");

-- CreateIndex
CREATE INDEX "GrowthRun_startedAt_idx" ON "GrowthRun"("startedAt");

-- CreateIndex
CREATE INDEX "Lead_growthTier_idx" ON "Lead"("growthTier");

-- AddForeignKey
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTouch" ADD CONSTRAINT "GrowthTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTouch" ADD CONSTRAINT "GrowthTouch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "ContentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMetric" ADD CONSTRAINT "SocialMetric_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

