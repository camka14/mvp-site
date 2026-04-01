WITH ownership AS (
  SELECT
    f."id" AS "fieldId",
    MIN(o."id") AS "organizationId"
  FROM "Fields" f
  JOIN "Organizations" o
    ON f."id" = ANY(COALESCE(o."fieldIds", ARRAY[]::TEXT[]))
  GROUP BY f."id"
)
UPDATE "Fields" f
SET "organizationId" = ownership."organizationId"
FROM ownership
WHERE f."id" = ownership."fieldId"
  AND f."organizationId" IS NULL;

ALTER TABLE "Organizations"
DROP COLUMN IF EXISTS "fieldIds";