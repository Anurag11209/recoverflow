-- CreateIndex
CREATE INDEX "RecoveryCase_merchantId_createdAt_id_idx" ON "RecoveryCase"("merchantId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RecoveryCase_merchantId_status_createdAt_idx" ON "RecoveryCase"("merchantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RecoveryCase_merchantId_recoveredAt_idx" ON "RecoveryCase"("merchantId", "recoveredAt");
