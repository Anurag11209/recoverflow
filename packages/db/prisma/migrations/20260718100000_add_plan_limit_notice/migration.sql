-- CreateTable
CREATE TABLE "PlanLimitNotice" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanLimitNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanLimitNotice_merchantId_idx" ON "PlanLimitNotice"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanLimitNotice_merchantId_period_key" ON "PlanLimitNotice"("merchantId", "period");

-- AddForeignKey
ALTER TABLE "PlanLimitNotice" ADD CONSTRAINT "PlanLimitNotice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
