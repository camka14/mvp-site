-- Backfill legacy organization host/official arrays into StaffMembers before
-- application code treats StaffMembers as the authoritative organization roster.

WITH normalized_memberships AS (
  SELECT
    org."id" AS "organizationId",
    BTRIM(host_id) AS "userId",
    'HOST'::TEXT AS "roleType"
  FROM "Organizations" org
  CROSS JOIN LATERAL UNNEST(COALESCE(org."hostIds", ARRAY[]::TEXT[])) AS host_id
  WHERE BTRIM(host_id) <> ''

  UNION ALL

  SELECT
    org."id" AS "organizationId",
    BTRIM(official_id) AS "userId",
    'OFFICIAL'::TEXT AS "roleType"
  FROM "Organizations" org
  CROSS JOIN LATERAL UNNEST(COALESCE(org."officialIds", ARRAY[]::TEXT[])) AS official_id
  WHERE BTRIM(official_id) <> ''
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
  FROM normalized_memberships
  GROUP BY "organizationId", "userId"
),
staff_with_default_roles AS (
  SELECT
    staff."organizationId",
    staff."userId",
    staff."types",
    role."id" AS "roleId"
  FROM merged_staff staff
  LEFT JOIN "OrganizationRoles" role
    ON role."organizationId" = staff."organizationId"
    AND role."name" = CASE
      WHEN staff."types" && ARRAY['HOST']::TEXT[] THEN 'Host'
      WHEN staff."types" && ARRAY['OFFICIAL']::TEXT[] THEN 'Official'
      ELSE 'Staff'
    END
)
INSERT INTO "StaffMembers" (
  "id",
  "createdAt",
  "updatedAt",
  "organizationId",
  "userId",
  "types",
  "roleId"
)
SELECT
  CONCAT('staff_', MD5("organizationId" || ':' || "userId")) AS "id",
  NOW(),
  NOW(),
  "organizationId",
  "userId",
  "types",
  "roleId"
FROM staff_with_default_roles
ON CONFLICT ("organizationId", "userId") DO UPDATE
SET
  "types" = ARRAY(
    SELECT DISTINCT entry
    FROM UNNEST(COALESCE("StaffMembers"."types", ARRAY[]::TEXT[]) || COALESCE(EXCLUDED."types", ARRAY[]::TEXT[])) AS entry
    ORDER BY entry
  ),
  "roleId" = COALESCE("StaffMembers"."roleId", EXCLUDED."roleId"),
  "updatedAt" = NOW();

