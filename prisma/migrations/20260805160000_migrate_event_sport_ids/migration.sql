BEGIN;

ALTER TABLE "Events"
ADD COLUMN "sportIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

WITH mapped AS (
  SELECT
    event."id",
    CASE
      WHEN event."sportId" IS NULL OR BTRIM(event."sportId") = '' THEN
        CASE
          WHEN LOWER(event."name") LIKE '%final four%'
            OR LOWER(COALESCE(event."description", '')) LIKE '%basketball%'
            THEN ARRAY['Basketball']::TEXT[]
          WHEN LOWER(event."name") LIKE '%spring training%'
            OR (
              LOWER(COALESCE(event."description", '')) LIKE '%baseball%'
              AND LOWER(COALESCE(event."description", '')) LIKE '%softball%'
            )
            THEN ARRAY['Baseball', 'Softball']::TEXT[]
          WHEN LOWER(event."name") LIKE '%football%'
            OR LOWER(COALESCE(event."description", '')) LIKE '%football%'
            THEN ARRAY['Football']::TEXT[]
          WHEN LOWER(event."name") LIKE '%soccer%'
            OR LOWER(COALESCE(event."description", '')) LIKE '%soccer%'
            THEN ARRAY['Grass Soccer']::TEXT[]
          WHEN LOWER(COALESCE(event."description", '')) LIKE '%baseball%'
            THEN ARRAY['Baseball']::TEXT[]
          ELSE ARRAY[]::TEXT[]
        END
      WHEN LOWER(BTRIM(event."sportId")) = 'soccer'
        THEN ARRAY['Grass Soccer']::TEXT[]
      WHEN LOWER(BTRIM(event."sportId")) = 'volleyball'
        THEN ARRAY['Indoor Volleyball']::TEXT[]
      WHEN LOWER(BTRIM(event."sportId")) = 'ice hockey'
        THEN ARRAY['Hockey']::TEXT[]
      WHEN LOWER(BTRIM(event."sportId")) = 'ultimate'
        THEN ARRAY['Ultimate Frisbee']::TEXT[]
      ELSE COALESCE(
        (
          SELECT ARRAY[MIN(sport."name")]::TEXT[]
          FROM "Sports" AS sport
          WHERE sport."id" = BTRIM(event."sportId")
             OR LOWER(BTRIM(sport."name")) = LOWER(BTRIM(event."sportId"))
        ),
        ARRAY[]::TEXT[]
      )
    END AS "sportIds"
  FROM "Events" AS event
)
UPDATE "Events" AS event
SET "sportIds" = mapped."sportIds"
FROM mapped
WHERE event."id" = mapped."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Events" AS event
    WHERE COALESCE(event."state"::TEXT, '') <> 'TEMPLATE'
      AND cardinality(event."sportIds") = 0
  ) THEN
    RAISE EXCEPTION 'Event sport migration left one or more non-template events without sportIds.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Events" AS event
    CROSS JOIN LATERAL unnest(event."sportIds") AS sport_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Sports" AS sport
      WHERE LOWER(BTRIM(sport."name")) = LOWER(BTRIM(sport_name))
    )
  ) THEN
    RAISE EXCEPTION 'Event sport migration produced a non-canonical sport name.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Events" AS event
    WHERE cardinality(event."sportIds") > 1
      AND event."eventType"::TEXT NOT IN ('EVENT', 'WEEKLY_EVENT')
  ) THEN
    RAISE EXCEPTION 'Event sport migration produced a multi-sport league or tournament.';
  END IF;
END;
$$;

CREATE INDEX "Events_sportIds_idx" ON "Events" USING GIN ("sportIds");

ALTER TABLE "Events" DROP COLUMN "sportId";

ALTER TABLE "EventTemplates"
ADD COLUMN "sportIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "EventTemplates" AS template
SET "sportIds" = CASE
  WHEN template."sportId" IS NULL OR BTRIM(template."sportId") = ''
    THEN ARRAY[]::TEXT[]
  WHEN LOWER(BTRIM(template."sportId")) = 'soccer'
    THEN ARRAY['Grass Soccer']::TEXT[]
  WHEN LOWER(BTRIM(template."sportId")) = 'volleyball'
    THEN ARRAY['Indoor Volleyball']::TEXT[]
  WHEN LOWER(BTRIM(template."sportId")) = 'ice hockey'
    THEN ARRAY['Hockey']::TEXT[]
  WHEN LOWER(BTRIM(template."sportId")) = 'ultimate'
    THEN ARRAY['Ultimate Frisbee']::TEXT[]
  ELSE COALESCE(
    (
      SELECT ARRAY[MIN(sport."name")]::TEXT[]
      FROM "Sports" AS sport
      WHERE sport."id" = BTRIM(template."sportId")
         OR LOWER(BTRIM(sport."name")) = LOWER(BTRIM(template."sportId"))
    ),
    ARRAY[]::TEXT[]
  )
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "EventTemplates" AS template
    CROSS JOIN LATERAL unnest(template."sportIds") AS sport_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Sports" AS sport
      WHERE LOWER(BTRIM(sport."name")) = LOWER(BTRIM(sport_name))
    )
  ) THEN
    RAISE EXCEPTION 'Event template sport migration produced a non-canonical sport name.';
  END IF;
END;
$$;

ALTER TABLE "EventTemplates" DROP COLUMN "sportId";

COMMIT;
