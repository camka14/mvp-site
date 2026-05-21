-- Scheduling eligibility is driven by official staff type/event assignments,
-- not organization role permissions.

DELETE FROM "OrganizationRolePermissions"
WHERE "permission" = 'officials.schedule';
