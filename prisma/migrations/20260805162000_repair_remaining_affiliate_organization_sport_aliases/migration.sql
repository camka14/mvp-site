BEGIN;

-- Repair known aliases on every affiliate organization, including claimed
-- records that were intentionally excluded from the initial intake cleanup.
WITH expanded AS (
  SELECT
    organization."id",
    source.ordinality,
    CASE LOWER(BTRIM(source.value))
      WHEN 'soccer' THEN 'Grass Soccer'
      ELSE source.value
    END AS mapped_value
  FROM "Organizations" AS organization
  CROSS JOIN LATERAL unnest(organization."sports") WITH ORDINALITY AS source(value, ordinality)
  WHERE organization."id" LIKE 'affiliate_org_%'
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
)
UPDATE "Organizations" AS organization
SET
  "sports" = COALESCE(canonical.sports, organization."sports"),
  "updatedAt" = NOW()
FROM canonical
WHERE organization."id" = canonical."id"
  AND organization."id" LIKE 'affiliate_org_%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Organizations" AS organization
    WHERE organization."id" LIKE 'affiliate_org_%'
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
    RAISE EXCEPTION 'Affiliate organization sport alias repair left a non-canonical sport name.';
  END IF;
END;
$$;

COMMIT;
