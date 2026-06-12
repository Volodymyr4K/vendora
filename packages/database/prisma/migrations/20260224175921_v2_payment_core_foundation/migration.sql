-- CreateEnum
CREATE TYPE "OrderFinancialStatus" AS ENUM ('UNPAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('MOLLIE', 'MONOBANK', 'LIQPAY');

-- CreateEnum
CREATE TYPE "PaymentProviderMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "PaymentProviderStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'PENDING_VERIFICATION', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'UNMATCHED', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "financialStatus" "OrderFinancialStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "PaymentProviderType" NOT NULL,
    "mode" "PaymentProviderMode" NOT NULL,
    "status" "PaymentProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "credentialsRef" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderDbId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT,
    "checkoutUrl" TEXT,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "externalStatus" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "currencyExponent" INTEGER NOT NULL,
    "refundedAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "refundPendingAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "chargebackAt" TIMESTAMP(3),
    "providerLastEventCreatedAt" TIMESTAMP(3),
    "resyncAttempt" INTEGER NOT NULL DEFAULT 0,
    "nextResyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "transactionId" TEXT,
    "externalId" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "providerEventCreatedAt" TIMESTAMP(3),
    "payloadHash" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "parsed" JSONB,
    "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorCode" TEXT,
    "unmatchedAttempt" INTEGER NOT NULL DEFAULT 0,
    "unmatchedNextAttemptAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCheckoutRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "orderDbId" TEXT NOT NULL,
    "providerId" TEXT,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCheckoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentProvider_tenantId_idx" ON "PaymentProvider"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentProvider_tenantId_type_mode_idx" ON "PaymentProvider"("tenantId", "type", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_tenantId_type_mode_key" ON "PaymentProvider"("tenantId", "type", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_tenantId_id_key" ON "PaymentProvider"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_idx" ON "PaymentTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_orderDbId_idx" ON "PaymentTransaction"("tenantId", "orderDbId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_providerId_idx" ON "PaymentTransaction"("tenantId", "providerId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_providerId_status_idx" ON "PaymentTransaction"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenantId_status_nextResyncAt_idx" ON "PaymentTransaction"("tenantId", "status", "nextResyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_tenantId_id_key" ON "PaymentTransaction"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_tenantId_providerId_externalId_key" ON "PaymentTransaction"("tenantId", "providerId", "externalId");

-- CreateIndex
CREATE INDEX "PaymentEvent_tenantId_idx" ON "PaymentEvent"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentEvent_tenantId_providerId_externalId_idx" ON "PaymentEvent"("tenantId", "providerId", "externalId");

-- CreateIndex
CREATE INDEX "PaymentEvent_tenantId_providerId_status_idx" ON "PaymentEvent"("tenantId", "providerId", "status");

-- CreateIndex
CREATE INDEX "PaymentEvent_status_receivedAt_idx" ON "PaymentEvent"("status", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentEvent_status_unmatchedNextAttemptAt_idx" ON "PaymentEvent"("status", "unmatchedNextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_tenantId_providerId_dedupKey_key" ON "PaymentEvent"("tenantId", "providerId", "dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_tenantId_id_key" ON "PaymentEvent"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PaymentCheckoutRequest_tenantId_idx" ON "PaymentCheckoutRequest"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentCheckoutRequest_tenantId_orderDbId_idx" ON "PaymentCheckoutRequest"("tenantId", "orderDbId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutRequest_tenantId_scope_idempotencyKey_key" ON "PaymentCheckoutRequest"("tenantId", "scope", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutRequest_tenantId_id_key" ON "PaymentCheckoutRequest"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Order_tenantId_financialStatus_idx" ON "Order"("tenantId", "financialStatus");

-- AddForeignKey
ALTER TABLE "PaymentProvider" ADD CONSTRAINT "PaymentProvider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderDbId_fkey" FOREIGN KEY ("orderDbId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheckoutRequest" ADD CONSTRAINT "PaymentCheckoutRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheckoutRequest" ADD CONSTRAINT "PaymentCheckoutRequest_orderDbId_fkey" FOREIGN KEY ("orderDbId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCheckoutRequest" ADD CONSTRAINT "PaymentCheckoutRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: one active payment attempt per order (SSOT).
-- Prisma cannot express this partial unique index.
CREATE UNIQUE INDEX "PaymentTransaction_one_active_per_order"
ON "PaymentTransaction" ("tenantId", "orderDbId")
WHERE "status" IN ('INITIATED', 'PENDING', 'PENDING_VERIFICATION');
