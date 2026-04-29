-- Backfill normalized event membership from legacy Events arrays before removing
-- the duplicate columns. The application now treats EventRegistrations and
-- EventOfficials as the only persisted source of truth.

WITH legacy_team_ids AS (
  SELECT
    e."id" AS "eventId",
    BTRIM(team_id) AS "registrantId",
    e."hostId" AS "createdBy",
    COALESCE(e."createdAt", NOW()) AS "createdAt",
    COALESCE(e."updatedAt", NOW()) AS "updatedAt"
  FROM "Events" e
  CROSS JOIN LATERAL UNNEST(COALESCE(e."teamIds", ARRAY[]::TEXT[])) AS team_id
  WHERE BTRIM(team_id) <> ''
)
INSERT INTO "EventRegistrations" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "registrantId",
  "parentId",
  "registrantType",
  "rosterRole",
  "status",
  "eventTeamId",
  "createdBy"
)
SELECT
  'legacy_event_team_' || SUBSTRING(MD5(row."eventId" || ':' || row."registrantId") FROM 1 FOR 24),
  row."createdAt",
  row."updatedAt",
  row."eventId",
  row."registrantId",
  NULL,
  'TEAM'::"EventRegistrationsRegistrantTypeEnum",
  'PARTICIPANT'::"EventRegistrationsRosterRoleEnum",
  'ACTIVE'::"EventRegistrationsStatusEnum",
  row."registrantId",
  COALESCE(NULLIF(BTRIM(row."createdBy"), ''), row."registrantId")
FROM legacy_team_ids row
WHERE NOT EXISTS (
  SELECT 1
  FROM "EventRegistrations" existing
  WHERE existing."eventId" = row."eventId"
    AND existing."registrantId" = row."registrantId"
    AND existing."registrantType" = 'TEAM'::"EventRegistrationsRegistrantTypeEnum"
    AND existing."rosterRole" = 'PARTICIPANT'::"EventRegistrationsRosterRoleEnum"
    AND existing."slotId" IS NULL
    AND existing."occurrenceDate" IS NULL
);

WITH legacy_user_ids AS (
  SELECT
    e."id" AS "eventId",
    BTRIM(user_id) AS "registrantId",
    e."hostId" AS "createdBy",
    COALESCE(e."createdAt", NOW()) AS "createdAt",
    COALESCE(e."updatedAt", NOW()) AS "updatedAt"
  FROM "Events" e
  CROSS JOIN LATERAL UNNEST(COALESCE(e."userIds", ARRAY[]::TEXT[])) AS user_id
  WHERE BTRIM(user_id) <> ''
)
INSERT INTO "EventRegistrations" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "registrantId",
  "parentId",
  "registrantType",
  "rosterRole",
  "status",
  "createdBy"
)
SELECT
  'legacy_event_user_' || SUBSTRING(MD5(row."eventId" || ':' || row."registrantId") FROM 1 FOR 24),
  row."createdAt",
  row."updatedAt",
  row."eventId",
  row."registrantId",
  NULL,
  'SELF'::"EventRegistrationsRegistrantTypeEnum",
  'PARTICIPANT'::"EventRegistrationsRosterRoleEnum",
  'ACTIVE'::"EventRegistrationsStatusEnum",
  COALESCE(NULLIF(BTRIM(row."createdBy"), ''), row."registrantId")
FROM legacy_user_ids row
WHERE NOT EXISTS (
  SELECT 1
  FROM "EventRegistrations" existing
  WHERE existing."eventId" = row."eventId"
    AND existing."registrantId" = row."registrantId"
    AND existing."registrantType" IN (
      'SELF'::"EventRegistrationsRegistrantTypeEnum",
      'CHILD'::"EventRegistrationsRegistrantTypeEnum"
    )
    AND existing."rosterRole" = 'PARTICIPANT'::"EventRegistrationsRosterRoleEnum"
    AND existing."slotId" IS NULL
    AND existing."occurrenceDate" IS NULL
);

WITH legacy_waitlist_ids AS (
  SELECT
    e."id" AS "eventId",
    BTRIM(waitlist_id) AS "registrantId",
    e."hostId" AS "createdBy",
    COALESCE(e."createdAt", NOW()) AS "createdAt",
    COALESCE(e."updatedAt", NOW()) AS "updatedAt",
    EXISTS (
      SELECT 1
      FROM "EventTeams" et
      WHERE et."id" = BTRIM(waitlist_id)
    ) AS "isTeam"
  FROM "Events" e
  CROSS JOIN LATERAL UNNEST(COALESCE(e."waitListIds", ARRAY[]::TEXT[])) AS waitlist_id
  WHERE BTRIM(waitlist_id) <> ''
)
INSERT INTO "EventRegistrations" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "registrantId",
  "parentId",
  "registrantType",
  "rosterRole",
  "status",
  "eventTeamId",
  "createdBy"
)
SELECT
  'legacy_event_waitlist_' || SUBSTRING(MD5(row."eventId" || ':' || row."registrantId") FROM 1 FOR 24),
  row."createdAt",
  row."updatedAt",
  row."eventId",
  row."registrantId",
  NULL,
  CASE
    WHEN row."isTeam" THEN 'TEAM'::"EventRegistrationsRegistrantTypeEnum"
    ELSE 'SELF'::"EventRegistrationsRegistrantTypeEnum"
  END,
  'WAITLIST'::"EventRegistrationsRosterRoleEnum",
  'ACTIVE'::"EventRegistrationsStatusEnum",
  CASE WHEN row."isTeam" THEN row."registrantId" ELSE NULL END,
  COALESCE(NULLIF(BTRIM(row."createdBy"), ''), row."registrantId")
FROM legacy_waitlist_ids row
WHERE NOT EXISTS (
  SELECT 1
  FROM "EventRegistrations" existing
  WHERE existing."eventId" = row."eventId"
    AND existing."registrantId" = row."registrantId"
    AND existing."rosterRole" = 'WAITLIST'::"EventRegistrationsRosterRoleEnum"
    AND existing."slotId" IS NULL
    AND existing."occurrenceDate" IS NULL
);

WITH legacy_free_agent_ids AS (
  SELECT
    e."id" AS "eventId",
    BTRIM(free_agent_id) AS "registrantId",
    e."hostId" AS "createdBy",
    COALESCE(e."createdAt", NOW()) AS "createdAt",
    COALESCE(e."updatedAt", NOW()) AS "updatedAt"
  FROM "Events" e
  CROSS JOIN LATERAL UNNEST(COALESCE(e."freeAgentIds", ARRAY[]::TEXT[])) AS free_agent_id
  WHERE BTRIM(free_agent_id) <> ''
)
INSERT INTO "EventRegistrations" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "registrantId",
  "parentId",
  "registrantType",
  "rosterRole",
  "status",
  "createdBy"
)
SELECT
  'legacy_event_free_agent_' || SUBSTRING(MD5(row."eventId" || ':' || row."registrantId") FROM 1 FOR 24),
  row."createdAt",
  row."updatedAt",
  row."eventId",
  row."registrantId",
  NULL,
  'SELF'::"EventRegistrationsRegistrantTypeEnum",
  'FREE_AGENT'::"EventRegistrationsRosterRoleEnum",
  'ACTIVE'::"EventRegistrationsStatusEnum",
  COALESCE(NULLIF(BTRIM(row."createdBy"), ''), row."registrantId")
FROM legacy_free_agent_ids row
WHERE NOT EXISTS (
  SELECT 1
  FROM "EventRegistrations" existing
  WHERE existing."eventId" = row."eventId"
    AND existing."registrantId" = row."registrantId"
    AND existing."registrantType" IN (
      'SELF'::"EventRegistrationsRegistrantTypeEnum",
      'CHILD'::"EventRegistrationsRegistrantTypeEnum"
    )
    AND existing."rosterRole" = 'FREE_AGENT'::"EventRegistrationsRosterRoleEnum"
    AND existing."slotId" IS NULL
    AND existing."occurrenceDate" IS NULL
);

WITH legacy_official_ids AS (
  SELECT
    e."id" AS "eventId",
    BTRIM(official_id) AS "userId",
    COALESCE(e."createdAt", NOW()) AS "createdAt",
    COALESCE(
      ARRAY(
        SELECT position_item.value->>'id'
        FROM jsonb_array_elements(COALESCE(e."officialPositions", '[]'::jsonb)) AS position_item(value)
        WHERE COALESCE(position_item.value->>'id', '') <> ''
      ),
      ARRAY[]::TEXT[]
    ) AS "positionIds"
  FROM "Events" e
  CROSS JOIN LATERAL UNNEST(COALESCE(e."officialIds", ARRAY[]::TEXT[])) AS official_id
  WHERE BTRIM(official_id) <> ''
)
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
  'event_official_' || row."eventId" || '_' || REGEXP_REPLACE(LOWER(row."userId"), '[^a-z0-9]+', '_', 'g'),
  row."createdAt",
  NOW(),
  row."eventId",
  row."userId",
  CASE
    WHEN ARRAY_LENGTH(row."positionIds", 1) > 0 THEN row."positionIds"
    ELSE ARRAY['event_pos_' || row."eventId" || '_0_official']::TEXT[]
  END,
  ARRAY[]::TEXT[],
  TRUE
FROM legacy_official_ids row
ON CONFLICT ("eventId", "userId") DO NOTHING;

ALTER TABLE "Events"
  DROP COLUMN IF EXISTS "userIds",
  DROP COLUMN IF EXISTS "teamIds",
  DROP COLUMN IF EXISTS "waitListIds",
  DROP COLUMN IF EXISTS "freeAgentIds",
  DROP COLUMN IF EXISTS "officialIds";
