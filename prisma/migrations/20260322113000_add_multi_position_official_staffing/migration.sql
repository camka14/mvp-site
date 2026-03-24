DO $$
BEGIN
  CREATE TYPE "EventsOfficialSchedulingModeEnum" AS ENUM ('STAFFING', 'SCHEDULE', 'OFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Matches"
ADD COLUMN IF NOT EXISTS "officialIds" JSONB;

ALTER TABLE "Events"
ADD COLUMN IF NOT EXISTS "officialSchedulingMode" "EventsOfficialSchedulingModeEnum";

ALTER TABLE "Events"
ALTER COLUMN "officialSchedulingMode" SET DEFAULT 'STAFFING';

UPDATE "Events"
SET "officialSchedulingMode" = 'STAFFING'
WHERE "officialSchedulingMode" IS NULL;

ALTER TABLE "Events"
ALTER COLUMN "officialSchedulingMode" SET NOT NULL;

ALTER TABLE "Events"
ADD COLUMN IF NOT EXISTS "officialPositions" JSONB;

ALTER TABLE "Sports"
ADD COLUMN IF NOT EXISTS "officialPositionTemplates" JSONB;

CREATE TABLE IF NOT EXISTS "EventOfficials" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "positionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fieldIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN DEFAULT TRUE,
  CONSTRAINT "EventOfficials_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EventOfficials_eventId_userId_key'
  ) THEN
    ALTER TABLE "EventOfficials"
    ADD CONSTRAINT "EventOfficials_eventId_userId_key" UNIQUE ("eventId", "userId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EventOfficials_eventId_idx" ON "EventOfficials"("eventId");
CREATE INDEX IF NOT EXISTS "EventOfficials_userId_idx" ON "EventOfficials"("userId");

WITH defaults ("sportId", "sportName", "template") AS (
  VALUES
    ('Volleyball', 'Volleyball', '[{"name":"R1","count":1},{"name":"R2","count":1},{"name":"Line Judge","count":2},{"name":"Scorekeeper","count":1}]'::jsonb),
    ('Indoor Volleyball', 'Indoor Volleyball', '[{"name":"R1","count":1},{"name":"R2","count":1},{"name":"Line Judge","count":2},{"name":"Scorekeeper","count":1}]'::jsonb),
    ('Beach Volleyball', 'Beach Volleyball', '[{"name":"R1","count":1},{"name":"R2","count":1},{"name":"Scorekeeper","count":1}]'::jsonb),
    ('Grass Volleyball', 'Grass Volleyball', '[{"name":"R1","count":1},{"name":"R2","count":1},{"name":"Line Judge","count":2},{"name":"Scorekeeper","count":1}]'::jsonb),
    ('Basketball', 'Basketball', '[{"name":"Referee","count":2},{"name":"Scorekeeper","count":1},{"name":"Timekeeper","count":1}]'::jsonb),
    ('Soccer', 'Soccer', '[{"name":"Referee","count":1},{"name":"Assistant Referee","count":2}]'::jsonb),
    ('Indoor Soccer', 'Indoor Soccer', '[{"name":"Referee","count":2},{"name":"Scorekeeper","count":1}]'::jsonb),
    ('Grass Soccer', 'Grass Soccer', '[{"name":"Referee","count":1},{"name":"Assistant Referee","count":2}]'::jsonb),
    ('Beach Soccer', 'Beach Soccer', '[{"name":"Referee","count":2},{"name":"Scorekeeper","count":1}]'::jsonb),
    ('Tennis', 'Tennis', '[{"name":"Umpire","count":1}]'::jsonb),
    ('Pickleball', 'Pickleball', '[{"name":"Referee","count":1}]'::jsonb),
    ('Football', 'Football', '[{"name":"Referee","count":1},{"name":"Umpire","count":1},{"name":"Head Linesman","count":1},{"name":"Line Judge","count":1},{"name":"Back Judge","count":1}]'::jsonb),
    ('Hockey', 'Hockey', '[{"name":"Referee","count":2},{"name":"Linesperson","count":2}]'::jsonb),
    ('Baseball', 'Baseball', '[{"name":"Plate Umpire","count":1},{"name":"Base Umpire","count":2}]'::jsonb),
    ('Other', 'Other', '[{"name":"Official","count":1}]'::jsonb)
)
UPDATE "Sports" AS s
SET
  "officialPositionTemplates" = defaults."template",
  "updatedAt" = NOW()
FROM defaults
WHERE (s."id" = defaults."sportId" OR LOWER(s."name") = LOWER(defaults."sportName"))
  AND s."officialPositionTemplates" IS NULL;

WITH sport_event_positions AS (
  SELECT
    e."id" AS "eventId",
    jsonb_agg(
      jsonb_build_object(
        'id', 'event_pos_' || SUBSTRING(MD5(e."id" || ':' || (item.ordinality - 1)::TEXT || ':' || COALESCE(item.value->>'name', 'Official')) FROM 1 FOR 24),
        'name', COALESCE(item.value->>'name', 'Official'),
        'count', GREATEST(COALESCE((item.value->>'count')::INT, 1), 1),
        'order', item.ordinality - 1
      )
      ORDER BY item.ordinality
    ) AS "positions"
  FROM "Events" e
  JOIN "Sports" s
    ON s."id" = e."sportId"
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s."officialPositionTemplates", '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality)
  WHERE e."officialPositions" IS NULL
  GROUP BY e."id"
)
UPDATE "Events" e
SET
  "officialPositions" = sport_event_positions."positions",
  "updatedAt" = NOW()
FROM sport_event_positions
WHERE e."id" = sport_event_positions."eventId";

UPDATE "Events" e
SET
  "officialPositions" = jsonb_build_array(
    jsonb_build_object(
      'id', 'event_pos_' || SUBSTRING(MD5(e."id" || ':0:Official') FROM 1 FOR 24),
      'name', 'Official',
      'count', 1,
      'order', 0
    )
  ),
  "updatedAt" = NOW()
WHERE e."officialPositions" IS NULL
  AND (
    COALESCE(array_length(e."officialIds", 1), 0) > 0
    OR EXISTS (
      SELECT 1
      FROM "Matches" m
      WHERE m."eventId" = e."id"
        AND m."officialId" IS NOT NULL
    )
  );

INSERT INTO "EventOfficials" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "userId",
  "positionIds",
  "fieldIds",
  "isActive"
)
SELECT
  'event_official_' || SUBSTRING(MD5(e."id" || ':' || official_user.official_user_id) FROM 1 FOR 24) AS "id",
  COALESCE(e."createdAt", NOW()) AS "createdAt",
  NOW() AS "updatedAt",
  e."id" AS "eventId",
  official_user.official_user_id AS "userId",
  COALESCE(
    ARRAY(
      SELECT position_item.value->>'id'
      FROM jsonb_array_elements(COALESCE(e."officialPositions", '[]'::jsonb)) AS position_item(value)
    ),
    ARRAY[]::TEXT[]
  ) AS "positionIds",
  ARRAY[]::TEXT[] AS "fieldIds",
  TRUE AS "isActive"
FROM "Events" e
CROSS JOIN LATERAL unnest(COALESCE(e."officialIds", ARRAY[]::TEXT[])) AS official_user(official_user_id)
ON CONFLICT ("eventId", "userId") DO NOTHING;

INSERT INTO "EventOfficials" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "userId",
  "positionIds",
  "fieldIds",
  "isActive"
)
SELECT DISTINCT
  'event_official_' || SUBSTRING(MD5(m."eventId" || ':' || m."officialId") FROM 1 FOR 24) AS "id",
  COALESCE(e."createdAt", NOW()) AS "createdAt",
  NOW() AS "updatedAt",
  m."eventId" AS "eventId",
  m."officialId" AS "userId",
  COALESCE(
    ARRAY(
      SELECT position_item.value->>'id'
      FROM jsonb_array_elements(COALESCE(e."officialPositions", '[]'::jsonb)) AS position_item(value)
    ),
    ARRAY[]::TEXT[]
  ) AS "positionIds",
  ARRAY[]::TEXT[] AS "fieldIds",
  TRUE AS "isActive"
FROM "Matches" m
JOIN "Events" e
  ON e."id" = m."eventId"
WHERE m."eventId" IS NOT NULL
  AND m."officialId" IS NOT NULL
ON CONFLICT ("eventId", "userId") DO NOTHING;

UPDATE "Matches" m
SET
  "officialIds" = jsonb_build_array(
    jsonb_build_object(
      'positionId', first_position."positionId",
      'slotIndex', 0,
      'holderType', 'OFFICIAL',
      'eventOfficialId', 'event_official_' || SUBSTRING(MD5(m."eventId" || ':' || m."officialId") FROM 1 FOR 24),
      'userId', m."officialId",
      'checkedIn', COALESCE(m."officialCheckedIn", FALSE),
      'hasConflict', FALSE
    )
  ),
  "updatedAt" = NOW()
FROM "Events" e
CROSS JOIN LATERAL (
  SELECT value->>'id' AS "positionId"
  FROM jsonb_array_elements(COALESCE(e."officialPositions", '[]'::jsonb)) WITH ORDINALITY AS position_item(value, ordinality)
  ORDER BY ordinality
  LIMIT 1
) AS first_position
WHERE m."eventId" = e."id"
  AND m."officialId" IS NOT NULL
  AND m."officialIds" IS NULL;
