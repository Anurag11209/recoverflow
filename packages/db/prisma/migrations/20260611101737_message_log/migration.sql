-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "recoveryCaseId" TEXT NOT NULL,
    "recoveryAttemptId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageLog_recoveryAttemptId_key" ON "MessageLog"("recoveryAttemptId");

-- CreateIndex
CREATE INDEX "MessageLog_recoveryCaseId_idx" ON "MessageLog"("recoveryCaseId");

-- CreateIndex
CREATE INDEX "MessageLog_status_idx" ON "MessageLog"("status");

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_recoveryAttemptId_fkey" FOREIGN KEY ("recoveryAttemptId") REFERENCES "RecoveryAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
