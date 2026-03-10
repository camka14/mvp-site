-- Add organization staff memberships and normalize invite semantics.

ALTER TABLE "Invites"
  ADD COLUMN IF NOT EXISTS "staffTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "StaffMembers" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "types" TEXT[] DEFAULT ARRAY[]::TEXT[],

  CONSTRAINT "StaffMembers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffMembers_organizationId_userId_key"
ON "StaffMembers"("organizationId", "userId");

CREATE INDEX IF NOT EXISTS "StaffMembers_organizationId_idx"
ON "StaffMembers"("organizationId");

CREATE INDEX IF NOT EXISTS "StaffMembers_userId_idx"
ON "StaffMembers"("userId");

WITH normalized_hosts AS (
  SELECT
    org."id" AS "organizationId",
    host_id AS "userId",
    'HOST'::TEXT AS "roleType"
  FROM "Organizations" org
  CROSS JOIN LATERAL UNNEST(COALESCE(org."hostIds", ARRAY[]::TEXT[])) AS host_id
  WHERE BTRIM(host_id) <> ''
),
normalized_refs AS (
  SELECT
    org."id" AS "organizationId",
    ref_id AS "userId",
    'REFEREE'::TEXT AS "roleType"
  FROM "Organizations" org
  CROSS JOIN LATERAL UNNEST(COALESCE(org."refIds", ARRAY[]::TEXT[])) AS ref_id
  WHERE BTRIM(ref_id) <> ''
),
merged_staff AS (
  SELECT
    "organizationId",
    "userId",
    ARRAY(
      SELECT DISTINCT entry
      FROM UNNEST(ARRAY_AGG("roleType")) AS entry
      ORDER BY entry
    ) AS "types"
  FROM (
    SELECT * FROM normalized_hosts
    UNION ALL
    SELECT * FROM normalized_refs
  ) source_rows
  GROUP BY "organizationId", "userId"
)
INSERT INTO "StaffMembers" ("id", "createdAt", "updatedAt", "organizationId", "userId", "types")
SELECT
  CONCAT('staff_', REPLACE("organizationId", '-', ''), '_', REPLACE("userId", '-', '')) AS "id",
  NOW(),
  NOW(),
  "organizationId",
  "userId",
  "types"
FROM merged_staff
ON CONFLICT ("organizationId", "userId") DO UPDATE
SET
  "types" = ARRAY(
    SELECT DISTINCT entry
    FROM UNNEST(COALESCE("StaffMembers"."types", ARRAY[]::TEXT[]) || COALESCE(EXCLUDED."types", ARRAY[]::TEXT[])) AS entry
  ),
  "updatedAt" = NOW();

DELETE FROM "Invites"
WHERE UPPER(COALESCE("status", '')) = 'ACCEPTED';

UPDATE "Invites"
SET
  "type" = CASE
    WHEN UPPER(COALESCE("type", '')) IN ('HOST', 'REFEREE') THEN 'STAFF'
    WHEN UPPER(COALESCE("type", '')) IN ('PLAYER', 'TEAM_MANAGER', 'TEAM_HEAD_COACH', 'TEAM_ASSISTANT_COACH') THEN 'TEAM'
    WHEN UPPER(COALESCE("type", '')) = 'EVENT' THEN 'EVENT'
    ELSE UPPER(COALESCE("type", ''))
  END,
  "status" = CASE
    WHEN UPPER(COALESCE("status", '')) IN ('', 'PENDING', 'SENT') THEN 'PENDING'
    WHEN UPPER(COALESCE("status", '')) IN ('DECLINED', 'REJECTED') THEN 'DECLINED'
    ELSE UPPER(COALESCE("status", ''))
  END,
  "staffTypes" = CASE
    WHEN UPPER(COALESCE("type", '')) = 'HOST' THEN ARRAY['HOST']::TEXT[]
    WHEN UPPER(COALESCE("type", '')) = 'REFEREE' THEN ARRAY['REFEREE']::TEXT[]
    ELSE COALESCE("staffTypes", ARRAY[]::TEXT[])
  END,
  "updatedAt" = NOW()
WHERE
  UPPER(COALESCE("type", '')) IN ('HOST', 'REFEREE', 'PLAYER', 'TEAM_MANAGER', 'TEAM_HEAD_COACH', 'TEAM_ASSISTANT_COACH', 'EVENT')
  OR UPPER(COALESCE("status", '')) IN ('', 'PENDING', 'SENT', 'DECLINED', 'REJECTED');
