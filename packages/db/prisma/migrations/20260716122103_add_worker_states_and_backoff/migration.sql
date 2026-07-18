-- AlterEnum
-- Additive: adds the worker terminal states. SUCCESS/FAILED are retained for the
-- web manual-trigger path. Safe on a populated table (no existing value changes).
ALTER TYPE "ProcessingStatus" ADD VALUE 'DONE';
ALTER TYPE "ProcessingStatus" ADD VALUE 'DEAD';

-- AlterTable
ALTER TABLE "EventProcessing" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EventProcessing_status_nextAttemptAt_idx" ON "EventProcessing"("status", "nextAttemptAt");
