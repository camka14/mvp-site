import type { TeamDetailPageTab } from '@/components/ui/TeamDetailModal';

export const teamDetailTabFromPathSegment = (segment?: string | null): TeamDetailPageTab => (
  String(segment ?? '').trim().toLowerCase() === 'finance' ? 'finance' : 'roster'
);

export const buildTeamManagementPath = (
  teamId: string,
  tab: TeamDetailPageTab = 'roster',
): string => {
  const encodedTeamId = encodeURIComponent(teamId);
  return tab === 'finance' ? `/teams/${encodedTeamId}/finance` : `/teams/${encodedTeamId}`;
};
