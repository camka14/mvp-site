import { prisma } from '@/lib/prisma';

type SessionLike = {
  userId: string;
  isAdmin: boolean;
};

type OrganizationAccessRecord = {
  ownerId: string | null | undefined;
  hostIds?: unknown;
};

type EventAccessRecord = {
  hostId: string | null | undefined;
  assistantHostIds?: unknown;
  organizationId?: string | null;
};

type OrganizationLookupClient = {
  organizations: {
    findUnique: (args: any) => Promise<{
      ownerId: string | null;
      hostIds: string[] | null;
    } | null>;
  };
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((entry) => String(entry)).filter((entry) => entry.length > 0)
    : []
);

export const canManageOrganization = (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
): boolean => {
  if (session.isAdmin) {
    return true;
  }
  if (!organization) {
    return false;
  }
  if (organization.ownerId === session.userId) {
    return true;
  }
  return normalizeIdList(organization.hostIds).includes(session.userId);
};

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
    select: { ownerId: true, hostIds: true },
  });
  return canManageOrganization(session, organization);
};
