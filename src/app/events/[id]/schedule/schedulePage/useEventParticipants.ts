import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { apiRequest } from '@/lib/apiClient';
import {
  eventService,
  type EventParticipantDivisionWarning,
  type EventParticipantsResponse,
} from '@/lib/eventService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import type { Event, Match, Organization, Team, UserData } from '@/types';

import {
  EMAIL_REGEX,
  MIN_TEAM_SEARCH_QUERY_LENGTH,
  buildParticipantSnapshotKey,
  buildStableIdListKey,
  collectMatchAssignmentUserIds,
  collectTeamRosterUserIds,
  normalizeIdToken,
  parseStableIdListKey,
  teamMatchesSearchQuery,
  type ParticipantInviteMode,
  type ParticipantInviteRow,
  type WeeklyOccurrenceSelection,
} from './helpers';

type ParticipantDivisionColumn = {
  id: string;
  label: string;
  teamIds: string[];
};

type ParticipantDivisionSelectOption = {
  value: string;
  label: string;
};

type UseEventParticipantsParams = {
  activeEvent: Event | null;
  eventId?: string | null;
  activeMatches: Match[];
  isCreateMode: boolean;
  weeklyParticipantSelectionRequired: boolean;
  selectedOccurrence: WeeklyOccurrenceSelection | null;
  participantDivisionColumns: ParticipantDivisionColumn[];
  participantDivisionSelectData: ParticipantDivisionSelectOption[];
  isSplitDivisionEvent: boolean;
  isLeague: boolean;
  isTournament: boolean;
  canManageEvent: boolean;
  user: UserData | null;
  setEvent: Dispatch<SetStateAction<Event | null>>;
  setChangesEvent: Dispatch<SetStateAction<Event | null>>;
  setInfoMessage: (message: string | null) => void;
  setWarningMessage: (message: string | null) => void;
  setActionError: (message: string | null) => void;
};

export default function useEventParticipants({
  activeEvent,
  eventId,
  activeMatches,
  isCreateMode,
  weeklyParticipantSelectionRequired,
  selectedOccurrence,
  participantDivisionColumns,
  participantDivisionSelectData,
  isSplitDivisionEvent,
  isLeague,
  isTournament,
  canManageEvent,
  user,
  setEvent,
  setChangesEvent,
  setInfoMessage,
  setWarningMessage,
  setActionError,
}: UseEventParticipantsParams) {
  const loadedParticipantSnapshotKeyRef = useRef<string | null>(null);
  const loadedParticipantTeamsKeyRef = useRef<string | null>(null);
  const loadedParticipantUsersKeyRef = useRef<string | null>(null);
  const loadedParticipantOfficialsKeyRef = useRef<string | null>(null);

  const [participantTeams, setParticipantTeams] = useState<Team[]>([]);
  const [participantUsers, setParticipantUsers] = useState<UserData[]>([]);
  const [participantOfficials, setParticipantOfficials] = useState<UserData[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [participantDivisionWarnings, setParticipantDivisionWarnings] = useState<EventParticipantDivisionWarning[]>([]);
  const [participantsUpdatingTeamId, setParticipantsUpdatingTeamId] = useState<string | null>(null);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [isAddParticipantModalOpen, setIsAddParticipantModalOpen] = useState(false);
  const [participantInviteMode, setParticipantInviteMode] = useState<ParticipantInviteMode>('existing');
  const [participantSearchValue, setParticipantSearchValue] = useState('');
  const [participantSearchResults, setParticipantSearchResults] = useState<UserData[]>([]);
  const [participantSearchLoading, setParticipantSearchLoading] = useState(false);
  const [participantSearchError, setParticipantSearchError] = useState<string | null>(null);
  const [participantInviteRows, setParticipantInviteRows] = useState<ParticipantInviteRow[]>([
    { firstName: '', lastName: '', email: '' },
  ]);
  const [participantInviteError, setParticipantInviteError] = useState<string | null>(null);
  const [invitingParticipants, setInvitingParticipants] = useState(false);
  const [selectedParticipantTeam, setSelectedParticipantTeam] = useState<Team | null>(null);
  const [selectedAddTeamDivisionId, setSelectedAddTeamDivisionId] = useState<string | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [organizationTeamsForPicker, setOrganizationTeamsForPicker] = useState<Team[]>([]);
  const [organizationTeamsLoading, setOrganizationTeamsLoading] = useState(false);
  const [searchTeamPool, setSearchTeamPool] = useState<Team[]>([]);
  const [searchTeamsLoading, setSearchTeamsLoading] = useState(false);

  const participantTeamIds = useMemo(() => {
    const ids = new Set<string>();

    if (Array.isArray(activeEvent?.teamIds)) {
      activeEvent.teamIds
        .map((teamId) => normalizeIdToken(teamId))
        .filter((teamId): teamId is string => Boolean(teamId))
        .forEach((teamId) => ids.add(teamId));
    }

    if (Array.isArray(activeEvent?.teams)) {
      activeEvent.teams.forEach((teamEntry) => {
        const teamId = normalizeIdToken(teamEntry?.$id);
        if (teamId) {
          ids.add(teamId);
        }
      });
    }

    return Array.from(ids);
  }, [activeEvent?.teamIds, activeEvent?.teams]);
  const participantTeamIdsKey = useMemo(() => buildStableIdListKey(participantTeamIds), [participantTeamIds]);

  const participantUserIds = useMemo(() => {
    const ids = new Set<string>();

    if (Array.isArray(activeEvent?.userIds)) {
      activeEvent.userIds
        .map((userId) => normalizeIdToken(userId))
        .filter((userId): userId is string => Boolean(userId))
        .forEach((userId) => ids.add(userId));
    }

    if (Array.isArray(activeEvent?.players)) {
      activeEvent.players.forEach((player) => {
        const userId = normalizeIdToken(player?.$id);
        if (userId) {
          ids.add(userId);
        }
      });
    }

    return Array.from(ids);
  }, [activeEvent?.players, activeEvent?.userIds]);
  const participantUserIdsKey = useMemo(() => buildStableIdListKey(participantUserIds), [participantUserIds]);

  const participantTeamIdSet = useMemo(() => new Set(participantTeamIds), [participantTeamIds]);
  const participantUserIdSet = useMemo(() => new Set(participantUserIds), [participantUserIds]);

  const participantOfficialIds = useMemo(() => {
    const ids = new Set<string>();

    if (Array.isArray(activeEvent?.officialIds)) {
      activeEvent.officialIds
        .map((officialId) => normalizeIdToken(officialId))
        .filter((officialId): officialId is string => Boolean(officialId))
        .forEach((officialId) => ids.add(officialId));
    }

    if (Array.isArray(activeEvent?.eventOfficials)) {
      activeEvent.eventOfficials
        .map((officialEntry) => normalizeIdToken(officialEntry?.userId))
        .filter((officialId): officialId is string => Boolean(officialId))
        .forEach((officialId) => ids.add(officialId));
    }

    if (Array.isArray(activeEvent?.officials)) {
      activeEvent.officials.forEach((officialEntry) => {
        const officialId = normalizeIdToken(officialEntry?.$id);
        if (officialId) {
          ids.add(officialId);
        }
      });
    }

    activeMatches.forEach((match) => {
      collectMatchAssignmentUserIds(match).forEach((officialId) => ids.add(officialId));
    });

    return Array.from(ids);
  }, [activeEvent?.eventOfficials, activeEvent?.officialIds, activeEvent?.officials, activeMatches]);
  const participantOfficialIdsKey = useMemo(
    () => buildStableIdListKey(participantOfficialIds),
    [participantOfficialIds],
  );

  const participantTeamsById = useMemo(() => {
    const teams = new Map<string, Team>();
    participantTeams.forEach((team) => {
      if (team?.$id) {
        teams.set(team.$id, team);
      }
    });
    if (Array.isArray(activeEvent?.teams)) {
      activeEvent.teams.forEach((team) => {
        if (team?.$id && !teams.has(team.$id)) {
          teams.set(team.$id, team);
        }
      });
    }
    return teams;
  }, [activeEvent?.teams, participantTeams]);

  const isPlaceholderParticipantTeam = useCallback(
    (team: Team | null | undefined): boolean => {
      if (!team) return true;
      if (!isLeague && !isTournament) return false;
      if (typeof (team as any).kind === 'string' && (team as any).kind.trim().toUpperCase() === 'PLACEHOLDER') {
        return true;
      }
      return typeof team.parentTeamId !== 'string' || team.parentTeamId.trim().length === 0;
    },
    [isLeague, isTournament],
  );

  const filledParticipantTeams = useMemo(
    () => participantTeams.filter((team) => !isPlaceholderParticipantTeam(team)),
    [isPlaceholderParticipantTeam, participantTeams],
  );

  const assignedParticipantTeamIds = useMemo(() => {
    const assigned = new Set<string>();
    participantDivisionColumns.forEach((column) => {
      column.teamIds.forEach((teamId) => {
        if (participantTeamIdSet.has(teamId)) {
          assigned.add(teamId);
        }
      });
    });
    return assigned;
  }, [participantDivisionColumns, participantTeamIdSet]);

  const unassignedParticipantTeamIds = useMemo(
    () => participantTeamIds.filter((teamId) => !assignedParticipantTeamIds.has(teamId)),
    [assignedParticipantTeamIds, participantTeamIds],
  );

  const unassignedParticipantTeams = useMemo(
    () => unassignedParticipantTeamIds
      .map((teamId) => participantTeamsById.get(teamId))
      .filter((team): team is Team => Boolean(team)),
    [participantTeamsById, unassignedParticipantTeamIds],
  );

  const unassignedFilledParticipantTeams = useMemo(
    () => unassignedParticipantTeams.filter((team) => !isPlaceholderParticipantTeam(team)),
    [isPlaceholderParticipantTeam, unassignedParticipantTeams],
  );

  const hasSplitDivisionUnassignedTeams = isSplitDivisionEvent && unassignedFilledParticipantTeams.length > 0;

  const organizationIdForParticipants = useMemo(() => {
    const organizationId = normalizeIdToken(activeEvent?.organizationId);
    if (organizationId) {
      return organizationId;
    }

    if (typeof activeEvent?.organization === 'string') {
      return normalizeIdToken(activeEvent.organization);
    }

    if (activeEvent?.organization && typeof activeEvent.organization === 'object') {
      const objectId = normalizeIdToken((activeEvent.organization as Partial<Organization>).$id);
      if (objectId) {
        return objectId;
      }
    }

    return null;
  }, [activeEvent?.organization, activeEvent?.organizationId]);

  const normalizedTeamSearchQuery = teamSearchQuery.trim().toLowerCase();
  const hasTeamSearchInput = normalizedTeamSearchQuery.length > 0;
  const teamSearchMeetsMinimum = normalizedTeamSearchQuery.length >= MIN_TEAM_SEARCH_QUERY_LENGTH;
  const currentUserId = normalizeIdToken(user?.$id);

  const availableOrganizationTeams = useMemo(
    () => organizationTeamsForPicker.filter((team) => Boolean(team?.$id) && !participantTeamIdSet.has(team.$id)),
    [organizationTeamsForPicker, participantTeamIdSet],
  );

  const availableOrganizationParticipantTeams = useMemo(
    () => organizationTeamsForPicker.filter((team) => Boolean(team?.$id)),
    [organizationTeamsForPicker],
  );

  const displayedOrganizationTeams = useMemo(() => {
    if (!hasTeamSearchInput) {
      return availableOrganizationTeams;
    }
    if (!teamSearchMeetsMinimum) {
      return [];
    }
    return availableOrganizationTeams
      .filter((team) => teamMatchesSearchQuery(team, normalizedTeamSearchQuery))
      .slice(0, 24);
  }, [
    availableOrganizationTeams,
    hasTeamSearchInput,
    normalizedTeamSearchQuery,
    teamSearchMeetsMinimum,
  ]);

  const searchResultTeams = useMemo(() => {
    if (organizationIdForParticipants || !teamSearchMeetsMinimum) {
      return [];
    }

    const source = searchTeamPool.filter((team) => {
      if (!team?.$id || participantTeamIdSet.has(team.$id)) {
        return false;
      }

      if (normalizeIdToken(team.organizationId)) {
        return false;
      }

      return true;
    });

    const filtered = source.filter((team) => teamMatchesSearchQuery(team, normalizedTeamSearchQuery));

    return filtered.slice(0, 24);
  }, [
    normalizedTeamSearchQuery,
    organizationIdForParticipants,
    participantTeamIdSet,
    searchTeamPool,
    teamSearchMeetsMinimum,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantTeams = async () => {
      if (!activeEvent?.teamSignup) {
        loadedParticipantTeamsKeyRef.current = null;
        setParticipantTeams([]);
        setParticipantsLoading(false);
        return;
      }

      const teamIds = parseStableIdListKey(participantTeamIdsKey);
      if (teamIds.length === 0) {
        loadedParticipantTeamsKeyRef.current = null;
        setParticipantTeams([]);
        setParticipantUsers([]);
        setParticipantsError(null);
        setParticipantsLoading(false);
        return;
      }

      const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
      const hydrationKey = `${targetEventId ?? ''}:${participantTeamIdsKey}`;
      if (loadedParticipantTeamsKeyRef.current === hydrationKey) {
        return;
      }
      loadedParticipantTeamsKeyRef.current = hydrationKey;

      setParticipantsLoading(true);
      setParticipantsError(null);
      try {
        const hydratedTeams = await teamService.getTeamsByIds(
          teamIds,
          true,
          { eventId: targetEventId ?? undefined },
        );
        if (cancelled) {
          return;
        }
        const hydratedById = new Map(hydratedTeams.map((team) => [team.$id, team]));
        const orderedTeams = teamIds
          .map((teamId) => hydratedById.get(teamId))
          .filter((team): team is Team => Boolean(team));
        setParticipantTeams(orderedTeams);
        setParticipantUsers([]);
      } catch (participantError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load participant teams:', participantError);
        if (loadedParticipantTeamsKeyRef.current === hydrationKey) {
          loadedParticipantTeamsKeyRef.current = null;
        }
        setParticipantsError(participantError instanceof Error ? participantError.message : 'Failed to load teams.');
      } finally {
        if (!cancelled) {
          setParticipantsLoading(false);
        }
      }
    };

    void loadParticipantTeams();

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.teamSignup, eventId, participantTeamIdsKey]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantUsers = async () => {
      if (activeEvent?.teamSignup !== false) {
        loadedParticipantUsersKeyRef.current = null;
        setParticipantUsers([]);
        return;
      }

      const userIds = parseStableIdListKey(participantUserIdsKey);
      if (userIds.length === 0) {
        loadedParticipantUsersKeyRef.current = null;
        setParticipantUsers([]);
        setParticipantsError(null);
        setParticipantsLoading(false);
        return;
      }

      const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
      const hydrationKey = `${targetEventId ?? ''}:${participantUserIdsKey}`;
      if (loadedParticipantUsersKeyRef.current === hydrationKey) {
        return;
      }
      loadedParticipantUsersKeyRef.current = hydrationKey;

      setParticipantsLoading(true);
      setParticipantsError(null);
      try {
        const hydratedUsers = await userService.getUsersByIds(
          userIds,
          { eventId: targetEventId ?? undefined },
        );
        if (cancelled) {
          return;
        }
        const hydratedById = new Map(hydratedUsers.map((participant) => [participant.$id, participant]));
        const orderedUsers = userIds
          .map((userId) => hydratedById.get(userId))
          .filter((participant): participant is UserData => Boolean(participant));
        setParticipantUsers(orderedUsers);
        setParticipantTeams([]);
      } catch (participantError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load participant users:', participantError);
        if (loadedParticipantUsersKeyRef.current === hydrationKey) {
          loadedParticipantUsersKeyRef.current = null;
        }
        setParticipantsError(participantError instanceof Error ? participantError.message : 'Failed to load participants.');
      } finally {
        if (!cancelled) {
          setParticipantsLoading(false);
        }
      }
    };

    void loadParticipantUsers();

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, activeEvent?.teamSignup, eventId, participantUserIdsKey]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantOfficials = async () => {
      const officialIds = parseStableIdListKey(participantOfficialIdsKey);
      if (officialIds.length === 0) {
        loadedParticipantOfficialsKeyRef.current = null;
        setParticipantOfficials([]);
        return;
      }

      const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
      const hydrationKey = `${targetEventId ?? ''}:${participantOfficialIdsKey}`;
      if (loadedParticipantOfficialsKeyRef.current === hydrationKey) {
        return;
      }
      loadedParticipantOfficialsKeyRef.current = hydrationKey;

      try {
        const hydratedOfficials = await userService.getUsersByIds(
          officialIds,
          { eventId: targetEventId ?? undefined },
        );
        if (cancelled) {
          return;
        }
        const hydratedById = new Map(hydratedOfficials.map((official) => [official.$id, official]));
        const orderedOfficials = officialIds
          .map((officialId) => hydratedById.get(officialId))
          .filter((official): official is UserData => Boolean(official));
        setParticipantOfficials(orderedOfficials);
      } catch (officialsError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load officials for event:', officialsError);
        if (loadedParticipantOfficialsKeyRef.current === hydrationKey) {
          loadedParticipantOfficialsKeyRef.current = null;
        }
      }
    };

    void loadParticipantOfficials();

    return () => {
      cancelled = true;
    };
  }, [activeEvent?.$id, eventId, participantOfficialIdsKey]);

  useEffect(() => {
    if (!isAddTeamModalOpen) {
      return;
    }
    if (!isSplitDivisionEvent) {
      if (selectedAddTeamDivisionId !== null) {
        setSelectedAddTeamDivisionId(null);
      }
      return;
    }
    if (
      selectedAddTeamDivisionId
      && participantDivisionSelectData.some((option) => option.value === selectedAddTeamDivisionId)
    ) {
      return;
    }
    setSelectedAddTeamDivisionId(participantDivisionSelectData[0]?.value ?? null);
  }, [isAddTeamModalOpen, isSplitDivisionEvent, participantDivisionSelectData, selectedAddTeamDivisionId]);

  useEffect(() => {
    const shouldLoadOrganizationTeams =
      isAddTeamModalOpen
      || (isAddParticipantModalOpen && participantInviteMode === 'team');
    const shouldLoadSearchPool =
      isAddTeamModalOpen
      && !organizationIdForParticipants
      && teamSearchMeetsMinimum
      && Boolean(currentUserId);

    if (!shouldLoadSearchPool) {
      setSearchTeamPool([]);
      setSearchTeamsLoading(false);
    }

    if (!shouldLoadOrganizationTeams && !shouldLoadSearchPool) {
      return;
    }

    let cancelled = false;

    const loadOrganizationTeams = async () => {
      if (!organizationIdForParticipants) {
        setOrganizationTeamsForPicker([]);
        setOrganizationTeamsLoading(false);
        return;
      }

      setOrganizationTeamsLoading(true);
      try {
        const eventVisibilityContext = normalizeIdToken(activeEvent?.$id ?? eventId) ?? undefined;
        const eventOrganization = activeEvent?.organization;
        if (eventOrganization && typeof eventOrganization === 'object') {
          const org = eventOrganization as Organization;
          if (org.$id === organizationIdForParticipants && Array.isArray(org.teams) && org.teams.length > 0) {
            if (!cancelled) {
              setOrganizationTeamsForPicker(org.teams);
            }
            return;
          }
        }

        const organizationTeams = await teamService.getTeamsByOrganizationId(
          organizationIdForParticipants,
          true,
          { eventId: eventVisibilityContext },
          200,
        );
        if (cancelled) {
          return;
        }
        setOrganizationTeamsForPicker(organizationTeams);
      } catch (organizationError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load organization teams:', organizationError);
        setParticipantsError(organizationError instanceof Error ? organizationError.message : 'Failed to load organization teams.');
      } finally {
        if (!cancelled) {
          setOrganizationTeamsLoading(false);
        }
      }
    };

    const loadSearchPool = async () => {
      if (!currentUserId) {
        setSearchTeamPool([]);
        setSearchTeamsLoading(false);
        return;
      }

      setSearchTeamsLoading(true);
      try {
        const allTeamIds = Array.from(
          new Set(
            (await teamService.getTeamsByUserId(currentUserId))
              .map((team) => normalizeIdToken(team.$id))
              .filter((teamId): teamId is string => Boolean(teamId)),
          ),
        );
        const hydrated = allTeamIds.length > 0
          ? await teamService.getTeamsByIds(
            allTeamIds,
            true,
            { eventId: normalizeIdToken(activeEvent?.$id ?? eventId) ?? undefined },
          )
          : [];
        if (!cancelled) {
          setSearchTeamPool(hydrated.filter((team) => !normalizeIdToken(team.organizationId)));
        }
      } catch (searchError) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load team search results:', searchError);
        setParticipantsError(searchError instanceof Error ? searchError.message : 'Failed to load teams for search.');
      } finally {
        if (!cancelled) {
          setSearchTeamsLoading(false);
        }
      }
    };

    const pendingLoads: Array<Promise<void>> = [];
    if (shouldLoadOrganizationTeams) {
      pendingLoads.push(loadOrganizationTeams());
    }
    if (shouldLoadSearchPool) {
      pendingLoads.push(loadSearchPool());
    }

    void Promise.all(pendingLoads);

    return () => {
      cancelled = true;
    };
  }, [
    activeEvent?.$id,
    activeEvent?.organization,
    currentUserId,
    eventId,
    isAddParticipantModalOpen,
    isAddTeamModalOpen,
    organizationIdForParticipants,
    participantInviteMode,
    teamSearchMeetsMinimum,
  ]);

  const applyParticipantSnapshot = useCallback((
    targetEventId: string,
    snapshot: EventParticipantsResponse,
    occurrence?: { slotId?: string | null; occurrenceDate?: string | null } | null,
    refreshedEvent?: Event | null,
  ) => {
    const snapshotKey = buildParticipantSnapshotKey(targetEventId, occurrence);
    const refreshedTeamIds = Array.from(new Set(
      (snapshot.participants.teamIds ?? [])
        .map((teamId) => normalizeIdToken(teamId))
        .filter((teamId): teamId is string => Boolean(teamId)),
    ));
    const refreshedUserIds = Array.from(new Set(
      (snapshot.participants.userIds ?? [])
        .map((userId) => normalizeIdToken(userId))
        .filter((userId): userId is string => Boolean(userId)),
    ));
    const waitListIds = Array.from(new Set(
      (snapshot.participants.waitListIds ?? [])
        .map((userId) => normalizeIdToken(userId))
        .filter((userId): userId is string => Boolean(userId)),
    ));
    const freeAgentIds = Array.from(new Set(
      (snapshot.participants.freeAgentIds ?? [])
        .map((userId) => normalizeIdToken(userId))
        .filter((userId): userId is string => Boolean(userId)),
    ));

    const teamsById = new Map((snapshot.teams ?? []).map((team) => [team.$id, team]));
    const orderedTeams = refreshedTeamIds
      .map((teamId) => teamsById.get(teamId))
      .filter((team): team is Team => Boolean(team));
    const usersById = new Map((snapshot.users ?? []).map((participant) => [participant.$id, participant]));
    const orderedUsers = refreshedUserIds
      .map((userId) => usersById.get(userId))
      .filter((participant): participant is UserData => Boolean(participant));

    setParticipantTeams(orderedTeams);
    setParticipantUsers(orderedUsers);
    setParticipantDivisionWarnings(snapshot.divisionWarnings ?? []);
    setParticipantsError(null);
    setParticipantsLoading(false);

    if (snapshotKey) {
      loadedParticipantSnapshotKeyRef.current = snapshotKey;
    }

    const participantTeamKey = refreshedTeamIds.join('|');
    const participantUserKey = refreshedUserIds.join('|');
    const targetKeyPrefix = `${targetEventId}:`;
    loadedParticipantTeamsKeyRef.current =
      refreshedTeamIds.length === orderedTeams.length
        ? `${targetKeyPrefix}${participantTeamKey}`
        : null;
    loadedParticipantUsersKeyRef.current =
      refreshedUserIds.length === orderedUsers.length
        ? `${targetKeyPrefix}${participantUserKey}`
        : null;

    setEvent((prev) => (prev
      ? {
          ...prev,
          teamIds: refreshedTeamIds,
          teams: orderedTeams,
          userIds: refreshedUserIds,
          players: orderedUsers,
          waitListIds,
          freeAgentIds,
          participantCount: snapshot.participantCount,
          participantCapacity: snapshot.participantCapacity,
          ...(Array.isArray(refreshedEvent?.divisions) ? { divisions: refreshedEvent.divisions } : {}),
          ...(Array.isArray(refreshedEvent?.divisionDetails) ? { divisionDetails: refreshedEvent.divisionDetails } : {}),
          ...(Array.isArray(refreshedEvent?.playoffDivisionDetails) ? { playoffDivisionDetails: refreshedEvent.playoffDivisionDetails } : {}),
        }
      : prev));
    setChangesEvent((prev) => (prev
      ? {
          ...prev,
          teamIds: refreshedTeamIds,
          teams: orderedTeams,
          userIds: refreshedUserIds,
          players: orderedUsers,
          waitListIds,
          freeAgentIds,
          participantCount: snapshot.participantCount,
          participantCapacity: snapshot.participantCapacity,
          ...(Array.isArray(refreshedEvent?.divisions) ? { divisions: refreshedEvent.divisions } : {}),
          ...(Array.isArray(refreshedEvent?.divisionDetails) ? { divisionDetails: refreshedEvent.divisionDetails } : {}),
          ...(Array.isArray(refreshedEvent?.playoffDivisionDetails) ? { playoffDivisionDetails: refreshedEvent.playoffDivisionDetails } : {}),
        }
      : prev));
  }, [setChangesEvent, setEvent]);

  const refreshParticipantTeamsFromServer = useCallback(
    async (
      targetEventId: string,
      occurrence?: { slotId?: string | null; occurrenceDate?: string | null },
      hydratedEvent?: Event | null,
    ) => {
      const snapshot = await eventService.getEventParticipants(targetEventId, occurrence);
      const refreshedEvent = hydratedEvent ?? snapshot.event ?? await eventService.getEventById(targetEventId);
      if (!refreshedEvent) {
        throw new Error('Failed to refresh event participants.');
      }

      const refreshedTeamIds = Array.from(new Set(
        (snapshot.participants.teamIds ?? [])
          .map((teamId) => normalizeIdToken(teamId))
          .filter((teamId): teamId is string => Boolean(teamId)),
      ));

      const teamsById = new Map((snapshot.teams ?? []).map((team) => [team.$id, team]));
      const snapshotOrderedTeams = refreshedTeamIds
        .map((teamId) => teamsById.get(teamId))
        .filter((team): team is Team => Boolean(team));
      let orderedTeams = snapshotOrderedTeams;
      const needsRosterHydration = snapshotOrderedTeams.some((team) => (
        Array.isArray(team.playerIds)
        && team.playerIds.length > 0
        && (!Array.isArray(team.players) || team.players.length === 0)
      ));
      if (needsRosterHydration) {
        try {
          const hydratedTeams = await teamService.getTeamsByIds(
            refreshedTeamIds,
            true,
            { eventId: targetEventId ?? undefined },
          );
          const hydratedTeamsById = new Map(hydratedTeams.map((team) => [team.$id, team]));
          orderedTeams = refreshedTeamIds
            .map((teamId) => hydratedTeamsById.get(teamId) ?? teamsById.get(teamId))
            .filter((team): team is Team => Boolean(team));
        } catch (hydrationError) {
          console.error('Failed to hydrate participant rosters:', hydrationError);
        }
      }
      if (orderedTeams !== snapshotOrderedTeams) {
        snapshot.teams = orderedTeams;
      }
      applyParticipantSnapshot(targetEventId, snapshot, occurrence, refreshedEvent);
    },
    [applyParticipantSnapshot],
  );

  useEffect(() => {
    if (isCreateMode) {
      setParticipantTeams([]);
      setParticipantUsers([]);
      setParticipantDivisionWarnings([]);
      setParticipantsError(null);
      setParticipantsLoading(false);
      loadedParticipantSnapshotKeyRef.current = null;
      setEvent((prev) => (prev
        ? {
            ...prev,
            teamIds: [],
            teams: [],
            userIds: [],
            players: [],
            waitListIds: [],
            freeAgentIds: [],
            participantCount: 0,
          }
        : prev));
      setChangesEvent((prev) => (prev
        ? {
            ...prev,
            teamIds: [],
            teams: [],
            userIds: [],
            players: [],
            waitListIds: [],
            freeAgentIds: [],
            participantCount: 0,
          }
        : prev));
      return;
    }

    if (!activeEvent?.$id) {
      return;
    }

    const targetEventId = normalizeIdToken(activeEvent?.$id ?? eventId);
    if (!targetEventId) {
      return;
    }

    if (weeklyParticipantSelectionRequired) {
      setParticipantTeams([]);
      setParticipantUsers([]);
      setParticipantsError(null);
      setParticipantsLoading(false);
      loadedParticipantSnapshotKeyRef.current = null;
      setEvent((prev) => (prev
        ? {
            ...prev,
            teamIds: [],
            teams: [],
            userIds: [],
            players: [],
            waitListIds: [],
            freeAgentIds: [],
          }
        : prev));
      setChangesEvent((prev) => (prev
        ? {
            ...prev,
            teamIds: [],
            teams: [],
            userIds: [],
            players: [],
            waitListIds: [],
            freeAgentIds: [],
          }
        : prev));
      return;
    }

    const snapshotKey = buildParticipantSnapshotKey(targetEventId, selectedOccurrence);
    if (!snapshotKey || loadedParticipantSnapshotKeyRef.current === snapshotKey) {
      return;
    }
    loadedParticipantSnapshotKeyRef.current = snapshotKey;

    void refreshParticipantTeamsFromServer(targetEventId, selectedOccurrence ?? undefined).catch((refreshError) => {
      if (loadedParticipantSnapshotKeyRef.current === snapshotKey) {
        loadedParticipantSnapshotKeyRef.current = null;
      }
      console.error('Failed to refresh event participants:', refreshError);
      setParticipantsError(refreshError instanceof Error ? refreshError.message : 'Failed to load participants.');
    });
  }, [
    activeEvent?.$id,
    eventId,
    isCreateMode,
    refreshParticipantTeamsFromServer,
    selectedOccurrence,
    setChangesEvent,
    setEvent,
    weeklyParticipantSelectionRequired,
  ]);

  const mutateTeamParticipantMembership = useCallback(
    async (params: {
      team: Team;
      mode: 'add' | 'remove' | 'move';
      divisionId?: string | null;
    }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId || !params.team?.$id) {
        return;
      }

      setParticipantsError(null);
      setActionError(null);
      try {
        if (params.mode === 'remove') {
          const hydratedEvent = await eventService.removeTeamParticipant(targetEventId, params.team.$id, selectedOccurrence ?? undefined);
          await refreshParticipantTeamsFromServer(targetEventId, selectedOccurrence ?? undefined, hydratedEvent);
          setInfoMessage(`${params.team.name || 'Team'} removed from participants. A refund has been queued.`);
          return;
        }

        const hydratedEvent = await eventService.addTeamParticipant(targetEventId, {
          teamId: params.team.$id,
          divisionId: params.divisionId ?? undefined,
          slotId: selectedOccurrence?.slotId,
          occurrenceDate: selectedOccurrence?.occurrenceDate,
        });
        await refreshParticipantTeamsFromServer(targetEventId, selectedOccurrence ?? undefined, hydratedEvent);
        if (params.mode === 'move') {
          setInfoMessage(`${params.team.name || 'Team'} moved to a new division.`);
        } else {
          setInfoMessage(`${params.team.name || 'Team'} added to participants.`);
        }
      } catch (updateError) {
        console.error('Failed to update event participants:', updateError);
        setParticipantsError(updateError instanceof Error ? updateError.message : 'Failed to update participants.');
      }
    },
    [activeEvent?.$id, eventId, refreshParticipantTeamsFromServer, selectedOccurrence, setActionError, setInfoMessage],
  );

  const mutateUserParticipantMembership = useCallback(
    async (params: {
      user: UserData;
      mode: 'add' | 'remove';
    }) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId || !params.user?.$id) {
        return;
      }

      setParticipantsError(null);
      setActionError(null);
      try {
        const response = await apiRequest<{ requiresParentApproval?: boolean; warnings?: string[] }>(`/api/events/${targetEventId}/participants`, {
          method: params.mode === 'add' ? 'POST' : 'DELETE',
          body: {
            userId: params.user.$id,
            ...(selectedOccurrence?.slotId ? { slotId: selectedOccurrence.slotId } : {}),
            ...(selectedOccurrence?.occurrenceDate ? { occurrenceDate: selectedOccurrence.occurrenceDate } : {}),
          },
        });
        await refreshParticipantTeamsFromServer(targetEventId, selectedOccurrence ?? undefined);
        if (Array.isArray(response?.warnings) && response.warnings.length > 0) {
          setWarningMessage(response.warnings[0] ?? null);
        }
        if (params.mode === 'remove') {
          setInfoMessage(`${params.user.fullName || params.user.userName || 'Participant'} removed from participants.`);
        } else if (response?.requiresParentApproval) {
          setInfoMessage(`${params.user.fullName || params.user.userName || 'Participant'} requires parent/guardian approval before registration can continue.`);
        } else {
          setInfoMessage(`${params.user.fullName || params.user.userName || 'Participant'} added to participants.`);
        }
      } catch (updateError) {
        console.error('Failed to update user participants:', updateError);
        setParticipantsError(updateError instanceof Error ? updateError.message : 'Failed to update participants.');
      }
    },
    [
      activeEvent?.$id,
      eventId,
      refreshParticipantTeamsFromServer,
      selectedOccurrence,
      setActionError,
      setInfoMessage,
      setWarningMessage,
    ],
  );

  const closeAddParticipantModal = useCallback(() => {
    setIsAddParticipantModalOpen(false);
    setParticipantInviteMode('existing');
    setParticipantSearchValue('');
    setParticipantSearchResults([]);
    setParticipantSearchError(null);
    setParticipantInviteRows([{ firstName: '', lastName: '', email: '' }]);
    setParticipantInviteError(null);
  }, []);

  const openAddParticipantsModal = useCallback(() => {
    setParticipantsError(null);
    setParticipantInviteError(null);
    setIsAddParticipantModalOpen(true);
  }, []);

  const openAddTeamModal = useCallback(() => {
    setParticipantsError(null);
    setTeamSearchQuery('');
    setSelectedAddTeamDivisionId(null);
    setIsAddTeamModalOpen(true);
  }, []);

  const handleSearchParticipants = useCallback(
    async (query: string) => {
      setParticipantSearchValue(query);
      setParticipantSearchError(null);
      if (query.trim().length < 2) {
        setParticipantSearchResults([]);
        return;
      }
      try {
        setParticipantSearchLoading(true);
        const results = await userService.searchUsers(query.trim());
        const filtered = results.filter((candidate) => !participantUserIdSet.has(candidate.$id));
        setParticipantSearchResults(filtered);
      } catch (searchError) {
        console.error('Failed to search participants:', searchError);
        setParticipantSearchError('Failed to search participants. Try again.');
      } finally {
        setParticipantSearchLoading(false);
      }
    },
    [participantUserIdSet],
  );

  const handleAddExistingParticipant = useCallback(
    async (candidate: UserData) => {
      if (participantsUpdatingTeamId || !candidate?.$id || participantUserIdSet.has(candidate.$id)) {
        return;
      }

      setParticipantsUpdatingTeamId(candidate.$id);
      await mutateUserParticipantMembership({
        user: candidate,
        mode: 'add',
      });
      setParticipantSearchResults((prev) => prev.filter((entry) => entry.$id !== candidate.$id));
      setParticipantsUpdatingTeamId(null);
    },
    [mutateUserParticipantMembership, participantUserIdSet, participantsUpdatingTeamId],
  );

  const handleInviteParticipantsByEmail = useCallback(async () => {
    const targetEventId = activeEvent?.$id ?? eventId;
    if (!targetEventId || !user?.$id) {
      setParticipantInviteError('You must be signed in to invite participants.');
      return;
    }

    const sanitized = participantInviteRows.map((invite) => ({
      firstName: invite.firstName.trim(),
      lastName: invite.lastName.trim(),
      email: invite.email.trim().toLowerCase(),
    }));

    for (const invite of sanitized) {
      if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email)) {
        setParticipantInviteError('Enter first name, last name, and a valid email for every participant invite.');
        return;
      }
    }

    setParticipantInviteError(null);
    setInvitingParticipants(true);
    try {
      const result = await userService.inviteUsersByEmail(
        user.$id,
        sanitized.map((invite) => ({
          ...invite,
          type: 'EVENT',
          eventId: targetEventId,
          organizationId: activeEvent?.organizationId ?? undefined,
        })),
      );
      if ((result.failed ?? []).length > 0) {
        throw new Error('Failed to create one or more participant invites.');
      }
      setInfoMessage('Participant invites sent.');
      setParticipantInviteRows([{ firstName: '', lastName: '', email: '' }]);
    } catch (inviteError) {
      console.error('Failed to invite participants:', inviteError);
      setParticipantInviteError(inviteError instanceof Error ? inviteError.message : 'Failed to invite participants.');
    } finally {
      setInvitingParticipants(false);
    }
  }, [activeEvent?.$id, activeEvent?.organizationId, eventId, participantInviteRows, setInfoMessage, user?.$id]);

  const handleAddTeamRosterParticipants = useCallback(
    async (team: Team) => {
      const targetEventId = activeEvent?.$id ?? eventId;
      if (!targetEventId || participantsUpdatingTeamId || !team?.$id) {
        return;
      }

      const rosterUserIds = collectTeamRosterUserIds(team);
      if (rosterUserIds.length === 0) {
        setParticipantInviteError('This team has no players or staff to add.');
        return;
      }

      const userIdsToAdd = rosterUserIds.filter((userId) => !participantUserIdSet.has(userId));
      if (userIdsToAdd.length === 0) {
        setParticipantInviteError('All roster members on this team are already participants.');
        return;
      }

      setParticipantInviteError(null);
      setParticipantsError(null);
      setActionError(null);
      setParticipantsUpdatingTeamId(team.$id);

      let addedCount = 0;
      let approvalCount = 0;
      let failureCount = 0;
      const warningMessages: string[] = [];

      try {
        for (const userId of userIdsToAdd) {
          try {
            const response = await apiRequest<{ requiresParentApproval?: boolean; warnings?: string[] }>(`/api/events/${targetEventId}/participants`, {
              method: 'POST',
              body: {
                userId,
                ...(selectedOccurrence?.slotId ? { slotId: selectedOccurrence.slotId } : {}),
                ...(selectedOccurrence?.occurrenceDate ? { occurrenceDate: selectedOccurrence.occurrenceDate } : {}),
              },
            });

            if (Array.isArray(response?.warnings) && response.warnings.length > 0) {
              warningMessages.push(...response.warnings);
            }

            if (response?.requiresParentApproval) {
              approvalCount += 1;
            } else {
              addedCount += 1;
            }
          } catch (error) {
            console.error('Failed to add team roster participant:', error);
            failureCount += 1;
          }
        }

        await refreshParticipantTeamsFromServer(targetEventId, selectedOccurrence ?? undefined);

        if (warningMessages.length > 0) {
          const [firstWarning, ...restWarnings] = warningMessages;
          setWarningMessage(restWarnings.length > 0 ? `${firstWarning} (+${restWarnings.length} more)` : firstWarning);
        }

        const summaryParts: string[] = [];
        if (addedCount > 0) {
          summaryParts.push(`Added ${addedCount} roster member${addedCount === 1 ? '' : 's'}`);
        }
        if (approvalCount > 0) {
          summaryParts.push(`${approvalCount} require parent/guardian approval`);
        }
        if (failureCount > 0) {
          summaryParts.push(`${failureCount} could not be added`);
        }

        if (summaryParts.length > 0) {
          setInfoMessage(`${summaryParts.join('. ')} from ${team.name || 'team'}.`);
        }
        if (failureCount > 0) {
          setParticipantInviteError(`${failureCount} roster member${failureCount === 1 ? '' : 's'} could not be added. Check the event requirements and try again.`);
        }
      } finally {
        setParticipantsUpdatingTeamId(null);
      }
    },
    [
      activeEvent?.$id,
      eventId,
      participantUserIdSet,
      participantsUpdatingTeamId,
      refreshParticipantTeamsFromServer,
      selectedOccurrence,
      setActionError,
      setInfoMessage,
      setWarningMessage,
    ],
  );

  const handleAddTeamToParticipants = useCallback(
    async (team: Team) => {
      if (participantsUpdatingTeamId || !team?.$id || participantTeamIdSet.has(team.$id)) {
        return;
      }

      if (isSplitDivisionEvent && !selectedAddTeamDivisionId) {
        setParticipantsError('Select a division before adding a team.');
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await mutateTeamParticipantMembership({
        team,
        mode: 'add',
        divisionId: isSplitDivisionEvent ? selectedAddTeamDivisionId : undefined,
      });
      setParticipantsUpdatingTeamId(null);
    },
    [
      isSplitDivisionEvent,
      mutateTeamParticipantMembership,
      participantTeamIdSet,
      participantsUpdatingTeamId,
      selectedAddTeamDivisionId,
    ],
  );

  const handleMoveTeamDivision = useCallback(
    async (team: Team, nextDivisionId: string | null) => {
      if (!nextDivisionId || !team?.$id || participantsUpdatingTeamId || !canManageEvent) {
        return;
      }
      const currentDivisionId = participantDivisionColumns.find((column) => column.teamIds.includes(team.$id))?.id ?? null;
      if (currentDivisionId === nextDivisionId) {
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await mutateTeamParticipantMembership({
        team,
        mode: 'move',
        divisionId: nextDivisionId,
      });
      setParticipantsUpdatingTeamId(null);
    },
    [canManageEvent, mutateTeamParticipantMembership, participantDivisionColumns, participantsUpdatingTeamId],
  );

  const handleRemoveTeamFromParticipants = useCallback(
    async (team: Team) => {
      if (participantsUpdatingTeamId || !team?.$id || !participantTeamIdSet.has(team.$id)) {
        return;
      }

      const shouldRemove = typeof window === 'undefined'
        ? true
        : window.confirm(`Remove ${team.name || 'this team'} from participants? They will be unregistered and refunded.`);
      if (!shouldRemove) {
        return;
      }

      setParticipantsUpdatingTeamId(team.$id);
      await mutateTeamParticipantMembership({
        team,
        mode: 'remove',
      });
      setParticipantsUpdatingTeamId(null);
    },
    [mutateTeamParticipantMembership, participantTeamIdSet, participantsUpdatingTeamId],
  );

  const handleRemoveUserFromParticipants = useCallback(
    async (participant: UserData) => {
      if (participantsUpdatingTeamId || !participant?.$id || !participantUserIdSet.has(participant.$id)) {
        return;
      }

      const displayName = participant.fullName || participant.userName || 'this participant';
      const shouldRemove = typeof window === 'undefined'
        ? true
        : window.confirm(`Remove ${displayName} from participants? They will be unregistered and refunded.`);
      if (!shouldRemove) {
        return;
      }

      setParticipantsUpdatingTeamId(participant.$id);
      await mutateUserParticipantMembership({
        user: participant,
        mode: 'remove',
      });
      setParticipantsUpdatingTeamId(null);
    },
    [mutateUserParticipantMembership, participantUserIdSet, participantsUpdatingTeamId],
  );

  return {
    participantTeams,
    participantUsers,
    participantOfficials,
    participantsLoading,
    participantsError,
    setParticipantsError,
    participantDivisionWarnings,
    participantsUpdatingTeamId,
    participantTeamIds,
    participantTeamIdsKey,
    participantUserIds,
    participantUserIdsKey,
    participantTeamIdSet,
    participantUserIdSet,
    participantOfficialIds,
    participantOfficialIdsKey,
    participantTeamsById,
    filledParticipantTeams,
    unassignedParticipantTeams,
    unassignedFilledParticipantTeams,
    hasSplitDivisionUnassignedTeams,
    isPlaceholderParticipantTeam,
    organizationIdForParticipants,
    availableOrganizationParticipantTeams,
    displayedOrganizationTeams,
    hasTeamSearchInput,
    teamSearchMeetsMinimum,
    searchTeamsLoading,
    searchResultTeams,
    isAddTeamModalOpen,
    setIsAddTeamModalOpen,
    isAddParticipantModalOpen,
    participantInviteMode,
    setParticipantInviteMode,
    participantSearchValue,
    participantSearchResults,
    participantSearchLoading,
    participantSearchError,
    participantInviteRows,
    setParticipantInviteRows,
    participantInviteError,
    setParticipantInviteError,
    invitingParticipants,
    selectedParticipantTeam,
    setSelectedParticipantTeam,
    selectedAddTeamDivisionId,
    setSelectedAddTeamDivisionId,
    teamSearchQuery,
    setTeamSearchQuery,
    organizationTeamsLoading,
    applyParticipantSnapshot,
    refreshParticipantTeamsFromServer,
    openAddParticipantsModal,
    openAddTeamModal,
    closeAddParticipantModal,
    handleSearchParticipants,
    handleAddExistingParticipant,
    handleInviteParticipantsByEmail,
    handleAddTeamRosterParticipants,
    handleAddTeamToParticipants,
    handleMoveTeamDivision,
    handleRemoveTeamFromParticipants,
    handleRemoveUserFromParticipants,
  };
}
