import type { Team } from '@/types';

const normalizeId = (value: string | null | undefined): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

export const canManageTeamBilling = (
  team: Pick<Team, 'managerId'>,
  userId: string,
): boolean => {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    return false;
  }

  const managerId = normalizeId(team.managerId);
  return managerId === normalizedUserId;
};

export const selectBillOwnerTeams = (teams: Team[], userId: string): Team[] => (
  teams.filter((team) => canManageTeamBilling(team, userId))
);
