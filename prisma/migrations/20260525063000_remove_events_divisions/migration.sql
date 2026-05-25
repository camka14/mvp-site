-- Division ownership now lives on Divisions.eventId. Preserve the old
-- Events.divisions display order as Divisions.sortOrder.
--
-- Keep the physical Events.divisions column during this deployment so the
-- migration can run before the new code is live without breaking old server
-- instances. The column is removed from Prisma/code usage in this release and
-- can be dropped in a later cleanup migration after the rollout is complete.

ALTER TABLE "Divisions"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

WITH event_division_order AS (
  SELECT
    events."id" AS "eventId",
    division_id,
    ordinality::INTEGER - 1 AS "sortOrder"
  FROM "Events" events
  CROSS JOIN LATERAL unnest(COALESCE(events."divisions", ARRAY[]::TEXT[])) WITH ORDINALITY AS ordered(division_id, ordinality)
)
UPDATE "Divisions" divisions
SET "sortOrder" = event_division_order."sortOrder"
FROM event_division_order
WHERE divisions."eventId" = event_division_order."eventId"
  AND (
    lower(divisions."id") = lower(event_division_order.division_id)
    OR lower(COALESCE(divisions."key", '')) = lower(event_division_order.division_id)
  );

WITH unordered AS (
  SELECT
    divisions."id",
    ROW_NUMBER() OVER (
      PARTITION BY divisions."eventId", COALESCE(divisions."kind"::TEXT, 'LEAGUE')
      ORDER BY divisions."createdAt" NULLS LAST, divisions."name", divisions."id"
    )::INTEGER - 1 AS fallback_order
  FROM "Divisions" divisions
  WHERE divisions."sortOrder" IS NULL
)
UPDATE "Divisions" divisions
SET "sortOrder" = unordered.fallback_order
FROM unordered
WHERE divisions."id" = unordered."id";

CREATE INDEX IF NOT EXISTS "Divisions_eventId_kind_sortOrder_idx"
  ON "Divisions" ("eventId", "kind", "sortOrder");
