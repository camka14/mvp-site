import { prisma } from '@/lib/prisma';
import type { AuthContext } from '@/lib/permissions';
import { canManageEvent, canManageOrganization } from '@/server/accessControl';
import { canManageCanonicalTeam, normalizeId } from '@/server/teams/teamMembership';
import type { RegistrationQuestionScopeType } from '@/server/registrationQuestions';

type PrismaLike = any;

export const canManageRegistrationQuestionScope = async (params: {
  session: Pick<AuthContext, 'userId' | 'isAdmin'>;
  scopeType: RegistrationQuestionScopeType;
  scopeId: string;
  client?: PrismaLike;
}): Promise<boolean> => {
  const client = params.client ?? prisma;
  const scopeId = normalizeId(params.scopeId);
  if (!scopeId) {
    return false;
  }
  if (params.session.isAdmin) {
    return true;
  }

  if (params.scopeType === 'TEAM') {
    const directTeamManager = await canManageCanonicalTeam({
      teamId: scopeId,
      userId: params.session.userId,
      isAdmin: params.session.isAdmin,
    }, client);
    if (directTeamManager) {
      return true;
    }
    const team = await client.canonicalTeams?.findUnique?.({
      where: { id: scopeId },
      select: { organizationId: true },
    });
    const organizationId = normalizeId(team?.organizationId);
    if (!organizationId) {
      return false;
    }
    const organization = await client.organizations?.findUnique?.({
      where: { id: organizationId },
      select: { id: true, ownerId: true },
    });
    return canManageOrganization(params.session, organization, client);
  }

  const event = await client.events?.findUnique?.({
    where: { id: scopeId },
    select: {
      hostId: true,
      assistantHostIds: true,
      organizationId: true,
    },
  });
  return canManageEvent(params.session, event, client);
};
