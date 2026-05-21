-- Remove the redundant Admin default organization role.
-- Existing staff assigned to Admin are reassigned to the organization's Staff role
-- before the Admin role and its permissions are deleted.

WITH admin_roles AS (
  SELECT "id", "organizationId"
  FROM "OrganizationRoles"
  WHERE
    "systemKey" = 'ADMIN'
    OR ("name" = 'Admin' AND "kind" = 'STAFF' AND "isDefault" = true)
),
staff_roles AS (
  SELECT "id", "organizationId"
  FROM "OrganizationRoles"
  WHERE "name" = 'Staff' AND "kind" = 'STAFF'
)
UPDATE "StaffMembers" staff
SET
  "roleId" = staff_roles."id",
  "updatedAt" = NOW()
FROM admin_roles
JOIN staff_roles
  ON staff_roles."organizationId" = admin_roles."organizationId"
WHERE
  staff."organizationId" = admin_roles."organizationId"
  AND staff."roleId" = admin_roles."id";

DELETE FROM "OrganizationRolePermissions"
WHERE "organizationRoleId" IN (
  SELECT "id"
  FROM "OrganizationRoles"
  WHERE
    "systemKey" = 'ADMIN'
    OR ("name" = 'Admin' AND "kind" = 'STAFF' AND "isDefault" = true)
);

DELETE FROM "OrganizationRoles"
WHERE
  "systemKey" = 'ADMIN'
  OR ("name" = 'Admin' AND "kind" = 'STAFF' AND "isDefault" = true);
