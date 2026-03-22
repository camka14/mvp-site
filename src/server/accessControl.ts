import { prisma } from '@/lib/prisma';
import { STAFF_ACCESS_TYPES, getBlockingStaffInvite, hasStaffMemberType, normalizeStaffMemberTypes } from '@/lib/staff';
import type { StaffMemberType } from '@/types';

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
};

type SessionLike = {
  userId: string;
  isAdmin: boolean;
};

type OrganizationAccessRecord = {
  id?: string | null | undefined;
  ownerId: string | null | undefined;
  hostIds?: string[] | null | undefined;
  officialIds?: string[] | null | undefined;
};

type EventAccessRecord = {
  hostId: string | null | undefined;
  assistantHostIds?: unknown;
  organizationId?: string | null;
};

type OrganizationLookupClient = {
  organizations: {
    findUnique: (args: any) => Promise<{
      id?: string | null;
      ownerId: string | null;
      hostIds?: string[] | null;
      officialIds?: string[] | null;
    } | null>;
  };
  staffMembers?: {
    findUnique: (args: any) => Promise<{
      organizationId: string;
      userId: string;
      types: string[] | null;
    } | null>;
  } | undefined;
  invites?: {
    findMany: (args: any) => Promise<Array<{
      organizationId: string | null;
      userId: string | null;
      type: string;
      status: string | null;
    }>>;
  } | undefined;
};

export const hasOrganizationStaffAccess = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  allowedTypes: readonly StaffMemberType[],
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }
  if (!organization) {
    return false;
  }
  if (organization.ownerId === session.userId) {
    return true;
  }
  const organizationId = typeof organization.id === 'string' ? organization.id : null;
  if (!organizationId) {
    return false;
  }

  const assignedHostIds = normalizeIdList(organization.hostIds);
  const assignedOfficialIds = normalizeIdList(organization.officialIds);
  if (
    ((allowedTypes.includes('HOST') || allowedTypes.includes('STAFF')) && assignedHostIds.includes(session.userId))
    || (allowedTypes.includes('OFFICIAL') && assignedOfficialIds.includes(session.userId))
  ) {
    return true;
  }

  const [staffMember, invites] = await Promise.all([
    client.staffMembers?.findUnique
      ? client.staffMembers.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: session.userId,
          },
        },
        select: {
          organizationId: true,
          userId: true,
          types: true,
        },
      })
      : Promise.resolve(null),
    client.invites?.findMany
      ? client.invites.findMany({
        where: {
          organizationId,
          userId: session.userId,
          type: 'STAFF',
        },
        select: {
          organizationId: true,
          userId: true,
          type: true,
          status: true,
        },
      })
      : Promise.resolve([]),
  ]);

  if (!staffMember || !hasStaffMemberType({ types: normalizeStaffMemberTypes(staffMember.types) }, allowedTypes)) {
    return false;
  }

  return !getBlockingStaffInvite(invites, organizationId, session.userId);
};

export const canManageOrganization = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => hasOrganizationStaffAccess(session, organization, STAFF_ACCESS_TYPES, client);

export const canOfficialOrganization = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => hasOrganizationStaffAccess(session, organization, ['OFFICIAL'], client);

export const canManageEventDirectly = (
  session: SessionLike,
  event: EventAccessRecord | null | undefined,
): boolean => {
  if (session.isAdmin) {
    return true;
  }
  if (!event) {
    return false;
  }
  if (event.hostId === session.userId) {
    return true;
  }
  return normalizeIdList(event.assistantHostIds).includes(session.userId);
};

export const canManageEvent = async (
  session: SessionLike,
  event: EventAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => {
  if (canManageEventDirectly(session, event)) {
    return true;
  }
  const organizationId = event?.organizationId ?? null;
  if (!organizationId) {
    return false;
  }
  const organization = await client.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, hostIds: true, officialIds: true },
  });
  return canManageOrganization(session, organization, client);
};

