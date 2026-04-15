DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'TeamMembershipStatusEnum'
  ) THEN
    CREATE TYPE "TeamMembershipStatusEnum" AS ENUM ('INVITED', 'ACTIVE', 'LEFT', 'REMOVED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'TeamStaffAssignmentsRoleEnum'
  ) THEN
    CREATE TYPE "TeamStaffAssignmentsRoleEnum" AS ENUM ('MANAGER', 'HEAD_COACH', 'ASSISTANT_COACH');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'EventTeamsKindEnum'
  ) THEN
    CREATE TYPE "EventTeamsKindEnum" AS ENUM ('REGISTERED', 'PLACEHOLDER');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'EventTeamStaffAssignmentsStatusEnum'
  ) THEN
    CREATE TYPE "EventTeamStaffAssignmentsStatusEnum" AS ENUM ('ACTIVE', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'VolleyBallTeams'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'EventTeams'
  ) THEN
    EXECUTE 'ALTER TABLE "VolleyBallTeams" RENAME TO "EventTeams"';
  END IF;
END $$;

ALTER TABLE "EventTeams"
  ADD COLUMN IF NOT EXISTS "eventId" TEXT,
  ADD COLUMN IF NOT EXISTS "kind" "EventTeamsKindEnum" DEFAULT 'REGISTERED',
  ADD COLUMN IF NOT EXISTS "playerRegistrationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "staffAssignmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "EventTeams"
SET
  "playerRegistrationIds" = COALESCE("playerRegistrationIds", ARRAY[]::TEXT[]),
  "staffAssignmentIds" = COALESCE("staffAssignmentIds", ARRAY[]::TEXT[])
WHERE "playerRegistrationIds" IS NULL
   OR "staffAssignmentIds" IS NULL;

ALTER TABLE "EventTeams"
  ALTER COLUMN "playerRegistrationIds" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "staffAssignmentIds" SET DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "EventTeams_eventId_idx" ON "EventTeams"("eventId");
CREATE INDEX IF NOT EXISTS "EventTeams_kind_idx" ON "EventTeams"("kind");

CREATE TABLE IF NOT EXISTS "Teams" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "name" TEXT NOT NULL,
  "division" TEXT,
  "divisionTypeId" TEXT,
  "divisionTypeName" TEXT,
  "wins" INTEGER,
  "losses" INTEGER,
  "teamSize" INTEGER NOT NULL,
  "profileImageId" TEXT,
  "sport" TEXT,
  "organizationId" TEXT,
  "createdBy" TEXT,
  CONSTRAINT "Teams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Teams_organizationId_idx" ON "Teams"("organizationId");
CREATE INDEX IF NOT EXISTS "Teams_createdBy_idx" ON "Teams"("createdBy");

CREATE TABLE IF NOT EXISTS "TeamRegistrations" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "TeamMembershipStatusEnum" NOT NULL DEFAULT 'ACTIVE',
  "jerseyNumber" TEXT,
  "position" TEXT,
  "isCaptain" BOOLEAN DEFAULT false,
  "createdBy" TEXT,
  CONSTRAINT "TeamRegistrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamRegistrations_teamId_userId_key"
  ON "TeamRegistrations"("teamId", "userId");
CREATE INDEX IF NOT EXISTS "TeamRegistrations_teamId_status_idx"
  ON "TeamRegistrations"("teamId", "status");
CREATE INDEX IF NOT EXISTS "TeamRegistrations_userId_status_idx"
  ON "TeamRegistrations"("userId", "status");

CREATE TABLE IF NOT EXISTS "TeamStaffAssignments" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TeamStaffAssignmentsRoleEnum" NOT NULL,
  "status" "TeamMembershipStatusEnum" NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT,
  CONSTRAINT "TeamStaffAssignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamStaffAssignments_teamId_userId_role_key"
  ON "TeamStaffAssignments"("teamId", "userId", "role");
CREATE INDEX IF NOT EXISTS "TeamStaffAssignments_teamId_status_idx"
  ON "TeamStaffAssignments"("teamId", "status");
CREATE INDEX IF NOT EXISTS "TeamStaffAssignments_userId_status_idx"
  ON "TeamStaffAssignments"("userId", "status");

CREATE TABLE IF NOT EXISTS "EventTeamStaffAssignments" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "eventTeamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TeamStaffAssignmentsRoleEnum" NOT NULL,
  "status" "EventTeamStaffAssignmentsStatusEnum" NOT NULL DEFAULT 'ACTIVE',
  "sourceStaffAssignmentId" TEXT,
  CONSTRAINT "EventTeamStaffAssignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventTeamStaffAssignments_eventTeamId_userId_role_key"
  ON "EventTeamStaffAssignments"("eventTeamId", "userId", "role");
CREATE INDEX IF NOT EXISTS "EventTeamStaffAssignments_eventTeamId_status_idx"
  ON "EventTeamStaffAssignments"("eventTeamId", "status");
CREATE INDEX IF NOT EXISTS "EventTeamStaffAssignments_userId_status_idx"
  ON "EventTeamStaffAssignments"("userId", "status");
CREATE INDEX IF NOT EXISTS "EventTeamStaffAssignments_sourceStaffAssignmentId_idx"
  ON "EventTeamStaffAssignments"("sourceStaffAssignmentId");

ALTER TABLE "EventRegistrations"
  ADD COLUMN IF NOT EXISTS "eventTeamId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceTeamRegistrationId" TEXT,
  ADD COLUMN IF NOT EXISTS "jerseyNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "position" TEXT,
  ADD COLUMN IF NOT EXISTS "isCaptain" BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS "EventRegistrations_eventTeamId_idx"
  ON "EventRegistrations"("eventTeamId");
CREATE INDEX IF NOT EXISTS "EventRegistrations_sourceTeamRegistrationId_idx"
  ON "EventRegistrations"("sourceTeamRegistrationId");

UPDATE "EventTeams" AS et
SET "eventId" = (
  SELECT e."id"
  FROM "Events" AS e
  WHERE et."id" = ANY(COALESCE(e."teamIds", ARRAY[]::TEXT[]))
  ORDER BY e."createdAt" ASC NULLS LAST, e."id" ASC
  LIMIT 1
)
WHERE et."eventId" IS NULL;

UPDATE "EventTeams"
SET "kind" = CASE
  WHEN COALESCE(BTRIM("captainId"), '') = ''
    AND COALESCE(BTRIM("managerId"), '') = ''
    AND COALESCE(array_length("playerIds", 1), 0) = 0
    AND COALESCE(array_length("pending", 1), 0) = 0
    THEN 'PLACEHOLDER'::"EventTeamsKindEnum"
  WHEN LOWER(COALESCE("name", '')) LIKE 'place holder%'
    OR LOWER(COALESCE("name", '')) LIKE 'placeholder%'
    THEN 'PLACEHOLDER'::"EventTeamsKindEnum"
  ELSE 'REGISTERED'::"EventTeamsKindEnum"
END
WHERE "kind" IS NULL
   OR "kind" = 'REGISTERED'::"EventTeamsKindEnum";

INSERT INTO "Teams" (
  "id",
  "createdAt",
  "updatedAt",
  "name",
  "division",
  "divisionTypeId",
  "divisionTypeName",
  "wins",
  "losses",
  "teamSize",
  "profileImageId",
  "sport",
  "organizationId",
  "createdBy"
)
SELECT
  et."id",
  et."createdAt",
  et."updatedAt",
  et."name",
  et."division",
  et."divisionTypeId",
  et."divisionTypeName",
  et."wins",
  et."losses",
  et."teamSize",
  et."profileImageId",
  et."sport",
  NULL,
  NULLIF(BTRIM(et."managerId"), '')
FROM "EventTeams" AS et
WHERE et."parentTeamId" IS NULL
  AND COALESCE(et."kind", 'REGISTERED'::"EventTeamsKindEnum") = 'REGISTERED'::"EventTeamsKindEnum"
  AND (
    COALESCE(BTRIM(et."captainId"), '') <> ''
    OR COALESCE(BTRIM(et."managerId"), '') <> ''
    OR COALESCE(array_length(et."playerIds", 1), 0) > 0
    OR COALESCE(array_length(et."pending", 1), 0) > 0
  )
ON CONFLICT ("id") DO UPDATE SET
  "updatedAt" = EXCLUDED."updatedAt",
  "name" = EXCLUDED."name",
  "division" = EXCLUDED."division",
  "divisionTypeId" = EXCLUDED."divisionTypeId",
  "divisionTypeName" = EXCLUDED."divisionTypeName",
  "wins" = EXCLUDED."wins",
  "losses" = EXCLUDED."losses",
  "teamSize" = EXCLUDED."teamSize",
  "profileImageId" = EXCLUDED."profileImageId",
  "sport" = EXCLUDED."sport",
  "createdBy" = COALESCE("Teams"."createdBy", EXCLUDED."createdBy");

INSERT INTO "TeamRegistrations" (
  "id",
  "createdAt",
  "updatedAt",
  "teamId",
  "userId",
  "status",
  "jerseyNumber",
  "position",
  "isCaptain",
  "createdBy"
)
SELECT
  et."id" || '__' || player_id,
  et."createdAt",
  et."updatedAt",
  et."id",
  player_id,
  'ACTIVE'::"TeamMembershipStatusEnum",
  NULL,
  NULL,
  player_id = et."captainId",
  NULLIF(BTRIM(et."managerId"), '')
FROM "EventTeams" AS et
CROSS JOIN LATERAL UNNEST(COALESCE(et."playerIds", ARRAY[]::TEXT[])) AS player_id
WHERE EXISTS (SELECT 1 FROM "Teams" AS t WHERE t."id" = et."id")
ON CONFLICT ("teamId", "userId") DO UPDATE SET
  "status" = EXCLUDED."status",
  "isCaptain" = COALESCE(EXCLUDED."isCaptain", "TeamRegistrations"."isCaptain"),
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "TeamRegistrations" (
  "id",
  "createdAt",
  "updatedAt",
  "teamId",
  "userId",
  "status",
  "jerseyNumber",
  "position",
  "isCaptain",
  "createdBy"
)
SELECT
  et."id" || '__' || et."captainId",
  et."createdAt",
  et."updatedAt",
  et."id",
  et."captainId",
  'ACTIVE'::"TeamMembershipStatusEnum",
  NULL,
  NULL,
  true,
  NULLIF(BTRIM(et."managerId"), '')
FROM "EventTeams" AS et
WHERE EXISTS (SELECT 1 FROM "Teams" AS t WHERE t."id" = et."id")
  AND COALESCE(BTRIM(et."captainId"), '') <> ''
ON CONFLICT ("teamId", "userId") DO UPDATE SET
  "status" = 'ACTIVE'::"TeamMembershipStatusEnum",
  "isCaptain" = true,
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "TeamRegistrations" (
  "id",
  "createdAt",
  "updatedAt",
  "teamId",
  "userId",
  "status",
  "jerseyNumber",
  "position",
  "isCaptain",
  "createdBy"
)
SELECT
  et."id" || '__' || pending_id,
  et."createdAt",
  et."updatedAt",
  et."id",
  pending_id,
  'INVITED'::"TeamMembershipStatusEnum",
  NULL,
  NULL,
  false,
  NULLIF(BTRIM(et."managerId"), '')
FROM "EventTeams" AS et
CROSS JOIN LATERAL UNNEST(COALESCE(et."pending", ARRAY[]::TEXT[])) AS pending_id
WHERE EXISTS (SELECT 1 FROM "Teams" AS t WHERE t."id" = et."id")
ON CONFLICT ("teamId", "userId") DO UPDATE SET
  "status" = CASE
    WHEN "TeamRegistrations"."status" = 'ACTIVE'::"TeamMembershipStatusEnum" THEN "TeamRegistrations"."status"
    ELSE EXCLUDED."status"
  END,
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "TeamStaffAssignments" (
  "id",
  "createdAt",
  "updatedAt",
  "teamId",
  "userId",
  "role",
  "status",
  "createdBy"
)
SELECT
  et."id" || '__MANAGER__' || et."managerId",
  et."createdAt",
  et."updatedAt",
  et."id",
  et."managerId",
  'MANAGER'::"TeamStaffAssignmentsRoleEnum",
  'ACTIVE'::"TeamMembershipStatusEnum",
  NULLIF(BTRIM(et."managerId"), '')
FROM "EventTeams" AS et
WHERE EXISTS (SELECT 1 FROM "Teams" AS t WHERE t."id" = et."id")
  AND COALESCE(BTRIM(et."managerId"), '') <> ''
ON CONFLICT ("teamId", "userId", "role") DO UPDATE SET
  "status" = EXCLUDED."status",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "TeamStaffAssignments" (
  "id",
  "createdAt",
  "updatedAt",
  "teamId",
  "userId",
  "role",
  "status",
  "createdBy"
)
SELECT
  et."id" || '__HEAD_COACH__' || et."headCoachId",
  et."createdAt",
  et."updatedAt",
  et."id",
  et."headCoachId",
  'HEAD_COACH'::"TeamStaffAssignmentsRoleEnum",
  'ACTIVE'::"TeamMembershipStatusEnum",
  NULLIF(BTRIM(et."managerId"), '')
FROM "EventTeams" AS et
WHERE EXISTS (SELECT 1 FROM "Teams" AS t WHERE t."id" = et."id")
  AND COALESCE(BTRIM(et."headCoachId"), '') <> ''
ON CONFLICT ("teamId", "userId", "role") DO UPDATE SET
  "status" = EXCLUDED."status",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "TeamStaffAssignments" (
  "id",
  "createdAt",
  "updatedAt",
  "teamId",
  "userId",
  "role",
  "status",
  "createdBy"
)
SELECT
  et."id" || '__ASSISTANT_COACH__' || coach_id,
  et."createdAt",
  et."updatedAt",
  et."id",
  coach_id,
  'ASSISTANT_COACH'::"TeamStaffAssignmentsRoleEnum",
  'ACTIVE'::"TeamMembershipStatusEnum",
  NULLIF(BTRIM(et."managerId"), '')
FROM "EventTeams" AS et
CROSS JOIN LATERAL UNNEST(COALESCE(et."coachIds", ARRAY[]::TEXT[])) AS coach_id
WHERE EXISTS (SELECT 1 FROM "Teams" AS t WHERE t."id" = et."id")
ON CONFLICT ("teamId", "userId", "role") DO UPDATE SET
  "status" = EXCLUDED."status",
  "updatedAt" = EXCLUDED."updatedAt";

UPDATE "EventRegistrations"
SET "eventTeamId" = "registrantId"
WHERE "registrantType" = 'TEAM'
  AND "eventTeamId" IS NULL;

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
  "divisionId",
  "divisionTypeId",
  "divisionTypeKey",
  "createdBy"
)
SELECT
  et."eventId" || '__team__' || et."id",
  COALESCE(et."createdAt", NOW()),
  COALESCE(et."updatedAt", NOW()),
  et."eventId",
  et."id",
  NULLIF(BTRIM(et."parentTeamId"), ''),
  'TEAM'::"EventRegistrationsRegistrantTypeEnum",
  'PARTICIPANT'::"EventRegistrationsRosterRoleEnum",
  'ACTIVE'::"EventRegistrationsStatusEnum",
  et."id",
  et."division",
  et."divisionTypeId",
  LOWER(COALESCE(et."divisionTypeName", et."division", '')),
  COALESCE(NULLIF(BTRIM(et."managerId"), ''), NULLIF(BTRIM(et."captainId"), ''), et."id")
FROM "EventTeams" AS et
WHERE et."eventId" IS NOT NULL
  AND COALESCE(et."kind", 'REGISTERED'::"EventTeamsKindEnum") = 'REGISTERED'::"EventTeamsKindEnum"
ON CONFLICT ("id") DO UPDATE SET
  "eventTeamId" = EXCLUDED."eventTeamId",
  "divisionId" = EXCLUDED."divisionId",
  "divisionTypeId" = EXCLUDED."divisionTypeId",
  "divisionTypeKey" = EXCLUDED."divisionTypeKey",
  "updatedAt" = EXCLUDED."updatedAt";

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
  "sourceTeamRegistrationId",
  "divisionId",
  "divisionTypeId",
  "divisionTypeKey",
  "jerseyNumber",
  "position",
  "isCaptain",
  "createdBy"
)
SELECT
  et."eventId" || '__self__' || player_id,
  COALESCE(et."createdAt", NOW()),
  COALESCE(et."updatedAt", NOW()),
  et."eventId",
  player_id,
  NULL,
  'SELF'::"EventRegistrationsRegistrantTypeEnum",
  'PARTICIPANT'::"EventRegistrationsRosterRoleEnum",
  'ACTIVE'::"EventRegistrationsStatusEnum",
  et."id",
  COALESCE(NULLIF(BTRIM(et."parentTeamId"), ''), et."id") || '__' || player_id,
  et."division",
  et."divisionTypeId",
  LOWER(COALESCE(et."divisionTypeName", et."division", '')),
  NULL,
  NULL,
  player_id = et."captainId",
  COALESCE(NULLIF(BTRIM(et."managerId"), ''), NULLIF(BTRIM(et."captainId"), ''), et."id")
FROM "EventTeams" AS et
CROSS JOIN LATERAL UNNEST(COALESCE(et."playerIds", ARRAY[]::TEXT[])) AS player_id
WHERE et."eventId" IS NOT NULL
  AND COALESCE(et."kind", 'REGISTERED'::"EventTeamsKindEnum") = 'REGISTERED'::"EventTeamsKindEnum"
ON CONFLICT ("id") DO UPDATE SET
  "eventTeamId" = EXCLUDED."eventTeamId",
  "sourceTeamRegistrationId" = EXCLUDED."sourceTeamRegistrationId",
  "divisionId" = EXCLUDED."divisionId",
  "divisionTypeId" = EXCLUDED."divisionTypeId",
  "divisionTypeKey" = EXCLUDED."divisionTypeKey",
  "isCaptain" = COALESCE(EXCLUDED."isCaptain", "EventRegistrations"."isCaptain"),
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "EventTeamStaffAssignments" (
  "id",
  "createdAt",
  "updatedAt",
  "eventTeamId",
  "userId",
  "role",
  "status",
  "sourceStaffAssignmentId"
)
SELECT
  et."id" || '__MANAGER__' || et."managerId",
  COALESCE(et."createdAt", NOW()),
  COALESCE(et."updatedAt", NOW()),
  et."id",
  et."managerId",
  'MANAGER'::"TeamStaffAssignmentsRoleEnum",
  'ACTIVE'::"EventTeamStaffAssignmentsStatusEnum",
  COALESCE(NULLIF(BTRIM(et."parentTeamId"), ''), et."id") || '__MANAGER__' || et."managerId"
FROM "EventTeams" AS et
WHERE et."eventId" IS NOT NULL
  AND COALESCE(BTRIM(et."managerId"), '') <> ''
ON CONFLICT ("eventTeamId", "userId", "role") DO UPDATE SET
  "status" = EXCLUDED."status",
  "sourceStaffAssignmentId" = COALESCE("EventTeamStaffAssignments"."sourceStaffAssignmentId", EXCLUDED."sourceStaffAssignmentId"),
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "EventTeamStaffAssignments" (
  "id",
  "createdAt",
  "updatedAt",
  "eventTeamId",
  "userId",
  "role",
  "status",
  "sourceStaffAssignmentId"
)
SELECT
  et."id" || '__HEAD_COACH__' || et."headCoachId",
  COALESCE(et."createdAt", NOW()),
  COALESCE(et."updatedAt", NOW()),
  et."id",
  et."headCoachId",
  'HEAD_COACH'::"TeamStaffAssignmentsRoleEnum",
  'ACTIVE'::"EventTeamStaffAssignmentsStatusEnum",
  COALESCE(NULLIF(BTRIM(et."parentTeamId"), ''), et."id") || '__HEAD_COACH__' || et."headCoachId"
FROM "EventTeams" AS et
WHERE et."eventId" IS NOT NULL
  AND COALESCE(BTRIM(et."headCoachId"), '') <> ''
ON CONFLICT ("eventTeamId", "userId", "role") DO UPDATE SET
  "status" = EXCLUDED."status",
  "sourceStaffAssignmentId" = COALESCE("EventTeamStaffAssignments"."sourceStaffAssignmentId", EXCLUDED."sourceStaffAssignmentId"),
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "EventTeamStaffAssignments" (
  "id",
  "createdAt",
  "updatedAt",
  "eventTeamId",
  "userId",
  "role",
  "status",
  "sourceStaffAssignmentId"
)
SELECT
  et."id" || '__ASSISTANT_COACH__' || coach_id,
  COALESCE(et."createdAt", NOW()),
  COALESCE(et."updatedAt", NOW()),
  et."id",
  coach_id,
  'ASSISTANT_COACH'::"TeamStaffAssignmentsRoleEnum",
  'ACTIVE'::"EventTeamStaffAssignmentsStatusEnum",
  COALESCE(NULLIF(BTRIM(et."parentTeamId"), ''), et."id") || '__ASSISTANT_COACH__' || coach_id
FROM "EventTeams" AS et
CROSS JOIN LATERAL UNNEST(COALESCE(et."coachIds", ARRAY[]::TEXT[])) AS coach_id
WHERE et."eventId" IS NOT NULL
ON CONFLICT ("eventTeamId", "userId", "role") DO UPDATE SET
  "status" = EXCLUDED."status",
  "sourceStaffAssignmentId" = COALESCE("EventTeamStaffAssignments"."sourceStaffAssignmentId", EXCLUDED."sourceStaffAssignmentId"),
  "updatedAt" = EXCLUDED."updatedAt";

UPDATE "EventTeams" AS et
SET "playerRegistrationIds" = COALESCE((
  SELECT ARRAY_AGG(er."id" ORDER BY er."createdAt" ASC NULLS LAST, er."id" ASC)
  FROM "EventRegistrations" AS er
  WHERE er."eventTeamId" = et."id"
    AND er."registrantType" <> 'TEAM'
), ARRAY[]::TEXT[]);

UPDATE "EventTeams" AS et
SET "staffAssignmentIds" = COALESCE((
  SELECT ARRAY_AGG(etsa."id" ORDER BY etsa."createdAt" ASC NULLS LAST, etsa."id" ASC)
  FROM "EventTeamStaffAssignments" AS etsa
  WHERE etsa."eventTeamId" = et."id"
), ARRAY[]::TEXT[]);
