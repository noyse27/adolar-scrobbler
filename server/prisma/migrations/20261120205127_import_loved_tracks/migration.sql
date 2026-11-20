-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "lovedImportedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lovedProcessedPages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lovedSkippedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lovedTotalPages" INTEGER;
