-- CreateIndex
CREATE INDEX "CustomDomain_status_failureCount_idx" ON "CustomDomain"("status", "failureCount");

-- CreateIndex
CREATE INDEX "CustomDomain_gracePeriodStartedAt_idx" ON "CustomDomain"("gracePeriodStartedAt");

-- CreateIndex
CREATE INDEX "CustomDomain_lastVerifiedAt_idx" ON "CustomDomain"("lastVerifiedAt");
