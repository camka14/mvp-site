BEGIN;

-- Organizations.sports is the public badge source. Canonicalize only
-- case-insensitive catalog matches. Do not guess a replacement for generic,
-- composite, or unsupported source labels.
UPDATE "Organizations" AS organization
SET
  "sports" = COALESCE(canonical.sports, ARRAY[]::text[]),
  "updatedAt" = NOW()
FROM (
  SELECT
    organization_row."id",
    ARRAY_AGG(sport."name" ORDER BY source.ordinality) AS sports
  FROM "Organizations" AS organization_row
  CROSS JOIN LATERAL unnest(organization_row."sports") WITH ORDINALITY AS source(value, ordinality)
  JOIN "Sports" AS sport
    ON LOWER(BTRIM(sport."name")) = LOWER(BTRIM(source.value))
  WHERE organization_row."id" LIKE 'affiliate_org_%'
    AND organization_row."ownershipStatus" = 'UNCLAIMED'
  GROUP BY organization_row."id"
) AS canonical
WHERE organization."id" = canonical."id";

-- A public affiliate organization with no remaining canonical sport badges is
-- not safe to expose until its source mapping receives human review.
UPDATE "Organizations" AS organization
SET
  "status" = 'UNLISTED',
  "publicPageEnabled" = FALSE,
  "updatedAt" = NOW()
WHERE organization."id" LIKE 'affiliate_org_%'
  AND organization."ownershipStatus" = 'UNCLAIMED'
  AND organization."status" = 'LISTED'
  AND organization."publicPageEnabled" = TRUE
  AND cardinality(organization."sports") = 0;

COMMIT;
