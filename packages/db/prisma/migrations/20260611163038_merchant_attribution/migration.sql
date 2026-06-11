/*
  Warnings:

  - A unique constraint covering the columns `[webhookToken]` on the table `Merchant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[razorpayAccountId]` on the table `Merchant` will be added. If there are existing duplicate values, this will fail.
  - The required column `webhookToken` was added to the `Merchant` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Made the column `merchantId` on table `PaymentEvent` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "PaymentEvent" DROP CONSTRAINT "PaymentEvent_merchantId_fkey";

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "razorpayAccountId" TEXT,
ADD COLUMN     "razorpayWebhookSecret" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "webhookToken" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PaymentEvent" ALTER COLUMN "merchantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_webhookToken_key" ON "Merchant"("webhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_razorpayAccountId_key" ON "Merchant"("razorpayAccountId");

-- CreateIndex
CREATE INDEX "MessageLog_merchantId_idx" ON "MessageLog"("merchantId");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
