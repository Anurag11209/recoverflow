/*
  Warnings:

  - The `status` column on the `RecoveryCase` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[paymentEventId]` on the table `RecoveryCase` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `provider` to the `RecoveryCase` table without a default value. This is not possible if the table is not empty.
  - Made the column `paymentEventId` on table `RecoveryCase` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('OPEN', 'RECOVERED', 'FAILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- DropForeignKey
ALTER TABLE "RecoveryCase" DROP CONSTRAINT "RecoveryCase_customerId_fkey";

-- DropForeignKey
ALTER TABLE "RecoveryCase" DROP CONSTRAINT "RecoveryCase_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "RecoveryCase" DROP CONSTRAINT "RecoveryCase_paymentEventId_fkey";

-- AlterTable
ALTER TABLE "RecoveryCase" ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "failureCategory" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "providerPaymentId" TEXT,
ALTER COLUMN "merchantId" DROP NOT NULL,
ALTER COLUMN "customerId" DROP NOT NULL,
ALTER COLUMN "paymentEventId" SET NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "currency" DROP NOT NULL,
ALTER COLUMN "currency" DROP DEFAULT,
DROP COLUMN "status",
ADD COLUMN     "status" "RecoveryStatus" NOT NULL DEFAULT 'OPEN';

-- DropEnum
DROP TYPE "RecoveryCaseStatus";

-- CreateTable
CREATE TABLE "RecoveryAttempt" (
    "id" TEXT NOT NULL,
    "recoveryCaseId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryAttempt_status_scheduledAt_idx" ON "RecoveryAttempt"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryAttempt_recoveryCaseId_attemptNumber_key" ON "RecoveryAttempt"("recoveryCaseId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCase_paymentEventId_key" ON "RecoveryCase"("paymentEventId");

-- CreateIndex
CREATE INDEX "RecoveryCase_merchantId_status_idx" ON "RecoveryCase"("merchantId", "status");

-- CreateIndex
CREATE INDEX "RecoveryCase_status_idx" ON "RecoveryCase"("status");

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_paymentEventId_fkey" FOREIGN KEY ("paymentEventId") REFERENCES "PaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAttempt" ADD CONSTRAINT "RecoveryAttempt_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
