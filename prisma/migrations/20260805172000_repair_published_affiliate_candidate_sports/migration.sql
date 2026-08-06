BEGIN;

CREATE TEMP TABLE affiliate_candidate_sport_repairs (
  candidate_id TEXT PRIMARY KEY,
  mapping_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  sport_name TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO affiliate_candidate_sport_repairs (candidate_id, mapping_id, organization_id, sport_name)
VALUES
  ('2235ef4b-0c5d-4abf-8aa9-b9d92a72210b', 'affiliate_mapping_river_valley_soccer_association_v1', 'affiliate_org_river_valley_soccer_association', 'Grass Soccer'),
  ('f3bb32b5-8abd-4b83-ba6f-67ab93fbced4', 'affiliate_mapping_usa_of_indiana_v1', 'affiliate_org_usa_of_indiana', 'Grass Soccer'),
  ('870854e0-1cae-4a51-9090-9a5ccb9d12bf', 'affiliate_mapping_boston_volleyball_association_v1', 'affiliate_org_boston_volleyball_association', 'Indoor Volleyball'),
  ('d66c5d01-8482-457b-8b99-b1ec4a368b6f', 'affiliate_mapping_oshkosh_united_soccer_club_v1', 'affiliate_org_oshkosh_united_soccer_club', 'Grass Soccer'),
  ('70923f86-7abd-4dd2-b8b7-e5a2248015d5', 'affiliate_mapping_bennington_soccer_club_v1', 'affiliate_org_bennington_soccer_club', 'Grass Soccer'),
  ('44af2ebb-b61e-4960-9304-33ee1c39c523', 'affiliate_mapping_bavarian_united_soccer_club_v1', 'affiliate_org_bavarian_united_soccer_club', 'Grass Soccer'),
  ('ed2ec847-5cd4-452e-aca3-27f07e1f9c88', 'affiliate_mapping_hodag_soccer_club_v1', 'affiliate_org_hodag_soccer_club', 'Grass Soccer'),
  ('1aad914f-4723-4fe0-855c-b24ae4fcb06c', 'affiliate_mapping_waupaca_kickers_soccer_club_v1', 'affiliate_org_waupaca_kickers_soccer_club', 'Grass Soccer'),
  ('1847deca-2d93-4fd1-aae0-0f81180d3b36', 'affiliate_mapping_plymouth_soccer_club_v1', 'affiliate_org_plymouth_soccer_club', 'Grass Soccer');

UPDATE "AffiliateImportCandidates" AS candidate
SET "sportName" = repair.sport_name,
    "updatedAt" = NOW()
FROM affiliate_candidate_sport_repairs AS repair
WHERE candidate.id = repair.candidate_id;

UPDATE "Organizations" AS organization
SET "sports" = ARRAY[repair.sport_name]::TEXT[],
    "updatedAt" = NOW()
FROM affiliate_candidate_sport_repairs AS repair
WHERE organization.id = repair.organization_id;

CREATE OR REPLACE FUNCTION pg_temp.set_affiliate_mapping_sport(input JSONB, replacement TEXT)
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
      JSONB_AGG(pg_temp.set_affiliate_mapping_sport(item.value, replacement) ORDER BY item.ordinality),
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
        WHEN item.key = 'sportName' THEN TO_JSONB(replacement)
        ELSE pg_temp.set_affiliate_mapping_sport(item.value, replacement)
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
SET mapping = pg_temp.set_affiliate_mapping_sport(mapping.mapping, repair.sport_name),
    "updatedAt" = NOW()
FROM affiliate_candidate_sport_repairs AS repair
WHERE mapping.id = repair.mapping_id;

DO $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AffiliateImportCandidates" AS candidate
    JOIN affiliate_candidate_sport_repairs AS repair ON repair.candidate_id = candidate.id
    WHERE candidate."sportName" <> repair.sport_name
  ) THEN
    RAISE EXCEPTION 'Published affiliate candidate sport repair did not update every candidate.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Organizations" AS organization
    JOIN affiliate_candidate_sport_repairs AS repair ON repair.organization_id = organization.id
    WHERE organization.sports <> ARRAY[repair.sport_name]::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Published affiliate organization sport repair did not update every organization.';
  END IF;
END;
$function$;

COMMIT;
