-- Remove any remaining legacy Admin organization roles.
-- Staff assigned to Admin fall back to the organization's default/custom Staff role.

WITH admin_roles AS (
  SELECT "id"
  FROM "OrganizationRoles"
  WHERE
    "systemKey" = 'ADMIN'
    OR LOWER("name") = 'admin'
)
UPDATE "StaffMembers" staff
SET
  "roleId" = (
    SELECT role."id"
    FROM "OrganizationRoles" role
    WHERE
      role."organizationId" = staff."organizationId"
      AND role."kind" = 'STAFF'
      AND (role."systemKey" IS NULL OR role."systemKey" <> 'ADMIN')
      AND LOWER(role."name") <> 'admin'
    ORDER BY
      role."isDefault" DESC,
      CASE WHEN role."name" = 'Staff' THEN 0 ELSE 1 END,
      role."name" ASC
    LIMIT 1
  ),
  "updatedAt" = NOW()
WHERE staff."roleId" IN (SELECT "id" FROM admin_roles);

DELETE FROM "OrganizationRolePermissions"
WHERE "organizationRoleId" IN (
  SELECT "id"
  FROM "OrganizationRoles"
  WHERE
    "systemKey" = 'ADMIN'
    OR LOWER("name") = 'admin'
);

DELETE FROM "OrganizationRoles"
WHERE
  "systemKey" = 'ADMIN'
  OR LOWER("name") = 'admin';
