-- CreateEnum
CREATE TYPE "JournalPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "JournalPost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "JournalPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "coverImageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalPostTranslation" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalPostTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalPost_tenantId_status_publishedAt_idx" ON "JournalPost"("tenantId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "JournalPost_tenantId_updatedAt_idx" ON "JournalPost"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "JournalPost_tenantId_idx" ON "JournalPost"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalPost_tenantId_slug_key" ON "JournalPost"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "JournalPostTranslation_postId_idx" ON "JournalPostTranslation"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalPostTranslation_postId_locale_key" ON "JournalPostTranslation"("postId", "locale");

-- AddForeignKey
ALTER TABLE "JournalPost" ADD CONSTRAINT "JournalPost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPostTranslation" ADD CONSTRAINT "JournalPostTranslation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "JournalPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
