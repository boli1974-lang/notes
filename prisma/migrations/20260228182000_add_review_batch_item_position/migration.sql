-- Add deterministic order field for persisted review batch items.
ALTER TABLE "ReviewBatchItem"
ADD COLUMN "position" INTEGER;

-- Backfill existing rows (if any) with stable per-batch positions.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "batchId" ORDER BY "id") - 1 AS pos
  FROM "ReviewBatchItem"
)
UPDATE "ReviewBatchItem" AS r
SET "position" = ranked.pos
FROM ranked
WHERE r."id" = ranked."id";

ALTER TABLE "ReviewBatchItem"
ALTER COLUMN "position" SET NOT NULL;

CREATE UNIQUE INDEX "ReviewBatchItem_batchId_position_key"
ON "ReviewBatchItem"("batchId", "position");
