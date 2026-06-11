-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('PAYMENT_FAILED', 'PAYMENT_REMINDER', 'PAYMENT_RECOVERED');

-- DropIndex
DROP INDEX "MessageLog_recoveryAttemptId_key";

-- AlterTable
ALTER TABLE "MessageLog" ADD COLUMN     "messageType" "MessageType" NOT NULL DEFAULT 'PAYMENT_FAILED',
ALTER COLUMN "recoveryAttemptId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RecoveryCase" ADD COLUMN     "recoveredAmount" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "PaymentUpdateToken" (
    "id" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "merchantId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentUpdateToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentUpdateToken_tokenHash_key" ON "PaymentUpdateToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PaymentUpdateToken_recoveryCaseId_idx" ON "PaymentUpdateToken"("recoveryCaseId");

-- AddForeignKey
ALTER TABLE "PaymentUpdateToken" ADD CONSTRAINT "PaymentUpdateToken_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentUpdateToken" ADD CONSTRAINT "PaymentUpdateToken_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 6 invariant preserved as a PARTIAL unique index: at most one
-- message per attempt when recoveryAttemptId is set; null-attempt messages
-- (recovered/reminder) are unconstrained.
CREATE UNIQUE INDEX "MessageLog_recoveryAttemptId_key"
  ON "MessageLog"("recoveryAttemptId")
  WHERE "recoveryAttemptId" IS NOT NULL;
