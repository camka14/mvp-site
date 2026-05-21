import type { StaffMemberType } from '@/types';

export const ORG_PERMISSIONS = {
  ORGANIZATION_MANAGE: 'organization.manage',
  STAFF_MANAGE: 'staff.manage',
  ROLES_MANAGE: 'roles.manage',
  EVENTS_MANAGE: 'events.manage',
  FIELDS_MANAGE: 'fields.manage',
  TEAMS_MANAGE: 'teams.manage',
  PRODUCTS_MANAGE: 'products.manage',
  BILLING_MANAGE: 'billing.manage',
  PAYMENTS_MANAGE: 'payments.manage',
  REFUNDS_MANAGE: 'refunds.manage',
  TEMPLATES_MANAGE: 'templates.manage',
  USERS_VIEW: 'users.view',
} as const;

export type OrganizationPermission = typeof ORG_PERMISSIONS[keyof typeof ORG_PERMISSIONS];
export type OrganizationRoleKind = 'OWNER' | 'STAFF' | 'HOST' | 'OFFICIAL';
export type DefaultOrganizationRoleKey = 'STAFF' | 'HOST' | 'OFFICIAL';

export type OrganizationPermissionOption = {
  value: OrganizationPermission;
  label: string;
  description: string;
};

export type DefaultOrganizationRoleDefinition = {
  key: DefaultOrganizationRoleKey;
  name: string;
  kind: OrganizationRoleKind;
  systemKey: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions: OrganizationPermission[];
};

const MANAGEMENT_PERMISSIONS: OrganizationPermission[] = [
  ORG_PERMISSIONS.ORGANIZATION_MANAGE,
  ORG_PERMISSIONS.STAFF_MANAGE,
  ORG_PERMISSIONS.ROLES_MANAGE,
  ORG_PERMISSIONS.EVENTS_MANAGE,
  ORG_PERMISSIONS.FIELDS_MANAGE,
  ORG_PERMISSIONS.TEAMS_MANAGE,
  ORG_PERMISSIONS.PRODUCTS_MANAGE,
  ORG_PERMISSIONS.BILLING_MANAGE,
  ORG_PERMISSIONS.PAYMENTS_MANAGE,
  ORG_PERMISSIONS.REFUNDS_MANAGE,
  ORG_PERMISSIONS.TEMPLATES_MANAGE,
  ORG_PERMISSIONS.USERS_VIEW,
];

export const ORGANIZATION_PERMISSION_OPTIONS: OrganizationPermissionOption[] = [
  {
    value: ORG_PERMISSIONS.ORGANIZATION_MANAGE,
    label: 'Manage organization',
    description: 'Update organization settings and access organization management surfaces.',
  },
  {
    value: ORG_PERMISSIONS.STAFF_MANAGE,
    label: 'Manage staff',
    description: 'Invite staff, remove staff, and update staff behavior flags.',
  },
  {
    value: ORG_PERMISSIONS.ROLES_MANAGE,
    label: 'Manage roles',
    description: 'Create roles and update role permissions.',
  },
  {
    value: ORG_PERMISSIONS.EVENTS_MANAGE,
    label: 'Manage events',
    description: 'Create and update organization-hosted events.',
  },
  {
    value: ORG_PERMISSIONS.FIELDS_MANAGE,
    label: 'Manage fields',
    description: 'Create and update organization fields and rentals.',
  },
  {
    value: ORG_PERMISSIONS.TEAMS_MANAGE,
    label: 'Manage teams',
    description: 'Create and update organization teams.',
  },
  {
    value: ORG_PERMISSIONS.PRODUCTS_MANAGE,
    label: 'Manage products',
    description: 'Create and update organization store products.',
  },
  {
    value: ORG_PERMISSIONS.BILLING_MANAGE,
    label: 'Manage billing',
    description: 'Access organization billing setup and billing operations.',
  },
  {
    value: ORG_PERMISSIONS.PAYMENTS_MANAGE,
    label: 'Manage payments',
    description: 'View and manage organization payment records.',
  },
  {
    value: ORG_PERMISSIONS.REFUNDS_MANAGE,
    label: 'Manage refunds',
    description: 'Review and act on refund requests.',
  },
  {
    value: ORG_PERMISSIONS.TEMPLATES_MANAGE,
    label: 'Manage templates',
    description: 'Create and update organization document and event templates.',
  },
  {
    value: ORG_PERMISSIONS.USERS_VIEW,
    label: 'View users',
    description: 'View organization user and customer lists.',
  },
];

export const DEFAULT_ORGANIZATION_ROLES: DefaultOrganizationRoleDefinition[] = [
  {
    key: 'STAFF',
    name: 'Staff',
    kind: 'STAFF',
    systemKey: null,
    isSystem: false,
    isDefault: true,
    permissions: MANAGEMENT_PERMISSIONS,
  },
  {
    key: 'HOST',
    name: 'Host',
    kind: 'HOST',
    systemKey: 'HOST',
    isSystem: true,
    isDefault: true,
    permissions: MANAGEMENT_PERMISSIONS,
  },
  {
    key: 'OFFICIAL',
    name: 'Official',
    kind: 'OFFICIAL',
    systemKey: 'OFFICIAL',
    isSystem: true,
    isDefault: true,
    permissions: [],
  },
];

export const isOrganizationPermission = (value: unknown): value is OrganizationPermission => (
  typeof value === 'string'
  && ORGANIZATION_PERMISSION_OPTIONS.some((option) => option.value === value)
);

export const normalizeOrganizationPermissions = (values: unknown): OrganizationPermission[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values.filter(isOrganizationPermission),
    ),
  );
};

export const getDefaultRoleKeyForStaffTypes = (
  types: readonly StaffMemberType[],
): DefaultOrganizationRoleKey => {
  if (types.includes('STAFF')) {
    return 'STAFF';
  }
  if (types.includes('HOST')) {
    return 'HOST';
  }
  if (types.includes('OFFICIAL')) {
    return 'OFFICIAL';
  }
  return 'STAFF';
};

export const getDefaultRoleDefinitionByKey = (
  key: DefaultOrganizationRoleKey,
): DefaultOrganizationRoleDefinition => (
  DEFAULT_ORGANIZATION_ROLES.find((role) => role.key === key) ?? DEFAULT_ORGANIZATION_ROLES[0]
);
