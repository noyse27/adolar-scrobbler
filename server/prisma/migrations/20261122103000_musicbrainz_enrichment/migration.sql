CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY', 'DONE', 'NO_MATCH', 'FAILED');

ALTER TABLE "Artist"
  ADD COLUMN "sortName" TEXT,
  ADD COLUMN "type" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "disambiguation" TEXT,
  ADD COLUMN "beginDate" TEXT,
  ADD COLUMN "endDate" TEXT,
  ADD COLUMN "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Album"
  ADD COLUMN "releaseGroupMbid" TEXT,
  ADD COLUMN "primaryType" TEXT,
  ADD COLUMN "secondaryTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "firstReleaseDate" TEXT,
  ADD COLUMN "coverPath" TEXT,
  ADD COLUMN "coverCheckedAt" TIMESTAMP(3);

ALTER TABLE "Track"
  ADD COLUMN "artistCredits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "artistCreditMbids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Artist_mbid_idx" ON "Artist"("mbid");
CREATE INDEX "Album_mbid_idx" ON "Album"("mbid");
CREATE INDEX "Album_releaseGroupMbid_idx" ON "Album"("releaseGroupMbid");
CREATE INDEX "Track_mbid_idx" ON "Track"("mbid");

CREATE TABLE "EnrichmentJob" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnrichmentJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrichmentJob_targetType_targetId_key" ON "EnrichmentJob"("targetType", "targetId");
CREATE INDEX "EnrichmentJob_status_nextAttemptAt_idx" ON "EnrichmentJob"("status", "nextAttemptAt");
