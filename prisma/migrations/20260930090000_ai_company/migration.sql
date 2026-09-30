-- AI company layer. ADDITIVE ONLY: new tables, nullable/defaulted columns, one new enum value, indexes.
-- No existing column, table, row or enum value is dropped, renamed or rewritten.

-- AlterEnum
ALTER TYPE "AITaskStatus" ADD VALUE 'WAITING';

-- AlterTable
ALTER TABLE "AIActivity" ADD COLUMN     "objectiveId" TEXT;

-- AlterTable
ALTER TABLE "AIAgent" ADD COLUMN     "departmentKey" TEXT,
ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "maxConcurrentTasks" INTEGER,
ADD COLUMN     "regionKey" TEXT,
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "AIEmployeeMemory" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "scopeKey" TEXT;

-- AlterTable
ALTER TABLE "AITask" ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "delegatedBySlug" TEXT,
ADD COLUMN     "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "objectiveId" TEXT,
ADD COLUMN     "parentTaskId" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" TEXT,
ADD COLUMN     "revisions" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "leadGen" JSONB,
ADD COLUMN     "regionKey" TEXT;

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "intentScore" INTEGER,
ADD COLUMN     "verification" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AIDepartment" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentKey" TEXT,
    "headSlug" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "monthlyCostLimit" DECIMAL(12,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIDepartment_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AIRegion" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderSlug" TEXT,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIRegion_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AIObjective" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "playbook" TEXT NOT NULL DEFAULT 'GENERAL',
    "ownerSlug" TEXT NOT NULL DEFAULT 'ceo',
    "departmentKey" TEXT,
    "regionKey" TEXT,
    "targetMetric" TEXT,
    "targetValue" DOUBLE PRECISION,
    "dueAt" TIMESTAMP(3),
    "plan" JSONB,
    "rootTaskId" TEXT,
    "campaignId" TEXT,
    "blockedReason" TEXT,
    "result" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIWorkMessage" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT,
    "taskId" TEXT,
    "fromSlug" TEXT NOT NULL,
    "toSlug" TEXT,
    "toUserId" TEXT,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "data" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIWorkMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketResearch" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "taskId" TEXT,
    "objectiveId" TEXT,
    "findings" JSONB,
    "summary" TEXT,
    "knowledgeArticleId" TEXT,
    "blockedReason" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSecret" (
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSecret_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "AIObjective_status_createdAt_idx" ON "AIObjective"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AIWorkMessage_toSlug_status_idx" ON "AIWorkMessage"("toSlug", "status");

-- CreateIndex
CREATE INDEX "AIWorkMessage_objectiveId_createdAt_idx" ON "AIWorkMessage"("objectiveId", "createdAt");

-- CreateIndex
CREATE INDEX "AIWorkMessage_taskId_idx" ON "AIWorkMessage"("taskId");

-- CreateIndex
CREATE INDEX "AIWorkMessage_kind_status_idx" ON "AIWorkMessage"("kind", "status");

-- CreateIndex
CREATE INDEX "MarketResearch_status_createdAt_idx" ON "MarketResearch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationSecret_provider_idx" ON "IntegrationSecret"("provider");

-- CreateIndex
CREATE INDEX "AIActivity_objectiveId_createdAt_idx" ON "AIActivity"("objectiveId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIAgent_employeeCode_key" ON "AIAgent"("employeeCode");

-- CreateIndex
CREATE INDEX "AIEmployeeMemory_scope_scopeKey_idx" ON "AIEmployeeMemory"("scope", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "AITask_idempotencyKey_key" ON "AITask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AITask_objectiveId_status_idx" ON "AITask"("objectiveId", "status");

-- CreateIndex
CREATE INDEX "AITask_parentTaskId_idx" ON "AITask"("parentTaskId");

-- CreateIndex
CREATE INDEX "Prospect_campaignId_status_idx" ON "Prospect"("campaignId", "status");

