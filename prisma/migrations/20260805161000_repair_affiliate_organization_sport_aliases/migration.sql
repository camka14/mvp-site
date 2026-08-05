BEGIN;

-- Organizations.sports stores canonical display names. Map only known aliases
-- and explicit composites. Unsupported labels are removed instead of guessed.
WITH expanded AS (
  SELECT
    organization."id",
    source.ordinality,
    mapped.value AS mapped_value
  FROM "Organizations" AS organization
  CROSS JOIN LATERAL unnest(organization."sports") WITH ORDINALITY AS source(value, ordinality)
  CROSS JOIN LATERAL unnest(
    CASE LOWER(BTRIM(source.value))
      WHEN 'soccer' THEN ARRAY['Grass Soccer']::TEXT[]
      WHEN 'volleyball' THEN ARRAY['Indoor Volleyball']::TEXT[]
      WHEN 'ice hockey' THEN ARRAY['Hockey']::TEXT[]
      WHEN 'ultimate' THEN ARRAY['Ultimate Frisbee']::TEXT[]
      WHEN 'american football' THEN ARRAY['Football']::TEXT[]
      WHEN 'arena football' THEN ARRAY['Football']::TEXT[]
      WHEN 'adult basketball' THEN ARRAY['Basketball']::TEXT[]
      WHEN 'adaptive baseball' THEN ARRAY['Baseball']::TEXT[]
      WHEN 'tennis and pickleball' THEN ARRAY['Tennis', 'Pickleball']::TEXT[]
      WHEN 'baseball & softball' THEN ARRAY['Baseball', 'Softball']::TEXT[]
      WHEN 'baseball & fastpitch softball' THEN ARRAY['Baseball', 'Softball']::TEXT[]
      WHEN 'baseball and fastpitch softball' THEN ARRAY['Baseball', 'Softball']::TEXT[]
      WHEN 'baseball, softball, t-ball' THEN ARRAY['Baseball', 'Softball']::TEXT[]
      WHEN 'basketball and volleyball' THEN ARRAY['Basketball', 'Indoor Volleyball']::TEXT[]
      WHEN 'basketball, baseball, football, soccer, track, and volleyball'
        THEN ARRAY['Basketball', 'Baseball', 'Football', 'Grass Soccer', 'Indoor Volleyball']::TEXT[]
      WHEN 'football and cheer' THEN ARRAY['Football']::TEXT[]
      WHEN 'football and cheerleading' THEN ARRAY['Football']::TEXT[]
      WHEN 'futsal and soccer' THEN ARRAY['Grass Soccer']::TEXT[]
      WHEN 'swimming, tennis, basketball, and baseball'
        THEN ARRAY['Tennis', 'Basketball', 'Baseball']::TEXT[]
      WHEN 'table tennis and soccer' THEN ARRAY['Grass Soccer']::TEXT[]
      WHEN 'tennis, pickleball, and multi-sport facility'
        THEN ARRAY['Tennis', 'Pickleball']::TEXT[]
      ELSE ARRAY[source.value]::TEXT[]
    END
  ) AS mapped(value)
  WHERE organization."id" LIKE 'affiliate_org_%'
    AND organization."ownershipStatus" = 'UNCLAIMED'
), canonical_values AS (
  SELECT
    expanded."id",
    expanded.ordinality,
    sport."name" AS canonical_name
  FROM expanded
  JOIN "Sports" AS sport
    ON LOWER(BTRIM(sport."name")) = LOWER(BTRIM(expanded.mapped_value))
), deduplicated AS (
  SELECT
    "id",
    canonical_name,
    MIN(ordinality) AS first_ordinality
  FROM canonical_values
  GROUP BY "id", canonical_name
), canonical AS (
  SELECT
    "id",
    ARRAY_AGG(canonical_name ORDER BY first_ordinality) AS sports
  FROM deduplicated
  GROUP BY "id"
), affiliate_organizations AS (
  SELECT
    organization."id",
    COALESCE(canonical.sports, ARRAY[]::TEXT[]) AS sports
  FROM "Organizations" AS organization
  LEFT JOIN canonical ON canonical."id" = organization."id"
  WHERE organization."id" LIKE 'affiliate_org_%'
    AND organization."ownershipStatus" = 'UNCLAIMED'
)
UPDATE "Organizations" AS organization
SET
  "sports" = affiliate_organizations.sports,
  "updatedAt" = NOW()
FROM affiliate_organizations
WHERE organization."id" = affiliate_organizations."id";

UPDATE "Organizations" AS organization
SET
  "status" = 'UNLISTED',
  "publicPageEnabled" = FALSE,
  "updatedAt" = NOW()
WHERE organization."id" LIKE 'affiliate_org_%'
  AND organization."ownershipStatus" = 'UNCLAIMED'
  AND cardinality(organization."sports") = 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Organizations" AS organization
    WHERE organization."id" LIKE 'affiliate_org_%'
      AND organization."ownershipStatus" = 'UNCLAIMED'
      AND EXISTS (
        SELECT 1
        FROM unnest(organization."sports") AS sport_name
        WHERE NOT EXISTS (
          SELECT 1
          FROM "Sports" AS sport
          WHERE LOWER(BTRIM(sport."name")) = LOWER(BTRIM(sport_name))
        )
      )
  ) THEN
    RAISE EXCEPTION 'Affiliate organization sport repair left a non-canonical sport name.';
  END IF;
END;
$$;

COMMIT;
