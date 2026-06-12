import type { TeamDetailPageTab } from '@/components/ui/TeamDetailModal';

export const teamDetailTabFromPathSegment = (segment?: string | null): TeamDetailPageTab => {
  const normalized = String(segment ?? '').trim().toLowerCase();
  if (normalized === 'finance') return 'finance';
  if (normalized === 'schedule') return 'schedule';
  return 'roster';
};

export const buildTeamManagementPath = (
  teamId: string,
  tab: TeamDetailPageTab = 'roster',
): string => {
  const encodedTeamId = encodeURIComponent(teamId);
  if (tab === 'schedule') {
    return `/teams/${encodedTeamId}/schedule`;
  }
  return tab === 'finance' ? `/teams/${encodedTeamId}/finance` : `/teams/${encodedTeamId}`;
};
