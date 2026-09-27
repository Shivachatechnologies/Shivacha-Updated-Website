-- AI Workforce Control Center and Emergency Stop. Additive only: new columns with defaults and one new table.
-- AlterTable
ALTER TABLE "AIAgent" ADD COLUMN     "autonomousAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "backgroundTasksAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "controlUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "controlUpdatedById" TEXT,
ADD COLUMN     "voiceAllowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AIWorkforceConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "emergencyStop" BOOLEAN NOT NULL DEFAULT false,
    "emergencyReason" TEXT,
    "emergencyById" TEXT,
    "emergencyAt" TIMESTAMP(3),
    "autonomousEnabled" BOOLEAN NOT NULL DEFAULT true,
    "backgroundTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "voiceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "externalActionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyBudget" DECIMAL(12,4),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIWorkforceConfig_pkey" PRIMARY KEY ("id")
);

