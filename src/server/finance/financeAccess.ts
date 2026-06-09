import { prisma } from '@/lib/prisma';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { hasOrgPermission } from '@/server/accessControl';
import {
  canManageCanonicalTeam,
  loadCanonicalTeamById,
  normalizeId,
} from '@/server/teams/teamMembership';

type PrismaLike = any;

type SessionLike = {
  userId: string;
  isAdmin: boolean;
};

type OrganizationAccessRecord = {
  id?: string | null;
  ownerId: string | null;
};

export const canManageOrganizationFinance = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  client: PrismaLike = prisma,
): Promise<boolean> => (
  await hasOrgPermission(session, organization, ORG_PERMISSIONS.PAYMENTS_MANAGE, client)
  || await hasOrgPermission(session, organization, ORG_PERMISSIONS.BILLING_MANAGE, client)
);

export const canManageStaffCompensation = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  client: PrismaLike = prisma,
): Promise<boolean> => (
  await hasOrgPermission(session, organization, ORG_PERMISSIONS.STAFF_MANAGE, client)
  && await hasOrgPermission(session, organization, ORG_PERMISSIONS.BILLING_MANAGE, client)
);

export const canAccessTeamFinance = async (
  teamId: string,
  session: SessionLike,
  client: PrismaLike = prisma,
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }

  const team = await loadCanonicalTeamById(teamId, client);
  const organizationId = normalizeId((team as Record<string, unknown> | null)?.organizationId);
  if (organizationId) {
    const organization = await client.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    });
    if (await canManageOrganizationFinance(session, organization, client)) {
      return true;
    }
  }

  return canManageCanonicalTeam({
    teamId,
    userId: session.userId,
    isAdmin: session.isAdmin,
  }, client);
};
