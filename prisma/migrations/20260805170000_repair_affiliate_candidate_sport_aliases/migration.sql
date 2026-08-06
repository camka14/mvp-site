BEGIN;

-- Candidate rows use a scalar sportName. Repair only the two deterministic
-- aliases whose default surfaces are already defined by the product catalog.
UPDATE "AffiliateImportCandidates"
SET
  "sportName" = CASE LOWER(BTRIM("sportName"))
    WHEN 'soccer' THEN 'Grass Soccer'
    WHEN 'volleyball' THEN 'Indoor Volleyball'
    ELSE "sportName"
  END,
  "updatedAt" = NOW()
WHERE LOWER(BTRIM("sportName")) IN ('soccer', 'volleyball');

-- Older active mappings can predate the agent contract. Repair only JSON keys
-- named sportName or sportNames. Do not alter tags, descriptions, or source
-- evidence that happen to contain the words Soccer or Volleyball.
CREATE OR REPLACE FUNCTION pg_temp.repair_affiliate_sport_aliases(input JSONB)
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
      JSONB_AGG(pg_temp.repair_affiliate_sport_aliases(item.value) ORDER BY item.ordinality),
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
        WHEN item.key = 'sportName' AND JSONB_TYPEOF(item.value) = 'string' THEN
          TO_JSONB(CASE LOWER(BTRIM(item.value #>> '{}'))
            WHEN 'soccer' THEN 'Grass Soccer'
            WHEN 'volleyball' THEN 'Indoor Volleyball'
            ELSE item.value #>> '{}'
          END)
        WHEN item.key = 'sportNames' AND JSONB_TYPEOF(item.value) = 'array' THEN (
          SELECT COALESCE(
            JSONB_AGG(
              CASE
                WHEN JSONB_TYPEOF(name.value) = 'string' THEN
                  TO_JSONB(CASE LOWER(BTRIM(name.value #>> '{}'))
                    WHEN 'soccer' THEN 'Grass Soccer'
                    WHEN 'volleyball' THEN 'Indoor Volleyball'
                    ELSE name.value #>> '{}'
                  END)
                ELSE name.value
              END
              ORDER BY name.ordinality
            ),
            '[]'::JSONB
          )
          FROM JSONB_ARRAY_ELEMENTS(item.value) WITH ORDINALITY AS name(value, ordinality)
        )
        ELSE pg_temp.repair_affiliate_sport_aliases(item.value)
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
  mapping = pg_temp.repair_affiliate_sport_aliases(mapping.mapping),
  "updatedAt" = NOW()
WHERE mapping."isActive" = TRUE
  AND pg_temp.repair_affiliate_sport_aliases(mapping.mapping) <> mapping.mapping;

DO $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AffiliateImportCandidates"
    WHERE LOWER(BTRIM("sportName")) IN ('soccer', 'volleyball')
  ) THEN
    RAISE EXCEPTION 'Affiliate candidate sport alias repair left a generic sport name.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AffiliateScrapeMappings" AS active_mapping
    WHERE active_mapping."isActive" = TRUE
      AND pg_temp.repair_affiliate_sport_aliases(active_mapping.mapping) <> active_mapping.mapping
  ) THEN
    RAISE EXCEPTION 'Affiliate active mapping sport alias repair left a generic sport name.';
  END IF;
END;
$function$;

COMMIT;
