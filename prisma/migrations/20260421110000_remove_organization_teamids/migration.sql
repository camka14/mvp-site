WITH organization_team_links AS (
  SELECT
    o."id" AS organization_id,
    BTRIM(UNNEST(COALESCE(o."teamIds", ARRAY[]::TEXT[]))) AS team_id
  FROM "Organizations" AS o
)
UPDATE "Teams" AS t
SET "organizationId" = links.organization_id
FROM (
  SELECT DISTINCT organization_id, team_id
  FROM organization_team_links
  WHERE team_id <> ''
) AS links
WHERE t."id" = links.team_id
  AND (
    t."organizationId" IS NULL
    OR BTRIM(t."organizationId") = ''
    OR t."organizationId" = links.organization_id
  );

ALTER TABLE "Organizations"
DROP COLUMN IF EXISTS "teamIds";
