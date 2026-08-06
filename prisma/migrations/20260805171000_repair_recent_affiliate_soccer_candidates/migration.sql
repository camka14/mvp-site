BEGIN;

-- These review packages explicitly identify Soccer but were left blank or
-- placed in Other before the default-surface rule was applied.
UPDATE "AffiliateImportCandidates"
SET "sportName" = 'Grass Soccer', "updatedAt" = NOW()
WHERE id IN (
  'b2a3e02b-ffaf-4770-b642-dcd3c6a8995e',
  'e4c2042a-4d2c-4044-839e-8a223567742b',
  'fa36d838-3139-450c-91b7-f0611a6604f5'
);

UPDATE "Organizations"
SET "sports" = ARRAY['Grass Soccer']::TEXT[], "updatedAt" = NOW()
WHERE id IN (
  'affiliate_org_oshkosh_united_soccer_club',
  'affiliate_org_dells_soccer_club',
  'affiliate_org_monroe_area_rebel_soccer'
);

CREATE OR REPLACE FUNCTION pg_temp.set_affiliate_mapping_soccer(input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  output JSONB;
BEGIN
  IF input IS NULL OR JSONB_TYPEOF(input) IN ('null', 'boolean', 'number', 'string') THEN
    RETURN input;
  END IF;

  IF JSONB_TYPEOF(input) = 'array' THEN
    SELECT COALESCE(
      JSONB_AGG(pg_temp.set_affiliate_mapping_soccer(item.value) ORDER BY item.ordinality),
      '[]'::JSONB
    )
    INTO output
    FROM JSONB_ARRAY_ELEMENTS(input) WITH ORDINALITY AS item(value, ordinality);
    RETURN output;
  END IF;

  SELECT COALESCE(
    JSONB_OBJECT_AGG(
      item.key,
      CASE
        WHEN item.key = 'sportName' THEN TO_JSONB('Grass Soccer'::TEXT)
        ELSE pg_temp.set_affiliate_mapping_soccer(item.value)
      END
    ),
    '{}'::JSONB
  )
  INTO output
  FROM JSONB_EACH(input) AS item(key, value);

  RETURN output;
END;
$function$;

UPDATE "AffiliateScrapeMappings" AS mapping
SET
  mapping = pg_temp.set_affiliate_mapping_soccer(mapping.mapping),
  "updatedAt" = NOW()
WHERE mapping.id IN (
  'affiliate_mapping_oshkosh_united_soccer_club_v1',
  'affiliate_mapping_dells_soccer_club_v1',
  'affiliate_mapping_monroe_area_rebel_soccer_v1'
);

COMMIT;
