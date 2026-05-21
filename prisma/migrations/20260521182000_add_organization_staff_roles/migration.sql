-- Add organization-scoped staff roles and role permissions.
-- This migration is additive: existing StaffMembers.types remains the source for
-- Host and Official scheduling behavior while StaffMembers.roleId becomes the
-- authorization role assignment.

ALTER TABLE "StaffMembers"
  ADD COLUMN IF NOT EXISTS "roleId" TEXT;

CREATE INDEX IF NOT EXISTS "StaffMembers_roleId_idx"
ON "StaffMembers"("roleId");

CREATE TABLE IF NOT EXISTS "OrganizationRoles" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "systemKey" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "OrganizationRoles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationRoles_organizationId_name_key"
ON "OrganizationRoles"("organizationId", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationRoles_organizationId_systemKey_key"
ON "OrganizationRoles"("organizationId", "systemKey")
WHERE "systemKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "OrganizationRoles_organizationId_idx"
ON "OrganizationRoles"("organizationId");

CREATE INDEX IF NOT EXISTS "OrganizationRoles_systemKey_idx"
ON "OrganizationRoles"("systemKey");

CREATE TABLE IF NOT EXISTS "OrganizationRolePermissions" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "organizationRoleId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,

  CONSTRAINT "OrganizationRolePermissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationRolePermissions_organizationRoleId_permission_key"
ON "OrganizationRolePermissions"("organizationRoleId", "permission");

CREATE INDEX IF NOT EXISTS "OrganizationRolePermissions_organizationRoleId_idx"
ON "OrganizationRolePermissions"("organizationRoleId");

CREATE INDEX IF NOT EXISTS "OrganizationRolePermissions_permission_idx"
ON "OrganizationRolePermissions"("permission");

WITH default_roles AS (
  SELECT
    org."id" AS "organizationId",
    role_row."name",
    role_row."kind",
    role_row."systemKey",
    role_row."isSystem",
    role_row."isDefault",
    role_row."sortKey"
  FROM "Organizations" org
  CROSS JOIN (
    VALUES
      ('Admin', 'STAFF', 'ADMIN', false, true, 1),
      ('Staff', 'STAFF', NULL, false, true, 2),
      ('Host', 'HOST', 'HOST', true, true, 3),
      ('Official', 'OFFICIAL', 'OFFICIAL', true, true, 4)
  ) AS role_row("name", "kind", "systemKey", "isSystem", "isDefault", "sortKey")
)
INSERT INTO "OrganizationRoles" (
  "id",
  "createdAt",
  "updatedAt",
  "organizationId",
  "name",
  "kind",
  "systemKey",
  "isSystem",
  "isDefault"
)
SELECT
  CONCAT('org_role_', REPLACE(default_roles."organizationId", '-', ''), '_', LOWER(REPLACE(default_roles."name", ' ', '_'))) AS "id",
  NOW(),
  NOW(),
  default_roles."organizationId",
  default_roles."name",
  default_roles."kind",
  default_roles."systemKey",
  default_roles."isSystem",
  default_roles."isDefault"
FROM default_roles
ON CONFLICT ("organizationId", "name") DO UPDATE
SET
  "kind" = EXCLUDED."kind",
  "systemKey" = EXCLUDED."systemKey",
  "isSystem" = EXCLUDED."isSystem",
  "isDefault" = EXCLUDED."isDefault",
  "updatedAt" = NOW();

WITH management_permissions AS (
  SELECT permission
  FROM (
    VALUES
      ('organization.manage'),
      ('staff.manage'),
      ('roles.manage'),
      ('events.manage'),
      ('fields.manage'),
      ('teams.manage'),
      ('products.manage'),
      ('billing.manage'),
      ('payments.manage'),
      ('refunds.manage'),
      ('templates.manage'),
      ('users.view')
  ) AS permission_rows(permission)
),
official_permissions AS (
  SELECT permission
  FROM (
    VALUES
      ('officials.schedule')
  ) AS permission_rows(permission)
),
role_permissions AS (
  SELECT role."id" AS "roleId", permission
  FROM "OrganizationRoles" role
  CROSS JOIN management_permissions
  WHERE role."name" IN ('Admin', 'Staff', 'Host')

  UNION ALL

  SELECT role."id" AS "roleId", permission
  FROM "OrganizationRoles" role
  CROSS JOIN official_permissions
  WHERE role."name" = 'Official'
)
INSERT INTO "OrganizationRolePermissions" (
  "id",
  "createdAt",
  "updatedAt",
  "organizationRoleId",
  "permission"
)
SELECT
  CONCAT(
    'org_role_perm_',
    REPLACE(role_permissions."roleId", '-', ''),
    '_',
    REPLACE(REPLACE(role_permissions."permission", '.', '_'), '-', '_')
  ) AS "id",
  NOW(),
  NOW(),
  role_permissions."roleId",
  role_permissions."permission"
FROM role_permissions
ON CONFLICT ("organizationRoleId", "permission") DO NOTHING;

UPDATE "StaffMembers" staff
SET
  "roleId" = role."id",
  "updatedAt" = COALESCE(staff."updatedAt", NOW())
FROM "OrganizationRoles" role
WHERE
  role."organizationId" = staff."organizationId"
  AND staff."roleId" IS NULL
  AND role."name" = CASE
    WHEN COALESCE(staff."types", ARRAY[]::TEXT[]) && ARRAY['STAFF']::TEXT[] THEN 'Staff'
    WHEN COALESCE(staff."types", ARRAY[]::TEXT[]) && ARRAY['HOST']::TEXT[] THEN 'Host'
    WHEN COALESCE(staff."types", ARRAY[]::TEXT[]) && ARRAY['OFFICIAL']::TEXT[] THEN 'Official'
    ELSE 'Staff'
  END;
