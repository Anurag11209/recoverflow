/*
  Warnings:

  - You are about to drop the column `amount` on the `PaymentEvent` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `PaymentEvent` table. All the data in the column will be lost.
  - You are about to drop the column `failureReason` on the `PaymentEvent` table. All the data in the column will be lost.
  - You are about to drop the column `processorCustomerId` on the `PaymentEvent` table. All the data in the column will be lost.
  - You are about to drop the column `raw` on the `PaymentEvent` table. All the data in the column will be lost.
  - Added the required column `payload` to the `PaymentEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `PaymentEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `providerEventId` to the `PaymentEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `signatureVerified` to the `PaymentEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `PaymentEvent` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PaymentEvent" DROP CONSTRAINT "PaymentEvent_merchantId_fkey";

-- AlterTable
ALTER TABLE "PaymentEvent" DROP COLUMN "amount",
DROP COLUMN "currency",
DROP COLUMN "failureReason",
DROP COLUMN "processorCustomerId",
DROP COLUMN "raw",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "eventTime" TIMESTAMP(3),
ADD COLUMN     "payload" JSONB NOT NULL,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "providerEventId" TEXT NOT NULL,
ADD COLUMN     "signatureVerified" BOOLEAN NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "merchantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "eventTime" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_provider_eventId_key" ON "WebhookReceipt"("provider", "eventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_provider_providerEventId_idx" ON "PaymentEvent"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
