import {
  DEFAULT_ORGANIZATION_ROLES,
  getDefaultRoleDefinitionByKey,
  getDefaultRoleKeyForStaffTypes,
  type DefaultOrganizationRoleKey,
  type OrganizationPermission,
} from '@/lib/organizationPermissions';
import type { StaffMemberType } from '@/types';

type OrganizationRoleRow = {
  id: string;
  organizationId: string;
  name: string;
  kind: string;
  systemKey: string | null;
  isSystem: boolean;
  isDefault: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

type RolePermissionRow = {
  organizationRoleId: string;
  permission: string;
};

type OrganizationRoleClient = {
  organizationRoles?: {
    findMany?: (args: any) => Promise<OrganizationRoleRow[]>;
    findFirst?: (args: any) => Promise<OrganizationRoleRow | null>;
    findUnique?: (args: any) => Promise<OrganizationRoleRow | null>;
    create?: (args: any) => Promise<OrganizationRoleRow>;
    update?: (args: any) => Promise<OrganizationRoleRow>;
    upsert?: (args: any) => Promise<OrganizationRoleRow>;
  };
  organizationRolePermissions?: {
    findMany?: (args: any) => Promise<RolePermissionRow[]>;
    createMany?: (args: any) => Promise<unknown>;
    deleteMany?: (args: any) => Promise<unknown>;
  };
};

export type OrganizationRoleWithPermissions = OrganizationRoleRow & {
  permissions: OrganizationPermission[];
};

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export const getOrganizationRolesWithPermissions = async (
  client: OrganizationRoleClient,
  organizationId: string,
): Promise<OrganizationRoleWithPermissions[]> => {
  if (!client.organizationRoles?.findMany || !client.organizationRolePermissions?.findMany) {
    return [];
  }

  const roles = await client.organizationRoles.findMany({
    where: { organizationId },
    orderBy: [
      { isSystem: 'desc' },
      { isDefault: 'desc' },
      { name: 'asc' },
    ],
  });
  if (!roles.length) {
    return [];
  }

  const permissions = await client.organizationRolePermissions.findMany({
    where: {
      organizationRoleId: {
        in: roles.map((role) => role.id),
      },
    },
    select: {
      organizationRoleId: true,
      permission: true,
    },
  });
  const permissionsByRoleId = new Map<string, OrganizationPermission[]>();
  permissions.forEach((row) => {
    const next = permissionsByRoleId.get(row.organizationRoleId) ?? [];
    next.push(row.permission as OrganizationPermission);
    permissionsByRoleId.set(row.organizationRoleId, next);
  });

  return roles.map((role) => ({
    ...role,
    permissions: permissionsByRoleId.get(role.id) ?? [],
  }));
};

export const ensureDefaultOrganizationRoles = async (
  client: OrganizationRoleClient,
  organizationId: string,
): Promise<OrganizationRoleWithPermissions[]> => {
  if (!client.organizationRoles?.upsert || !client.organizationRolePermissions?.createMany) {
    return getOrganizationRolesWithPermissions(client, organizationId);
  }

  for (const definition of DEFAULT_ORGANIZATION_ROLES) {
    const role = await client.organizationRoles.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: definition.name,
        },
      },
      create: {
        id: createId('org_role'),
        organizationId,
        name: definition.name,
        kind: definition.kind,
        systemKey: definition.systemKey,
        isSystem: definition.isSystem,
        isDefault: definition.isDefault,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        kind: definition.kind,
        systemKey: definition.systemKey,
        isSystem: definition.isSystem,
        isDefault: definition.isDefault,
        updatedAt: new Date(),
      },
    });

    await client.organizationRolePermissions.createMany({
      data: definition.permissions.map((permission) => ({
        id: createId('org_role_permission'),
        organizationRoleId: role.id,
        permission,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  return getOrganizationRolesWithPermissions(client, organizationId);
};

export const findDefaultOrganizationRole = async (
  client: OrganizationRoleClient,
  organizationId: string,
  key: DefaultOrganizationRoleKey,
): Promise<OrganizationRoleWithPermissions | null> => {
  const definition = getDefaultRoleDefinitionByKey(key);
  const roles = await ensureDefaultOrganizationRoles(client, organizationId);
  return roles.find((role) => (
    role.name === definition.name
    && (definition.systemKey === null || role.systemKey === definition.systemKey)
  )) ?? null;
};

export const resolveDefaultOrganizationRoleIdForStaffTypes = async (
  client: OrganizationRoleClient,
  organizationId: string,
  types: readonly StaffMemberType[],
): Promise<string | null> => {
  const key = getDefaultRoleKeyForStaffTypes(types);
  const role = await findDefaultOrganizationRole(client, organizationId, key);
  return role?.id ?? null;
};
