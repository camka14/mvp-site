import type { Invite, InviteStatus, InviteType, StaffMember, StaffMemberType } from '@/types';

export const STAFF_MEMBER_TYPES = ['HOST', 'REFEREE', 'STAFF'] as const;
export const STAFF_ACCESS_TYPES = ['HOST', 'STAFF'] as const;
export const INVITE_TYPES = ['STAFF', 'TEAM', 'EVENT'] as const;
export const INVITE_STATUSES = ['PENDING', 'DECLINED'] as const;

const LEGACY_TEAM_INVITE_TYPES = new Set([
  'PLAYER',
  'TEAM_MANAGER',
  'TEAM_HEAD_COACH',
  'TEAM_ASSISTANT_COACH',
]);

const LEGACY_STAFF_INVITE_TYPES = new Set(['HOST', 'REFEREE']);

export const normalizeStaffMemberType = (value: unknown): StaffMemberType | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if ((STAFF_MEMBER_TYPES as readonly string[]).includes(normalized)) {
    return normalized as StaffMemberType;
  }
  return null;
};

export const normalizeStaffMemberTypes = (value: unknown): StaffMemberType[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => normalizeStaffMemberType(entry))
        .filter((entry): entry is StaffMemberType => Boolean(entry)),
    ),
  );
};

export const normalizeInviteType = (value: unknown): InviteType | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if ((INVITE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as InviteType;
  }
  if (LEGACY_STAFF_INVITE_TYPES.has(normalized)) {
    return 'STAFF';
  }
  if (LEGACY_TEAM_INVITE_TYPES.has(normalized)) {
    return 'TEAM';
  }
  return null;
};

export const normalizeInviteStatus = (value: unknown): InviteStatus | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if ((INVITE_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as InviteStatus;
  }
  if (normalized === 'SENT' || normalized === 'PENDING') {
    return 'PENDING';
  }
  if (normalized === 'REJECTED' || normalized === 'DECLINED') {
    return 'DECLINED';
  }
  return null;
};

export const getLegacyTeamInviteRole = (value: unknown): 'player' | 'manager' | 'headCoach' | 'assistantCoach' | null => {
  if (typeof value !== 'string') {
    return null;
  }
  switch (value.trim().toUpperCase()) {
    case 'PLAYER':
      return 'player';
    case 'TEAM_MANAGER':
      return 'manager';
    case 'TEAM_HEAD_COACH':
      return 'headCoach';
    case 'TEAM_ASSISTANT_COACH':
      return 'assistantCoach';
    default:
      return null;
  }
};

export const hasStaffMemberType = (
  staffMember: { types?: unknown } | null | undefined,
  allowedTypes: readonly StaffMemberType[],
): boolean => normalizeStaffMemberTypes(staffMember?.types).some((type) => allowedTypes.includes(type));

export const getBlockingStaffInvite = (
  invites: Array<{
    type?: unknown;
    status?: unknown;
    userId?: string | null;
    organizationId?: string | null;
  } | null | undefined>,
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): InviteStatus | null => {
  if (!organizationId || !userId) {
    return null;
  }
  for (const invite of invites) {
    if (!invite) {
      continue;
    }
    if (normalizeInviteType(invite.type) !== 'STAFF') {
      continue;
    }
    if (invite.organizationId !== organizationId || invite.userId !== userId) {
      continue;
    }
    const status = normalizeInviteStatus(invite.status) ?? 'PENDING';
    return status;
  }
  return null;
};

export const isActiveStaffMember = (
  staffMember: Pick<StaffMember, 'organizationId' | 'userId'>,
  invites: Array<{
    type?: unknown;
    status?: unknown;
    userId?: string | null;
    organizationId?: string | null;
  } | null | undefined>,
): boolean => !getBlockingStaffInvite(invites, staffMember.organizationId, staffMember.userId);

export const deriveOrganizationRoleIds = (
  staffMembers: Array<{
    organizationId?: string | null;
    userId?: string | null;
    types?: unknown;
  } | null | undefined>,
  invites: Array<{
    type?: unknown;
    status?: unknown;
    userId?: string | null;
    organizationId?: string | null;
  } | null | undefined>,
  roleType: StaffMemberType,
): string[] => {
  const ids = new Set<string>();
  staffMembers.forEach((staffMember) => {
    if (!staffMember?.userId) {
      return;
    }
    if (!hasStaffMemberType(staffMember, [roleType])) {
      return;
    }
    if (!isActiveStaffMember(staffMember as Pick<StaffMember, 'organizationId' | 'userId'>, invites)) {
      return;
    }
    ids.add(staffMember.userId);
  });
  return Array.from(ids);
};

export const deriveStaffInviteTypes = (
  invite: { staffTypes?: unknown },
  fallbackType?: string | null,
): StaffMemberType[] => {
  const normalized = normalizeStaffMemberTypes(invite.staffTypes);
  if (normalized.length > 0) {
    return normalized;
  }
  const fallback = normalizeStaffMemberType(fallbackType);
  return fallback ? [fallback] : [];
};
