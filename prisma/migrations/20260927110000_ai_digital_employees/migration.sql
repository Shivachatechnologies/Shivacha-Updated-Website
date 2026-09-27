-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AITaskStatus" ADD VALUE 'PAUSED';
ALTER TYPE "AITaskStatus" ADD VALUE 'AWAITING_APPROVAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTrigger" ADD VALUE 'SCHEDULE_MORNING';
ALTER TYPE "AutomationTrigger" ADD VALUE 'SCHEDULE_EVENING';
ALTER TYPE "AutomationTrigger" ADD VALUE 'SCHEDULE_WEEKLY_MONDAY';
ALTER TYPE "AutomationTrigger" ADD VALUE 'SCHEDULE_CONTINUOUS';

-- AlterTable
ALTER TABLE "AIAgent" ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "managerUserId" TEXT,
ADD COLUMN     "personaName" TEXT,
ADD COLUMN     "reportsToSlug" TEXT,
ADD COLUMN     "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "AIApproval" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "AITask" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "automationId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TASK',
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reassignedFrom" TEXT,
ADD COLUMN     "recordsAffected" JSONB,
ADD COLUMN     "result" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "subtasks" JSONB,
ADD COLUMN     "toolsUsed" JSONB;

-- CreateTable
CREATE TABLE "AIActivity" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGoal" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'DAILY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEmployeeMemory" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "taskId" TEXT,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIEmployeeMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIReport" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIActivity_agentSlug_createdAt_idx" ON "AIActivity"("agentSlug", "createdAt");

-- CreateIndex
CREATE INDEX "AIActivity_taskId_createdAt_idx" ON "AIActivity"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AIActivity_type_createdAt_idx" ON "AIActivity"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AIGoal_agentSlug_active_idx" ON "AIGoal"("agentSlug", "active");

-- CreateIndex
CREATE INDEX "AIEmployeeMemory_agentSlug_kind_createdAt_idx" ON "AIEmployeeMemory"("agentSlug", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AIEmployeeMemory_shared_kind_idx" ON "AIEmployeeMemory"("shared", "kind");

-- CreateIndex
CREATE INDEX "AIReport_kind_createdAt_idx" ON "AIReport"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIReport_agentSlug_kind_day_key" ON "AIReport"("agentSlug", "kind", "day");

-- CreateIndex
CREATE INDEX "AIApproval_taskId_idx" ON "AIApproval"("taskId");

-- CreateIndex
CREATE INDEX "AITask_agentSlug_status_idx" ON "AITask"("agentSlug", "status");

-- AddForeignKey
ALTER TABLE "AIAgent" ADD CONSTRAINT "AIAgent_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
