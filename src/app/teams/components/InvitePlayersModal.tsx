'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  type Invite,
  type Team,
  type UserData,
  getUserAvatarUrl,
  getUserFullName,
  getUserHandle,
} from '@/types';
import {
  teamService,
  type TeamInviteEventTeamOption,
  type TeamInviteFreeAgentContext,
  type TeamInviteRoleType,
} from '@/lib/teamService';
import { userService } from '@/lib/userService';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const EMPTY_INVITE_CONTEXT: TeamInviteFreeAgentContext = {
  users: [],
  eventIds: [],
  freeAgentIds: [],
  eventTeams: [],
  freeAgentEventsByUserId: {},
  freeAgentEventTeamIdsByUserId: {},
};

type InviteMode = 'free_agents' | 'user' | 'email';

type PendingRoleInvite = {
  invite: Invite;
  invitedUser?: UserData;
};

interface InvitePlayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team;
  freeAgentContext?: TeamInviteFreeAgentContext;
  selectedFreeAgentId?: string;
  selectedFreeAgentUser?: UserData;
  pendingRoleInvites?: PendingRoleInvite[];
  onPlayerInviteSent?: (user: UserData) => void | Promise<void>;
  onRoleInvitesChanged?: () => void | Promise<void>;
  onTeamUpdated?: (team: Team) => void;
  onInvitesSent?: () => void | Promise<void>;
}

const getPendingInviteRole = (
  team: Team,
  invite: Invite,
): TeamInviteRoleType => {
  if (invite.userId && Array.isArray(team.pending) && team.pending.includes(invite.userId)) {
    return 'player';
  }
  if (invite.userId && team.managerId === invite.userId) {
    return 'team_manager';
  }
  if (invite.userId && team.headCoachId === invite.userId) {
    return 'team_head_coach';
  }
  return 'team_assistant_coach';
};

const getRoleLabel = (role: TeamInviteRoleType): string => {
  switch (role) {
    case 'team_manager':
      return 'Manager';
    case 'team_head_coach':
      return 'Head Coach';
    case 'team_assistant_coach':
      return 'Assistant Coach';
    default:
      return 'Player';
  }
};

const inviteKey = (role: TeamInviteRoleType, userId: string): string => `${role}:${userId}`;

export default function InvitePlayersModal({
  isOpen,
  onClose,
  team,
  freeAgentContext = EMPTY_INVITE_CONTEXT,
  selectedFreeAgentId,
  selectedFreeAgentUser,
  pendingRoleInvites = [],
  onPlayerInviteSent,
  onRoleInvitesChanged,
  onTeamUpdated,
  onInvitesSent,
}: InvitePlayersModalProps) {
  const [inviteMode, setInviteMode] = useState<InviteMode>('free_agents');
  const [selectedInviteRole, setSelectedInviteRole] = useState<TeamInviteRoleType>('player');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
  const [searching, setSearching] = useState(false);
  const [emailInviteInput, setEmailInviteInput] = useState('');
  const [selectedInviteEventTeamIds, setSelectedInviteEventTeamIds] = useState<string[]>([]);
  const [invitingUserKeys, setInvitingUserKeys] = useState<Set<string>>(new Set());
  const [invitingByEmail, setInvitingByEmail] = useState(false);
  const [localInvitedPlayerIds, setLocalInvitedPlayerIds] = useState<Set<string>>(new Set());
  const [localEmailPlayerInviteCount, setLocalEmailPlayerInviteCount] = useState(0);
  const [localInvitedRoleKeys, setLocalInvitedRoleKeys] = useState<Set<string>>(new Set());

  const normalizedInviteEmail = emailInviteInput.trim().toLowerCase();
  const inviteEmailValid = EMAIL_REGEX.test(normalizedInviteEmail);
  const selectedRoleLabel = getRoleLabel(selectedInviteRole);
  const normalizedSelectedFreeAgentId = selectedFreeAgentId?.trim() || null;
  const assistantCoachIds = useMemo(() => (
    Array.isArray(team.assistantCoachIds)
      ? team.assistantCoachIds
      : (Array.isArray(team.coachIds) ? team.coachIds : [])
  ), [team.assistantCoachIds, team.coachIds]);

  const playerInviteCapacityUserIds = useMemo(() => {
    const userIds = new Set<string>();
    team.playerIds.forEach((playerId) => {
      if (playerId.trim().length > 0) {
        userIds.add(playerId);
      }
    });
    team.pending.forEach((playerId) => {
      if (playerId.trim().length > 0) {
        userIds.add(playerId);
      }
    });
    if (Array.isArray(team.playerRegistrations)) {
      team.playerRegistrations.forEach((registration) => {
        const userId = registration.userId?.trim();
        const status = String(registration.status ?? '').trim().toUpperCase();
        if (userId && (status === 'STARTED' || status === 'PENDING' || status === 'INVITED')) {
          userIds.add(userId);
        }
      });
    }
    localInvitedPlayerIds.forEach((userId) => userIds.add(userId));
    return userIds;
  }, [localInvitedPlayerIds, team.pending, team.playerIds, team.playerRegistrations]);

  const playerInviteCapacityCount = playerInviteCapacityUserIds.size + localEmailPlayerInviteCount;
  const playerInviteLimit = Math.max(0, Math.trunc(team.teamSize || 0));
  const canInviteAnotherPlayer = playerInviteLimit <= 0 || playerInviteCapacityCount < playerInviteLimit;
  const playerInviteCapacityMessage = playerInviteLimit > 0
    ? `This team already has ${playerInviteCapacityCount} of ${playerInviteLimit} player slots filled. Remove a player or pending invite, or increase team size before inviting another player.`
    : '';

  const inviteEventTeamOptions = useMemo(() => freeAgentContext.eventTeams, [freeAgentContext.eventTeams]);
  const inviteEventNameById = useMemo(() => {
    const entries = new Map<string, string>();
    inviteEventTeamOptions.forEach((option) => {
      entries.set(option.eventId, option.eventName);
    });
    return entries;
  }, [inviteEventTeamOptions]);

  const getFreeAgentEventNames = useCallback((userId: string): string[] => (
    (freeAgentContext.freeAgentEventsByUserId[userId] ?? [])
      .map((eventId) => inviteEventNameById.get(eventId))
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ), [freeAgentContext.freeAgentEventsByUserId, inviteEventNameById]);

  const isRoleInvitePending = useCallback((userId: string, roleType: TeamInviteRoleType): boolean => {
    if (roleType === 'player') {
      return team.pending.includes(userId) || localInvitedPlayerIds.has(userId);
    }
    return localInvitedRoleKeys.has(inviteKey(roleType, userId))
      || pendingRoleInvites.some(
        (entry) => getPendingInviteRole(team, entry.invite) === roleType
          && entry.invite.userId === userId
          && entry.invite.status === 'PENDING',
      );
  }, [localInvitedPlayerIds, localInvitedRoleKeys, pendingRoleInvites, team]);

  const canInviteUserForRole = useCallback((userId: string, roleType: TeamInviteRoleType): boolean => {
    if (roleType === 'player') {
      return canInviteAnotherPlayer
        && !playerInviteCapacityUserIds.has(userId)
        && !team.playerIds.includes(userId)
        && !team.pending.includes(userId);
    }
    if (roleType === 'team_manager') {
      return team.managerId !== userId && !isRoleInvitePending(userId, roleType);
    }
    if (roleType === 'team_head_coach') {
      return team.headCoachId !== userId && !isRoleInvitePending(userId, roleType);
    }
    if (roleType === 'team_assistant_coach') {
      return !assistantCoachIds.includes(userId) && !isRoleInvitePending(userId, roleType);
    }
    return false;
  }, [
    assistantCoachIds,
    canInviteAnotherPlayer,
    isRoleInvitePending,
    playerInviteCapacityUserIds,
    team.headCoachId,
    team.managerId,
    team.pending,
    team.playerIds,
  ]);

  const suggestedFreeAgent = useMemo(() => {
    if (selectedFreeAgentUser && normalizedSelectedFreeAgentId && selectedFreeAgentUser.$id === normalizedSelectedFreeAgentId) {
      return selectedFreeAgentUser;
    }
    if (!normalizedSelectedFreeAgentId) {
      return selectedFreeAgentUser ?? null;
    }
    return freeAgentContext.users.find((agent) => agent.$id === normalizedSelectedFreeAgentId)
      ?? selectedFreeAgentUser
      ?? null;
  }, [freeAgentContext.users, normalizedSelectedFreeAgentId, selectedFreeAgentUser]);

  const filteredFreeAgents = useMemo(() => {
    if (selectedInviteRole !== 'player') {
      return [];
    }
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = freeAgentContext.users.filter((agent) => {
      if (!canInviteUserForRole(agent.$id, 'player')) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const searchable = [
        getUserFullName(agent),
        getUserHandle(agent),
        agent.userName,
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(normalizedQuery);
    });
    const limited = normalizedQuery ? filtered : filtered.slice(0, 10);
    if (!normalizedSelectedFreeAgentId) {
      return limited;
    }
    const prioritized = filtered.find((agent) => agent.$id === normalizedSelectedFreeAgentId);
    if (!prioritized) {
      return limited;
    }
    return [prioritized, ...limited.filter((agent) => agent.$id !== normalizedSelectedFreeAgentId)];
  }, [
    canInviteUserForRole,
    freeAgentContext.users,
    normalizedSelectedFreeAgentId,
    searchQuery,
    selectedInviteRole,
  ]);

  const availableUsers = useMemo(() => {
    let users = searchResults.filter((result) => canInviteUserForRole(result.$id, selectedInviteRole));
    if (selectedInviteRole === 'player' && filteredFreeAgents.length > 0) {
      const freeAgentsNotInResults = filteredFreeAgents.filter(
        (agent) => !users.some((user) => user.$id === agent.$id),
      );
      users = [...freeAgentsNotInResults, ...users];
    }
    return users;
  }, [canInviteUserForRole, filteredFreeAgents, searchResults, selectedInviteRole]);

  const performSearch = useCallback(async () => {
    setSearching(true);
    try {
      const results = await userService.searchUsers(searchQuery);
      setSearchResults(results.filter((result) => canInviteUserForRole(result.$id, selectedInviteRole)));
    } catch (error) {
      console.error('Search failed:', error);
      notifications.show({ color: 'red', message: 'Failed to search users.' });
    } finally {
      setSearching(false);
    }
  }, [canInviteUserForRole, searchQuery, selectedInviteRole]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (normalizedSelectedFreeAgentId) {
      setSelectedInviteRole('player');
      setInviteMode('free_agents');
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, normalizedSelectedFreeAgentId]);

  useEffect(() => {
    if (!isOpen || inviteMode !== 'user') {
      setSearchResults([]);
      return;
    }
    if (searchQuery.length >= 2) {
      void performSearch();
    } else {
      setSearchResults([]);
    }
  }, [inviteMode, isOpen, performSearch, searchQuery]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setEmailInviteInput('');
      setSelectedInviteEventTeamIds([]);
      setInvitingUserKeys(new Set());
      setInvitingByEmail(false);
    }
  }, [isOpen]);

  const addInvitingUserKey = (key: string) => {
    setInvitingUserKeys((current) => new Set(current).add(key));
  };

  const removeInvitingUserKey = (key: string) => {
    setInvitingUserKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const getEventTeamIdsForUser = (userId: string): string[] => {
    if (selectedInviteRole !== 'player') {
      return [];
    }
    return freeAgentContext.freeAgentEventTeamIdsByUserId[userId] ?? [];
  };

  const handleInviteUser = async (targetUser: UserData) => {
    const key = inviteKey(selectedInviteRole, targetUser.$id);
    if (invitingUserKeys.has(key)) {
      return;
    }
    if (selectedInviteRole === 'player' && !canInviteAnotherPlayer) {
      notifications.show({ color: 'yellow', message: playerInviteCapacityMessage });
      return;
    }
    if (!canInviteUserForRole(targetUser.$id, selectedInviteRole)) {
      notifications.show({ color: 'yellow', message: `${selectedRoleLabel} already assigned or invited.` });
      return;
    }

    addInvitingUserKey(key);
    try {
      const invitee = await userService.getUserById(targetUser.$id, { teamId: team.$id }) ?? targetUser;
      if (!canInviteUserForRole(invitee.$id, selectedInviteRole)) {
        notifications.show({ color: 'yellow', message: `${selectedRoleLabel} already assigned or invited.` });
        return;
      }

      const success = await teamService.inviteUserToTeamRole(team, invitee, selectedInviteRole, {
        eventTeamIds: getEventTeamIdsForUser(invitee.$id),
      });
      if (!success) {
        notifications.show({ color: 'red', message: 'Failed to send invite.' });
        return;
      }

      setSearchResults((current) => current.filter((searchUser) => searchUser.$id !== invitee.$id));
      if (selectedInviteRole === 'player') {
        setLocalInvitedPlayerIds((current) => new Set(current).add(invitee.$id));
        await onPlayerInviteSent?.(invitee);
      } else {
        setLocalInvitedRoleKeys((current) => new Set(current).add(key));
        await onRoleInvitesChanged?.();
      }
      notifications.show({ color: 'green', message: `${selectedRoleLabel} invite sent to ${getUserFullName(invitee)}.` });
    } catch (error) {
      console.error('Failed to invite user:', error);
      notifications.show({ color: 'red', message: 'Failed to send invite.' });
    } finally {
      removeInvitingUserKey(key);
    }
  };

  const handleInviteByEmail = async () => {
    if (!inviteEmailValid) {
      notifications.show({ color: 'red', message: 'Enter a valid email address.' });
      return;
    }
    if (invitingByEmail) {
      return;
    }
    if (selectedInviteRole === 'player' && !canInviteAnotherPlayer) {
      notifications.show({ color: 'yellow', message: playerInviteCapacityMessage });
      return;
    }

    setInvitingByEmail(true);
    try {
      const success = await teamService.inviteEmailToTeamRole(team, normalizedInviteEmail, selectedInviteRole, {
        eventTeamIds: selectedInviteRole === 'player' ? selectedInviteEventTeamIds : [],
      });
      if (!success) {
        notifications.show({ color: 'red', message: 'Failed to send invite.' });
        return;
      }

      if (selectedInviteRole === 'player') {
        setLocalEmailPlayerInviteCount((count) => count + 1);
        const updatedTeam = await teamService.getTeamById(team.$id, true, { teamId: team.$id });
        if (updatedTeam) {
          onTeamUpdated?.(updatedTeam);
        }
        await onInvitesSent?.();
      } else {
        await onRoleInvitesChanged?.();
      }

      notifications.show({ color: 'green', message: `${selectedRoleLabel} invite sent to ${normalizedInviteEmail}.` });
      setEmailInviteInput('');
      setSelectedInviteEventTeamIds([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invite.';
      notifications.show({ color: 'red', message });
    } finally {
      setInvitingByEmail(false);
    }
  };

  const renderEventTeamCheckboxes = () => {
    if (selectedInviteRole !== 'player' || inviteEventTeamOptions.length === 0) {
      return null;
    }

    return (
      <div className="mt-3 border-t pt-3">
        <Text fw={500} size="sm" mb={6}>Update your team in upcoming events</Text>
        <Checkbox.Group
          value={selectedInviteEventTeamIds}
          onChange={setSelectedInviteEventTeamIds}
        >
          <div className="space-y-2">
            {inviteEventTeamOptions.map((option: TeamInviteEventTeamOption) => (
              <Checkbox
                key={option.eventTeamId}
                value={option.eventTeamId}
                label={`${option.eventName} - ${option.teamName}`}
              />
            ))}
          </div>
        </Checkbox.Group>
      </div>
    );
  };

  const renderInviteUserRow = (invitee: UserData, sourceLabel?: string) => {
    const key = inviteKey(selectedInviteRole, invitee.$id);
    const eventNames = selectedInviteRole === 'player' ? getFreeAgentEventNames(invitee.$id) : [];
    const eventTeamIds = getEventTeamIdsForUser(invitee.$id);
    const canInvite = canInviteUserForRole(invitee.$id, selectedInviteRole);
    const isInviting = invitingUserKeys.has(key);

    return (
      <Paper key={invitee.$id} withBorder radius="md" p="sm" bg={eventTeamIds.length > 0 ? 'blue.0' : undefined}>
        <Group justify="space-between" align="center" gap="sm" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar
              src={getUserAvatarUrl(invitee, 40)}
              alt={getUserFullName(invitee)}
              size={40}
              radius="xl"
              style={{ flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <Text fw={500} truncate>{getUserFullName(invitee)}</Text>
              {getUserHandle(invitee) && (
                <Text size="xs" c="dimmed" truncate>{getUserHandle(invitee)}</Text>
              )}
              {sourceLabel ? (
                <Text size="xs" c="blue" truncate>{sourceLabel}</Text>
              ) : null}
              {eventNames.length > 0 ? (
                <Text size="xs" c="blue" truncate>{eventNames.join(', ')}</Text>
              ) : null}
            </div>
          </Group>
          <Button
            size="xs"
            loading={isInviting}
            disabled={!canInvite}
            onClick={() => { void handleInviteUser(invitee); }}
          >
            Invite
          </Button>
        </Group>
      </Paper>
    );
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={`Invite to ${team?.name ?? 'Team'}`}
      size="lg"
      centered
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="sm">
        <SegmentedControl
          value={selectedInviteRole}
          onChange={(value) => {
            const nextRole = value as TeamInviteRoleType;
            setSelectedInviteRole(nextRole);
            if (nextRole !== 'player' && inviteMode === 'free_agents') {
              setInviteMode('user');
            }
            setSearchQuery('');
            setSearchResults([]);
            setEmailInviteInput('');
          }}
          data={[
            { label: 'Player', value: 'player' },
            { label: 'Manager', value: 'team_manager' },
            { label: 'Head Coach', value: 'team_head_coach' },
            { label: 'Assistant Coach', value: 'team_assistant_coach' },
          ]}
          fullWidth
        />

        <Tabs
          value={inviteMode}
          onChange={(value) => {
            const nextMode = (value ?? 'user') as InviteMode;
            setInviteMode(nextMode);
            setSearchQuery('');
            setSearchResults([]);
            setEmailInviteInput('');
          }}
          keepMounted={false}
        >
          <Tabs.List grow mb="sm">
            <Tabs.Tab value="free_agents" disabled={selectedInviteRole !== 'player'}>Free Agents</Tabs.Tab>
            <Tabs.Tab value="user">Invite User</Tabs.Tab>
            <Tabs.Tab value="email">Invite by Email</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="free_agents">
            <TextInput
              placeholder="Search free agents"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              mb="sm"
            />
          </Tabs.Panel>

          <Tabs.Panel value="user">
            <TextInput
              placeholder={`Search ${selectedRoleLabel.toLowerCase()} (min 2 characters)`}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              mb="sm"
            />
          </Tabs.Panel>

          <Tabs.Panel value="email">
            <TextInput
              placeholder="name@example.com"
              value={emailInviteInput}
              onChange={(event) => setEmailInviteInput(event.currentTarget.value)}
              error={
                emailInviteInput.trim().length > 0 && !inviteEmailValid
                  ? 'Enter a valid email address'
                  : undefined
              }
              mb="sm"
            />
          </Tabs.Panel>
        </Tabs>

        {selectedInviteRole === 'player' && !canInviteAnotherPlayer ? (
          <Alert color="yellow" variant="light">
            {playerInviteCapacityMessage}
          </Alert>
        ) : null}

        {inviteMode === 'user' && searching ? (
          <Group justify="center" py="sm">
            <Text c="dimmed" size="sm">Searching...</Text>
          </Group>
        ) : null}

        {inviteMode === 'user' && !searching && searchQuery.length >= 2 && availableUsers.length === 0 ? (
          <Text c="dimmed" ta="center" py={8}>
            {`No ${selectedRoleLabel.toLowerCase()} found matching "${searchQuery}"`}
          </Text>
        ) : null}

        {selectedInviteRole === 'player' && inviteMode === 'free_agents' && suggestedFreeAgent && canInviteUserForRole(suggestedFreeAgent.$id, 'player') ? (
          renderInviteUserRow(suggestedFreeAgent, 'Suggested from event free agents')
        ) : null}

        {selectedInviteRole === 'player' && inviteMode === 'free_agents' && !searching && filteredFreeAgents.length > 0 ? (
          <Stack gap="xs">
            <Text fw={500} size="sm" c="blue">Available Free Agents from Events</Text>
            {filteredFreeAgents
              .filter((agent) => agent.$id !== suggestedFreeAgent?.$id)
              .map((agent) => renderInviteUserRow(agent, 'Free Agent from Event'))}
          </Stack>
        ) : null}

        {inviteMode === 'free_agents' && !searching && filteredFreeAgents.length === 0 && !(suggestedFreeAgent && canInviteUserForRole(suggestedFreeAgent.$id, 'player')) ? (
          <Text c="dimmed" ta="center" py={8}>
            {searchQuery.trim().length > 0 ? 'No free agents found matching your search.' : 'No future event free agents found.'}
          </Text>
        ) : null}

        {inviteMode === 'user' && !searching && availableUsers.length > 0 && searchQuery.length >= 2 ? (
          <ScrollArea.Autosize mah={320}>
            <Stack gap="xs">
              {availableUsers.map((invitee) => {
                const isFreeAgent = filteredFreeAgents.some((agent) => agent.$id === invitee.$id);
                return renderInviteUserRow(invitee, isFreeAgent ? 'Free Agent from Event' : undefined);
              })}
            </Stack>
          </ScrollArea.Autosize>
        ) : null}

        {inviteMode === 'email' ? (
          <div className="mt-1">
            {renderEventTeamCheckboxes()}
            <Group justify="flex-end" mt="sm">
              <Button
                onClick={() => { void handleInviteByEmail(); }}
                loading={invitingByEmail}
                disabled={!inviteEmailValid || (selectedInviteRole === 'player' && !canInviteAnotherPlayer)}
              >
                Send {selectedRoleLabel} Invite
              </Button>
            </Group>
          </div>
        ) : null}
      </Stack>
    </Modal>
  );
}
