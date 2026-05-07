import type { Match, Team, UserData } from '@/types';
import {
  getBracketDivisionId,
  getBracketMatchDivisionId,
  toBracketDivisionKey,
} from '@/lib/bracketViewCore';

type ViewerUser = Pick<UserData, '$id' | 'teamIds'> | null | undefined;

type CollectViewerTeamIdsParams = {
  currentUser?: ViewerUser;
  childUserIds?: string[];
  teams?: Team[];
};

type CollectViewerDivisionHighlightKeysParams = CollectViewerTeamIdsParams & {
  divisions?: unknown[];
  matches?: Match[];
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const addNormalizedId = (target: Set<string>, value: unknown) => {
  const normalized = normalizeId(value);
  if (normalized) {
    target.add(normalized);
  }
};

export const isViewerDivisionHighlighted = (
  highlightedDivisionKeys: ReadonlySet<string>,
  value: string | null | undefined,
): boolean => {
  const key = toBracketDivisionKey(value);
  return Boolean(key && highlightedDivisionKeys.has(key));
};

export const collectViewerTrackedUserIds = (
  currentUser?: ViewerUser,
  childUserIds: string[] = [],
): Set<string> => {
  const trackedUserIds = new Set<string>();
  addNormalizedId(trackedUserIds, currentUser?.$id);
  childUserIds.forEach((childUserId) => addNormalizedId(trackedUserIds, childUserId));
  return trackedUserIds;
};

const extractEntityId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return normalizeId(value);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as { $id?: unknown; id?: unknown };
  return normalizeId(row.$id) ?? normalizeId(row.id);
};

const teamIncludesTrackedUser = (team: Team, trackedUserIds: ReadonlySet<string>): boolean => {
  if (trackedUserIds.size === 0) {
    return false;
  }

  const directUserIds = [
    ...(Array.isArray(team.playerIds) ? team.playerIds : []),
    team.captainId,
    team.managerId,
    team.headCoachId,
    ...(Array.isArray(team.assistantCoachIds) ? team.assistantCoachIds : []),
    ...(Array.isArray(team.coachIds) ? team.coachIds : []),
  ];

  if (directUserIds.some((userId) => {
    const normalized = normalizeId(userId);
    return Boolean(normalized && trackedUserIds.has(normalized));
  })) {
    return true;
  }

  const relationUsers = [
    ...(Array.isArray(team.players) ? team.players : []),
    team.captain,
    team.manager,
    team.headCoach,
    ...(Array.isArray(team.assistantCoaches) ? team.assistantCoaches : []),
    ...(Array.isArray(team.coaches) ? team.coaches : []),
  ];

  if (relationUsers.some((userEntry) => {
    const userId = extractEntityId(userEntry);
    return Boolean(userId && trackedUserIds.has(userId));
  })) {
    return true;
  }

  return Array.isArray(team.playerRegistrations)
    && team.playerRegistrations.some((registration) => {
      const userId = normalizeId(registration.userId) ?? normalizeId(registration.registrantId);
      return Boolean(userId && trackedUserIds.has(userId));
    });
};

export const collectViewerTeamIds = ({
  currentUser,
  childUserIds = [],
  teams = [],
}: CollectViewerTeamIdsParams): Set<string> => {
  const trackedUserIds = collectViewerTrackedUserIds(currentUser, childUserIds);
  const viewerTeamIds = new Set<string>();

  if (Array.isArray(currentUser?.teamIds)) {
    currentUser.teamIds.forEach((teamId) => addNormalizedId(viewerTeamIds, teamId));
  }

  teams.forEach((team) => {
    const teamId = extractEntityId(team);
    if (!teamId) {
      return;
    }
    if (viewerTeamIds.has(teamId) || teamIncludesTrackedUser(team, trackedUserIds)) {
      viewerTeamIds.add(teamId);
    }
  });

  return viewerTeamIds;
};

const getDivisionTeamIds = (division: unknown): string[] => {
  if (!division || typeof division !== 'object') {
    return [];
  }
  const teamIds = (division as { teamIds?: unknown }).teamIds;
  if (!Array.isArray(teamIds)) {
    return [];
  }
  return teamIds
    .map((teamId) => normalizeId(teamId))
    .filter((teamId): teamId is string => Boolean(teamId));
};

const getPlayoffPlacementDivisionIds = (division: unknown): string[] => {
  if (!division || typeof division !== 'object') {
    return [];
  }
  const placementIds = (division as { playoffPlacementDivisionIds?: unknown }).playoffPlacementDivisionIds;
  if (!Array.isArray(placementIds)) {
    return [];
  }
  return placementIds
    .map((divisionId) => normalizeId(divisionId))
    .filter((divisionId): divisionId is string => Boolean(divisionId));
};

const addDivisionKey = (target: Set<string>, divisionId: string | null | undefined) => {
  const divisionKey = toBracketDivisionKey(divisionId);
  if (divisionKey) {
    target.add(divisionKey);
  }
};

const teamMatchesViewer = (
  team: Match['team1'] | null | undefined,
  fallbackTeamId: string | null | undefined,
  viewerTeamIds: ReadonlySet<string>,
  trackedUserIds: ReadonlySet<string>,
): boolean => {
  const teamId = extractEntityId(team) ?? normalizeId(fallbackTeamId);
  if (teamId && viewerTeamIds.has(teamId)) {
    return true;
  }
  return Boolean(team && teamIncludesTrackedUser(team, trackedUserIds));
};

export const matchHasViewerPlayingTeam = (
  match: Match,
  viewerTeamIds: ReadonlySet<string>,
  trackedUserIds: ReadonlySet<string>,
): boolean => (
  teamMatchesViewer(match.team1, match.team1Id, viewerTeamIds, trackedUserIds)
  || teamMatchesViewer(match.team2, match.team2Id, viewerTeamIds, trackedUserIds)
);

export const collectViewerDivisionHighlightKeys = ({
  currentUser,
  childUserIds = [],
  teams = [],
  divisions = [],
  matches = [],
}: CollectViewerDivisionHighlightKeysParams): Set<string> => {
  const trackedUserIds = collectViewerTrackedUserIds(currentUser, childUserIds);
  const viewerTeamIds = collectViewerTeamIds({ currentUser, childUserIds, teams });
  const divisionKeys = new Set<string>();

  teams.forEach((team) => {
    const teamId = extractEntityId(team);
    if (!teamId || !viewerTeamIds.has(teamId)) {
      return;
    }
    addDivisionKey(divisionKeys, getBracketDivisionId(team.division));
  });

  divisions.forEach((division) => {
    const containsViewerTeam = getDivisionTeamIds(division).some((teamId) => viewerTeamIds.has(teamId));
    if (!containsViewerTeam) {
      return;
    }

    addDivisionKey(divisionKeys, getBracketDivisionId(division));
    getPlayoffPlacementDivisionIds(division).forEach((divisionId) => addDivisionKey(divisionKeys, divisionId));
  });

  matches.forEach((match) => {
    if (!matchHasViewerPlayingTeam(match, viewerTeamIds, trackedUserIds)) {
      return;
    }
    addDivisionKey(divisionKeys, getBracketMatchDivisionId(match));
  });

  return divisionKeys;
};
