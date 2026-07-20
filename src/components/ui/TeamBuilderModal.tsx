'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  Check as IconCheck,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Mail as IconMail,
  Link as IconLink,
  Search as IconSearch,
  UserPlus as IconUserPlus,
  X as IconX,
} from 'lucide-react';
import { eventService } from '@/lib/eventService';
import { formatPhoneInput } from '@/lib/phoneInput';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import {
  SPORTS_LIST,
  type Event,
  type Team,
  type UserData,
  getUserAvatarUrl,
  getUserFullName,
  getUserHandle,
} from '@/types';

type BuilderStepKey = 'team' | 'freeAgents' | 'staff' | 'invite' | 'review';
type StaffInviteRole = 'team_manager' | 'team_head_coach' | 'team_assistant_coach';
type CreatorCoachRole = 'NONE' | 'HEAD_COACH' | 'ASSISTANT_COACH';

const STAFF_ROLE_OPTIONS = [
  { value: 'team_manager', label: 'Manager' },
  { value: 'team_head_coach', label: 'Head coach' },
  { value: 'team_assistant_coach', label: 'Assistant coach' },
] as const;
const CREATOR_COACH_OPTIONS = [
  { value: 'NONE', label: 'No coaching role' },
  { value: 'HEAD_COACH', label: 'Head coach' },
  { value: 'ASSISTANT_COACH', label: 'Assistant coach' },
] as const;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type AccountInvite = {
  id: string;
  kind: 'account';
  user: UserData;
};

export type NewPersonInviteDraft = {
  id: string;
  kind: 'person';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type BuilderInvite = AccountInvite | NewPersonInviteDraft;

type AccountStaffInvite = {
  id: string;
  kind: 'account';
  user: UserData;
  role: StaffInviteRole;
};

type NewStaffInviteDraft = {
  id: string;
  kind: 'person';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: StaffInviteRole;
};

type StaffInvite = AccountStaffInvite | NewStaffInviteDraft;

type CreatedInviteLink = {
  id: string;
  name: string;
  role: string;
  shareUrl: string;
  emailSent: boolean;
};

type TeamBuilderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData | null;
  onTeamCreated?: (team: Team) => void;
  organizationId?: string;
  eventId?: string | null;
  initialFreeAgentId?: string | null;
};

const normalizedUserId = (user: UserData | null): string => {
  if (!user) return '';
  const legacyId = (user as UserData & { id?: unknown }).id;
  if (typeof user.$id === 'string' && user.$id.trim()) return user.$id.trim();
  return typeof legacyId === 'string' ? legacyId.trim() : '';
};

const eventSportName = (event: Event | null): string => {
  if (!event) return '';
  const sportValue: unknown = event.sport;
  if (typeof sportValue === 'string') return sportValue.trim();
  if (sportValue && typeof sportValue === 'object' && 'name' in sportValue) {
    return String((sportValue as { name?: unknown }).name ?? '').trim();
  }
  return '';
};

const personName = (person: NewPersonInviteDraft): string => (
  `${person.firstName.trim()} ${person.lastName.trim()}`.trim()
);

const makePersonDraft = (): NewPersonInviteDraft => ({
  id: `person-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
  kind: 'person',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
});

const makeStaffPersonDraft = (role: StaffInviteRole): NewStaffInviteDraft => ({
  id: `staff-person-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  kind: 'person',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role,
});

export default function TeamBuilderModal({
  isOpen,
  onClose,
  currentUser,
  onTeamCreated,
  organizationId,
  eventId,
  initialFreeAgentId,
}: TeamBuilderModalProps) {
  const [step, setStep] = useState(0);
  const [teamName, setTeamName] = useState('');
  const [sport, setSport] = useState('');
  const [teamSize, setTeamSize] = useState<string | number>(6);
  const [addSelfAsPlayer, setAddSelfAsPlayer] = useState(true);
  const [creatorIsCaptain, setCreatorIsCaptain] = useState(true);
  const [creatorIsManager, setCreatorIsManager] = useState(true);
  const [creatorCoachRole, setCreatorCoachRole] = useState<CreatorCoachRole>('NONE');
  const [event, setEvent] = useState<Event | null>(null);
  const [freeAgents, setFreeAgents] = useState<UserData[]>([]);
  const [selectedFreeAgentIds, setSelectedFreeAgentIds] = useState<string[]>([]);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [eventContextResolved, setEventContextResolved] = useState(!eventId);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
  const [searching, setSearching] = useState(false);
  const [invites, setInvites] = useState<BuilderInvite[]>([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [staffSearchResults, setStaffSearchResults] = useState<UserData[]>([]);
  const [staffSearching, setStaffSearching] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffInviteRole>('team_manager');
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffPersonEditor, setStaffPersonEditor] = useState<NewStaffInviteDraft | null>(null);
  const [personEditor, setPersonEditor] = useState<NewPersonInviteDraft | null>(null);
  const [createdInviteLinks, setCreatedInviteLinks] = useState<CreatedInviteLink[]>([]);
  const [createdTeamName, setCreatedTeamName] = useState('');
  const [creationWarning, setCreationWarning] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const currentUserId = normalizedUserId(currentUser);
  const hasFreeAgentStep = eventContextResolved
    && Boolean(event?.start && new Date(event.start).getTime() > Date.now())
    && freeAgents.length > 0;
  const steps = useMemo<Array<{ key: BuilderStepKey; label: string }>>(() => [
    { key: 'team', label: 'Team' },
    ...(hasFreeAgentStep ? [{ key: 'freeAgents' as const, label: 'Free agents' }] : []),
    { key: 'staff', label: 'Staff' },
    { key: 'invite', label: 'Invite players' },
    { key: 'review', label: 'Review' },
  ], [hasFreeAgentStep]);
  const activeStep = steps[step]?.key ?? 'team';
  const resolvedTeamSize = typeof teamSize === 'number' ? Math.trunc(teamSize) : Number(teamSize);
  const selectedFreeAgents = useMemo(() => {
    const selected = new Set(selectedFreeAgentIds);
    return freeAgents.filter((user) => selected.has(user.$id));
  }, [freeAgents, selectedFreeAgentIds]);
  const rosterCount = (addSelfAsPlayer ? 1 : 0) + selectedFreeAgents.length + invites.length;
  const openSlots = Number.isFinite(resolvedTeamSize) ? Math.max(0, resolvedTeamSize - rosterCount) : 0;
  const isAtCapacity = Number.isFinite(resolvedTeamSize) && resolvedTeamSize > 0 && rosterCount >= resolvedTeamSize;
  const sportOptions = useMemo(() => (
    Array.from(new Set([...SPORTS_LIST, sport].map((value) => value.trim()).filter(Boolean)))
      .map((value) => ({ value, label: value }))
  ), [sport]);
  const excludedUserIds = useMemo(() => new Set([
    currentUserId,
    ...selectedFreeAgentIds,
    ...invites.filter((invite): invite is AccountInvite => invite.kind === 'account').map((invite) => invite.user.$id),
  ].filter(Boolean)), [currentUserId, invites, selectedFreeAgentIds]);
  const excludedStaffUserIds = useMemo(() => new Set([
    currentUserId,
    ...staffInvites
      .filter((invite): invite is AccountStaffInvite => invite.kind === 'account')
      .map((invite) => invite.user.$id),
  ].filter(Boolean)), [currentUserId, staffInvites]);

  const reset = useCallback(() => {
    setStep(0);
    setTeamName('');
    setSport('');
    setTeamSize(6);
    setAddSelfAsPlayer(true);
    setCreatorIsCaptain(true);
    setCreatorIsManager(true);
    setCreatorCoachRole('NONE');
    setEvent(null);
    setFreeAgents([]);
    setSelectedFreeAgentIds([]);
    setEventContextResolved(!eventId);
    setSearchQuery('');
    setSearchResults([]);
    setInvites([]);
    setStaffSearchQuery('');
    setStaffSearchResults([]);
    setStaffRole('team_manager');
    setStaffInvites([]);
    setEditingStaffId(null);
    setStaffPersonEditor(null);
    setPersonEditor(null);
    setCreatedInviteLinks([]);
    setCreatedTeamName('');
    setCreationWarning(null);
    setCopiedInviteId(null);
    setError(null);
    setCreating(false);
  }, [eventId]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (!eventId) {
      setEventContextResolved(true);
      return;
    }
    let cancelled = false;
    const loadEventContext = async () => {
      setLoadingEvent(true);
      setEventContextResolved(false);
      try {
        const snapshot = await eventService.getEventParticipants(eventId);
        if (cancelled) return;
        const nextEvent = snapshot.event ?? await eventService.getEventById(eventId) ?? null;
        const freeAgentIdSet = new Set(snapshot.participants.freeAgentIds ?? []);
        const nextFreeAgents = (snapshot.users ?? []).filter((user) => freeAgentIdSet.has(user.$id));
        setEvent(nextEvent);
        setFreeAgents(nextFreeAgents);
        const eventTeamSize = Number(nextEvent?.teamSizeLimit);
        if (Number.isFinite(eventTeamSize) && eventTeamSize >= 2) setTeamSize(Math.trunc(eventTeamSize));
        const eventSport = eventSportName(nextEvent);
        if (eventSport) setSport(eventSport);
        const isUpcoming = Boolean(nextEvent?.start && new Date(nextEvent.start).getTime() > Date.now());
        if (isUpcoming && initialFreeAgentId && nextFreeAgents.some((user) => user.$id === initialFreeAgentId)) {
          setSelectedFreeAgentIds([initialFreeAgentId]);
        }
      } catch (loadError) {
        console.error('Failed to load team-builder event context:', loadError);
        if (!cancelled) setError('Event details could not be loaded. You can still create a team.');
      } finally {
        if (!cancelled) {
          setLoadingEvent(false);
          setEventContextResolved(true);
        }
      }
    };
    void loadEventContext();
    return () => { cancelled = true; };
  }, [eventId, initialFreeAgentId, isOpen]);

  useEffect(() => {
    if (!isOpen || activeStep !== 'invite' || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const search = async () => {
      setSearching(true);
      try {
        const users = await userService.searchUsers(searchQuery.trim());
        if (!cancelled) setSearchResults(users.filter((user) => !excludedUserIds.has(user.$id)));
      } catch (searchError) {
        console.error('Failed to search invite players:', searchError);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    void search();
    return () => { cancelled = true; };
  }, [activeStep, excludedUserIds, isOpen, searchQuery]);

  useEffect(() => {
    if (!isOpen || activeStep !== 'staff' || staffSearchQuery.trim().length < 2) {
      setStaffSearchResults([]);
      return;
    }
    let cancelled = false;
    const search = async () => {
      setStaffSearching(true);
      try {
        const users = await userService.searchUsers(staffSearchQuery.trim());
        if (!cancelled) setStaffSearchResults(users.filter((user) => !excludedStaffUserIds.has(user.$id)));
      } catch (searchError) {
        console.error('Failed to search team staff:', searchError);
        if (!cancelled) setStaffSearchResults([]);
      } finally {
        if (!cancelled) setStaffSearching(false);
      }
    };
    void search();
    return () => { cancelled = true; };
  }, [activeStep, excludedStaffUserIds, isOpen, staffSearchQuery]);

  const closeBuilder = () => {
    if (creating) return;
    reset();
    onClose();
  };

  const validateBasics = (): boolean => {
    if (!teamName.trim()) {
      setError('Enter a team name.');
      return false;
    }
    if (!sport.trim()) {
      setError('Select a sport.');
      return false;
    }
    if (!Number.isFinite(resolvedTeamSize) || resolvedTeamSize < 2) {
      setError('Team size must be 2 or above.');
      return false;
    }
    if (!currentUserId) {
      setError('Sign in again before creating a team.');
      return false;
    }
    setError(null);
    return true;
  };

  const nextStep = () => {
    if (activeStep === 'team' && !validateBasics()) return;
    if (activeStep === 'staff' && !creatorIsManager && !staffInvites.some((invite) => invite.role === 'team_manager')) {
      setError('Choose a manager before continuing. You will remain the temporary manager until they accept.');
      return;
    }
    setError(null);
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const addStaffInvite = (user: UserData) => {
    if (staffRole === 'team_manager') setCreatorIsManager(false);
    setStaffInvites((current) => {
      const withoutUser = current.filter((invite) => invite.kind !== 'account' || invite.user.$id !== user.$id);
      const withoutExclusiveRole = staffRole === 'team_manager' || staffRole === 'team_head_coach'
        ? withoutUser.filter((invite) => invite.role !== staffRole)
        : withoutUser;
      return [...withoutExclusiveRole, { id: `staff-${user.$id}`, kind: 'account', user, role: staffRole }];
    });
    setStaffSearchQuery('');
    setStaffSearchResults([]);
    setError(null);
  };

  const updateStaffRole = (id: string, role: StaffInviteRole) => {
    if (role === 'team_manager') setCreatorIsManager(false);
    setStaffInvites((current) => current
      .filter((invite) => invite.id === id || !(
        (role === 'team_manager' || role === 'team_head_coach')
        && invite.role === role
      ))
      .map((invite) => invite.id === id ? { ...invite, role } : invite));
  };

  const saveStaffPerson = () => {
    if (!staffPersonEditor) return;
    if (!staffPersonEditor.firstName.trim() || !staffPersonEditor.lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (staffPersonEditor.email.trim() && !EMAIL_REGEX.test(staffPersonEditor.email.trim())) {
      setError('Enter a valid email address or leave email blank.');
      return;
    }
    if (staffPersonEditor.role === 'team_manager') setCreatorIsManager(false);
    setStaffInvites((current) => {
      const withoutExclusiveRole = staffPersonEditor.role === 'team_manager' || staffPersonEditor.role === 'team_head_coach'
        ? current.filter((invite) => invite.id === staffPersonEditor.id || invite.role !== staffPersonEditor.role)
        : current;
      return withoutExclusiveRole.some((invite) => invite.id === staffPersonEditor.id)
        ? withoutExclusiveRole.map((invite) => invite.id === staffPersonEditor.id ? staffPersonEditor : invite)
        : [...withoutExclusiveRole, staffPersonEditor];
    });
    setStaffPersonEditor(null);
    setError(null);
  };

  const toggleFreeAgent = (userId: string) => {
    setError(null);
    setSelectedFreeAgentIds((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId);
      if (isAtCapacity) {
        setError(`Your ${resolvedTeamSize}-player roster is full.`);
        return current;
      }
      return [...current, userId];
    });
  };

  const addAccountInvite = (user: UserData) => {
    if (isAtCapacity) {
      setError(`Your ${resolvedTeamSize}-player roster is full.`);
      return;
    }
    setInvites((current) => [...current, { id: `account-${user.$id}`, kind: 'account', user }]);
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
  };

  const savePerson = () => {
    if (!personEditor) return;
    if (!personEditor.firstName.trim() || !personEditor.lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (personEditor.email.trim() && !EMAIL_REGEX.test(personEditor.email.trim())) {
      setError('Enter a valid email address or leave email blank.');
      return;
    }
    const existing = invites.some((invite) => invite.id === personEditor.id);
    if (!existing && isAtCapacity) {
      setError(`Your ${resolvedTeamSize}-player roster is full.`);
      return;
    }
    setInvites((current) => existing
      ? current.map((invite) => invite.id === personEditor.id ? personEditor : invite)
      : [...current, personEditor]);
    setPersonEditor(null);
    setError(null);
  };

  const createTeam = async () => {
    if (!validateBasics()) return;
    setCreating(true);
    setError(null);
    try {
      const team = await teamService.createTeam(
        teamName.trim(),
        currentUserId,
        'Open',
        sport.trim(),
        resolvedTeamSize,
        undefined,
        {
          addSelfAsPlayer,
          creatorIsCaptain,
          creatorCoachRole,
          organizationId,
          joinPolicy: 'CLOSED',
          openRegistration: false,
        },
      );

      const accountUsers = [
        ...selectedFreeAgents,
        ...invites.filter((invite): invite is AccountInvite => invite.kind === 'account').map((invite) => invite.user),
      ];
      const personInvites = invites.filter((invite): invite is NewPersonInviteDraft => invite.kind === 'person');
      const inviteJobs: Array<{
        name: string;
        role: string;
        emailSent: boolean;
        run: () => Promise<boolean | { shareUrl?: string | null; invite?: { $id?: string; id?: string } }>;
      }> = [
        ...accountUsers.map((user) => ({
          name: getUserFullName(user),
          role: 'Player',
          emailSent: false,
          run: () => teamService.inviteUserToTeamRole(team, user, 'player'),
        })),
        ...staffInvites.map((invite) => ({
          name: invite.kind === 'account' ? getUserFullName(invite.user) : `${invite.firstName} ${invite.lastName}`.trim(),
          role: STAFF_ROLE_OPTIONS.find((option) => option.value === invite.role)?.label ?? 'Staff',
          emailSent: invite.kind === 'person' && EMAIL_REGEX.test(invite.email.trim()),
          run: () => invite.kind === 'account'
            ? teamService.inviteUserToTeamRole(team, invite.user, invite.role)
            : teamService.createTeamMemberInvite(team.$id, {
              role: invite.role,
              firstName: invite.firstName,
              lastName: invite.lastName,
              email: invite.email || undefined,
              phone: invite.phone || undefined,
              shareOnly: !invite.email,
            }),
        })),
        ...personInvites.map((person) => ({
          name: personName(person),
          role: 'Player',
          emailSent: EMAIL_REGEX.test(person.email.trim()),
          run: () => teamService.createTeamMemberInvite(team.$id, {
            role: 'player',
            firstName: person.firstName,
            lastName: person.lastName,
            email: person.email || undefined,
            phone: person.phone || undefined,
            shareOnly: !person.email,
          }),
        })),
      ];
      const results: PromiseSettledResult<boolean | { shareUrl?: string | null; invite?: { $id?: string; id?: string } }>[] = [];
      for (const job of inviteJobs) {
        try {
          results.push({ status: 'fulfilled', value: await job.run() });
        } catch (reason) {
          results.push({ status: 'rejected', reason });
        }
      }
      const failedCount = results.filter((result) => result.status === 'rejected' || result.value === false).length;
      const links = results.flatMap((result, index): CreatedInviteLink[] => {
        if (result.status !== 'fulfilled' || typeof result.value !== 'object' || !result.value?.shareUrl) return [];
        return [{
          id: result.value.invite?.$id ?? result.value.invite?.id ?? `${team.$id}-${index}`,
          name: inviteJobs[index].name,
          role: inviteJobs[index].role,
          shareUrl: result.value.shareUrl,
          emailSent: inviteJobs[index].emailSent,
        }];
      });
      onTeamCreated?.(team);
      if (links.length > 0 || failedCount > 0) {
        setCreatedTeamName(team.name);
        setCreatedInviteLinks(links);
        setCreationWarning(failedCount > 0
          ? `${failedCount} invite${failedCount === 1 ? '' : 's'} could not be saved. Open the team to retry.`
          : null);
        setCreating(false);
        return;
      }
      reset();
      onClose();
    } catch (createError) {
      console.error('Failed to create team from builder:', createError);
      setError(createError instanceof Error ? createError.message : 'Failed to create team.');
      setCreating(false);
    }
  };

  const copyInviteLink = async (invite: CreatedInviteLink) => {
    try {
      await navigator.clipboard.writeText(invite.shareUrl);
      setCopiedInviteId(invite.id);
    } catch {
      setError('The link could not be copied. Select and copy it manually.');
    }
  };

  if (createdTeamName) {
    return (
      <Modal
        opened={isOpen}
        onClose={closeBuilder}
        title="Team created"
        size="lg"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="md">
          <Alert color="green" variant="light" icon={<IconCheck size={18} />}>
            {createdTeamName} is ready. Share each registration link below with the intended person.
          </Alert>
          {creationWarning ? <Alert color="yellow" variant="light">{creationWarning}</Alert> : null}
          <ScrollArea.Autosize mah={320} type="auto" offsetScrollbars scrollbarSize={8}>
            <Stack gap="xs" pr="xs">
              {createdInviteLinks.map((invite) => (
                <Paper key={invite.id} withBorder radius="md" p="md">
                  <Group justify="space-between" wrap="nowrap" align="center">
                    <div style={{ minWidth: 0 }}>
                      <Text fw={700} truncate>{invite.name}</Text>
                      <Text size="sm" c="dimmed">
                        {invite.role}{invite.emailSent ? ' · Email invite sent' : ' · Link ready to share'}
                      </Text>
                    </div>
                    <Button
                      variant={copiedInviteId === invite.id ? 'light' : 'filled'}
                      leftSection={copiedInviteId === invite.id ? <IconCheck size={16} /> : <IconLink size={16} />}
                      onClick={() => { void copyInviteLink(invite); }}
                      size="md"
                      style={{ minWidth: 132 }}
                    >
                      {copiedInviteId === invite.id ? 'Link copied' : 'Copy link'}
                    </Button>
                  </Group>
                </Paper>
              ))}
              {createdInviteLinks.length === 0 ? (
                <Text size="sm" c="dimmed">No share links were created.</Text>
              ) : null}
            </Stack>
          </ScrollArea.Autosize>
          <Button onClick={closeBuilder} size="md">Done</Button>
        </Stack>
      </Modal>
    );
  }

  const rosterRows = (editable: boolean) => (
    <ScrollArea h={300} type="auto" offsetScrollbars scrollbarSize={8}>
      <Stack gap="xs" pr="xs">
        {addSelfAsPlayer && currentUser ? (
          <RosterRow
            avatar={getUserAvatarUrl(currentUser, 40)}
            name={getUserFullName(currentUser)}
            detail={`${creatorIsCaptain ? 'Captain · ' : ''}You`}
            badge={creatorIsCaptain ? 'Captain' : 'Player'}
          />
        ) : null}
        {selectedFreeAgents.map((user) => (
          <RosterRow
            key={`free-agent-${user.$id}`}
            avatar={getUserAvatarUrl(user, 40)}
            name={getUserFullName(user)}
            detail={getUserHandle(user) || 'Event free agent'}
            badge="Invite pending"
          />
        ))}
        {invites.map((invite) => {
          const isAccount = invite.kind === 'account';
          const name = isAccount ? getUserFullName(invite.user) : personName(invite);
          const detail = isAccount
            ? getUserHandle(invite.user) || 'BracketIQ account'
            : invite.email || invite.phone || 'Share link invite';
          return (
            <RosterRow
              key={invite.id}
              avatar={isAccount ? getUserAvatarUrl(invite.user, 40) : null}
              name={name}
              detail={detail}
              badge="Invite pending"
              onEdit={editable ? () => {
                if (invite.kind === 'person') {
                  setPersonEditor(invite);
                } else {
                  setInvites((current) => current.filter((candidate) => candidate.id !== invite.id));
                  setSearchQuery(getUserFullName(invite.user));
                }
              } : undefined}
              onRemove={editable ? () => setInvites((current) => current.filter((candidate) => candidate.id !== invite.id)) : undefined}
            />
          );
        })}
        {Array.from({ length: openSlots }).map((_, index) => (
          <Paper key={`open-${index}`} withBorder radius="md" p="sm" bg="gray.0">
            <Group gap="sm">
              <ThemeIcon variant="light" color="gray" radius="xl" size={40}><IconUserPlus size={18} /></ThemeIcon>
              <Text size="sm" c="dimmed">Open roster spot</Text>
            </Group>
          </Paper>
        ))}
      </Stack>
    </ScrollArea>
  );

  const staffRows = (editable: boolean) => (
    <ScrollArea.Autosize mah={240} type="auto" offsetScrollbars scrollbarSize={8}>
      <Stack gap="xs" pr="xs">
        {creatorIsManager && currentUser ? (
          <RosterRow
            avatar={getUserAvatarUrl(currentUser, 40)}
            name={getUserFullName(currentUser)}
            detail="Manager · You"
            badge="Active"
          />
        ) : null}
        {creatorCoachRole !== 'NONE' && currentUser ? (
          <RosterRow
            avatar={getUserAvatarUrl(currentUser, 40)}
            name={getUserFullName(currentUser)}
            detail={`${creatorCoachRole === 'HEAD_COACH' ? 'Head coach' : 'Assistant coach'} · You`}
            badge="Active"
          />
        ) : null}
        {!creatorIsManager && currentUser ? (
          <RosterRow
            avatar={getUserAvatarUrl(currentUser, 40)}
            name={getUserFullName(currentUser)}
            detail="Temporary manager until the invited manager accepts"
            badge="Temporary"
          />
        ) : null}
        {staffInvites.map((invite) => (
          <Stack key={invite.id} gap={4}>
            <RosterRow
              avatar={invite.kind === 'account' ? getUserAvatarUrl(invite.user, 40) : null}
              name={invite.kind === 'account' ? getUserFullName(invite.user) : `${invite.firstName} ${invite.lastName}`.trim()}
              detail={STAFF_ROLE_OPTIONS.find((option) => option.value === invite.role)?.label ?? 'Staff'}
              badge="Invite pending"
              onEdit={editable ? () => {
                if (invite.kind === 'person') {
                  setStaffPersonEditor(invite);
                  setEditingStaffId(null);
                } else {
                  setEditingStaffId((current) => current === invite.id ? null : invite.id);
                }
              } : undefined}
              onRemove={editable ? () => setStaffInvites((current) => current.filter((candidate) => candidate.id !== invite.id)) : undefined}
            />
            {editable && invite.kind === 'account' && editingStaffId === invite.id ? (
              <Select
                label={`Role for ${getUserFullName(invite.user)}`}
                data={[...STAFF_ROLE_OPTIONS]}
                value={invite.role}
                onChange={(value) => updateStaffRole(invite.id, (value as StaffInviteRole | null) ?? invite.role)}
                size="sm"
              />
            ) : null}
          </Stack>
        ))}
      </Stack>
    </ScrollArea.Autosize>
  );

  return (
    <Modal
      opened={isOpen}
      onClose={closeBuilder}
      title="Create a team"
      size="lg"
      centered
      closeOnClickOutside={!creating}
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        <div>
          <Group justify="space-between" align="end" mb={6}>
            <div>
              <Text size="xs" fw={700} tt="uppercase" c="blue">Step {step + 1} of {steps.length}</Text>
              <Text fw={700} size="lg">{steps[step]?.label}</Text>
            </div>
            <Text size="sm" c="dimmed">{rosterCount} / {Number.isFinite(resolvedTeamSize) ? resolvedTeamSize : 0} spots</Text>
          </Group>
          <Progress value={((step + 1) / steps.length) * 100} size="sm" radius="xl" />
        </div>

        {error ? <Alert color="red" variant="light">{error}</Alert> : null}

        {activeStep === 'team' ? (
          <Stack gap="sm">
            {event ? (
              <Paper withBorder radius="md" p="sm" bg="blue.0">
                <Text size="xs" fw={700} c="blue">Building for event</Text>
                <Text fw={600}>{event.name}</Text>
              </Paper>
            ) : null}
            <TextInput
              label="Team name"
              placeholder="e.g. Cascade Crew"
              value={teamName}
              onChange={(eventInput) => setTeamName(eventInput.currentTarget.value)}
              required
              maxLength={50}
              size="md"
            />
            <Group grow align="start">
              <NumberInput
                label="Team size"
                value={teamSize}
                onChange={setTeamSize}
                min={2}
                allowDecimal={false}
                size="md"
              />
              <Select
                label="Sport"
                data={sportOptions}
                value={sport || null}
                onChange={(value) => setSport(value ?? '')}
                searchable
                disabled={Boolean(eventSportName(event))}
                size="md"
              />
            </Group>
            {loadingEvent ? <Text size="sm" c="dimmed">Checking event roster options…</Text> : null}
          </Stack>
        ) : null}

        {activeStep === 'freeAgents' ? (
          <Stack gap="sm">
            <div>
              <Text fw={700}>Invite free agents from this event</Text>
              <Text size="sm" c="dimmed">Choose interested players now. You can remove a selection before continuing.</Text>
            </div>
            {freeAgents.length > 0 ? (
              <ScrollArea h={300} type="auto" offsetScrollbars scrollbarSize={8}>
                <Stack gap="xs" pr="xs">
                  {freeAgents.map((user) => {
                    const selected = selectedFreeAgentIds.includes(user.$id);
                    return (
                      <Paper key={user.$id} withBorder radius="md" p="sm" bg={selected ? 'blue.0' : undefined}>
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                            <Avatar src={getUserAvatarUrl(user, 40)} alt={getUserFullName(user)} size={40} radius="xl" />
                            <div style={{ minWidth: 0 }}>
                              <Text fw={600} truncate>{getUserFullName(user)}</Text>
                              <Text size="xs" c="dimmed" truncate>{getUserHandle(user) || 'Event free agent'}</Text>
                            </div>
                          </Group>
                          <Button
                            size="xs"
                            variant={selected ? 'light' : 'filled'}
                            color={selected ? 'red' : 'blue'}
                            leftSection={selected ? <IconX size={14} /> : <IconUserPlus size={14} />}
                            onClick={() => toggleFreeAgent(user.$id)}
                            disabled={!selected && isAtCapacity}
                          >
                            {selected ? 'Remove' : 'Add'}
                          </Button>
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              </ScrollArea>
            ) : null}
          </Stack>
        ) : null}

        {activeStep === 'staff' ? (
          <Stack gap="sm">
            <div>
              <Text fw={700}>Set team leadership</Text>
              <Text size="sm" c="dimmed">Choose your roles, then invite existing BracketIQ accounts to help manage or coach.</Text>
            </div>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Checkbox
                  label="I will manage this team"
                  description="Turn this off when another invited manager will take over."
                  checked={creatorIsManager}
                  onChange={(eventInput) => {
                    const checked = eventInput.currentTarget.checked;
                    setCreatorIsManager(checked);
                    if (checked) setStaffInvites((current) => current.filter((invite) => invite.role !== 'team_manager'));
                  }}
                  size="md"
                />
                <Checkbox
                  label="I’m on the player roster"
                  checked={addSelfAsPlayer}
                  onChange={(eventInput) => {
                    const checked = eventInput.currentTarget.checked;
                    setAddSelfAsPlayer(checked);
                    if (!checked) setCreatorIsCaptain(false);
                  }}
                  size="md"
                />
                <Checkbox
                  label="Make me captain"
                  description="The captain must be on the player roster."
                  checked={creatorIsCaptain}
                  disabled={!addSelfAsPlayer}
                  onChange={(eventInput) => setCreatorIsCaptain(eventInput.currentTarget.checked)}
                  size="md"
                />
                <Select
                  label="My coaching role"
                  data={[...CREATOR_COACH_OPTIONS]}
                  value={creatorCoachRole}
                  onChange={(value) => setCreatorCoachRole((value as CreatorCoachRole | null) ?? 'NONE')}
                  size="md"
                />
              </Stack>
            </Paper>
            {!creatorIsManager ? (
              <Alert color="blue" variant="light">You will remain the temporary manager until the invited manager accepts.</Alert>
            ) : null}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="Search BracketIQ staff"
                placeholder="Name or username"
                leftSection={<IconSearch size={16} />}
                value={staffSearchQuery}
                onChange={(eventInput) => setStaffSearchQuery(eventInput.currentTarget.value)}
                size="md"
              />
              <Select
                label="Role"
                data={[...STAFF_ROLE_OPTIONS]}
                value={staffRole}
                onChange={(value) => setStaffRole((value as StaffInviteRole | null) ?? 'team_manager')}
                size="md"
              />
            </SimpleGrid>
            <Button
              variant="light"
              leftSection={<IconUserPlus size={16} />}
              onClick={() => {
                const draft = makeStaffPersonDraft(staffRole);
                setStaffPersonEditor(draft);
              }}
              size="md"
              style={{ alignSelf: 'flex-start' }}
            >
              New staff member
            </Button>
            {staffSearching ? <Text size="sm" c="dimmed">Searching…</Text> : null}
            {!staffSearching && staffSearchQuery.trim().length >= 2 && staffSearchResults.length > 0 ? (
              <ScrollArea h={180} type="auto" offsetScrollbars scrollbarSize={8}>
                <Stack gap="xs" pr="xs">
                  {staffSearchResults.map((user) => (
                    <Paper key={user.$id} withBorder radius="md" p="sm">
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                          <Avatar src={getUserAvatarUrl(user, 36)} alt={getUserFullName(user)} size={36} radius="xl" />
                          <div style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>{getUserFullName(user)}</Text>
                            <Text size="xs" c="dimmed" truncate>{getUserHandle(user)}</Text>
                          </div>
                        </Group>
                        <Button size="xs" onClick={() => addStaffInvite(user)}>Add</Button>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea>
            ) : null}
            {!staffSearching && staffSearchQuery.trim().length >= 2 && staffSearchResults.length === 0 ? (
              <Text size="sm" c="dimmed">No available accounts match “{staffSearchQuery.trim()}”.</Text>
            ) : null}
            {staffPersonEditor ? (
              <Paper withBorder radius="md" p="md" bg="gray.0">
                <Group justify="space-between" mb="xs">
                  <Text fw={700}>{staffInvites.some((invite) => invite.id === staffPersonEditor.id) ? 'Edit staff invite' : 'New staff member'}</Text>
                  <Button variant="subtle" color="gray" size="compact-sm" onClick={() => setStaffPersonEditor(null)}>Close</Button>
                </Group>
                <Stack gap="xs">
                  <Select
                    label="Team role"
                    data={[...STAFF_ROLE_OPTIONS]}
                    value={staffPersonEditor.role}
                    onChange={(value) => setStaffPersonEditor({
                      ...staffPersonEditor,
                      role: (value as StaffInviteRole | null) ?? staffPersonEditor.role,
                    })}
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                    <TextInput label="First name" value={staffPersonEditor.firstName} onChange={(e) => setStaffPersonEditor({ ...staffPersonEditor, firstName: e.currentTarget.value })} required />
                    <TextInput label="Last name" value={staffPersonEditor.lastName} onChange={(e) => setStaffPersonEditor({ ...staffPersonEditor, lastName: e.currentTarget.value })} required />
                    <TextInput label="Email (optional)" leftSection={<IconMail size={15} />} value={staffPersonEditor.email} onChange={(e) => setStaffPersonEditor({ ...staffPersonEditor, email: e.currentTarget.value })} />
                    <TextInput label="Phone (optional)" inputMode="tel" value={staffPersonEditor.phone} onChange={(e) => setStaffPersonEditor({ ...staffPersonEditor, phone: formatPhoneInput(e.currentTarget.value) })} />
                  </SimpleGrid>
                  <Button onClick={saveStaffPerson} style={{ alignSelf: 'flex-end', minWidth: 170 }}>
                    {EMAIL_REGEX.test(staffPersonEditor.email.trim()) ? 'Send email invite' : 'Save invite'}
                  </Button>
                </Stack>
              </Paper>
            ) : null}
            <Divider label="Team staff" labelPosition="left" />
            {staffRows(true)}
          </Stack>
        ) : null}

        {activeStep === 'invite' ? (
          <Stack gap="sm">
            <div>
              <Text fw={700}>Add more players</Text>
              <Text size="sm" c="dimmed">Search BracketIQ or add a new person. The roster below is the complete invite list.</Text>
            </div>
            <Group align="end" wrap="nowrap">
              <TextInput
                label="Search BracketIQ"
                placeholder="Name or username"
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(eventInput) => setSearchQuery(eventInput.currentTarget.value)}
                style={{ flex: 1 }}
                size="md"
              />
              <Button
                variant="light"
                leftSection={<IconUserPlus size={16} />}
                onClick={() => setPersonEditor(makePersonDraft())}
                disabled={isAtCapacity}
                size="md"
              >
                New person
              </Button>
            </Group>

            {searching ? <Text size="sm" c="dimmed">Searching…</Text> : null}
            {!searching && searchQuery.trim().length >= 2 && searchResults.length > 0 ? (
              <ScrollArea h={190} type="auto" offsetScrollbars scrollbarSize={8}>
                <Stack gap="xs" pr="xs">
                  {searchResults.map((user) => (
                    <Paper key={user.$id} withBorder radius="md" p="sm">
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                          <Avatar src={getUserAvatarUrl(user, 36)} alt={getUserFullName(user)} size={36} radius="xl" />
                          <div style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>{getUserFullName(user)}</Text>
                            <Text size="xs" c="dimmed" truncate>{getUserHandle(user)}</Text>
                          </div>
                        </Group>
                        <Button size="xs" onClick={() => addAccountInvite(user)} disabled={isAtCapacity}>Add</Button>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea>
            ) : null}
            {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
              <Text size="sm" c="dimmed">No available players match “{searchQuery.trim()}”.</Text>
            ) : null}

            {personEditor ? (
              <Paper withBorder radius="md" p="md" bg="gray.0">
                <Group justify="space-between" mb="xs">
                  <Text fw={700}>{invites.some((invite) => invite.id === personEditor.id) ? 'Edit invite' : 'New person'}</Text>
                  <Button variant="subtle" color="gray" size="compact-sm" onClick={() => setPersonEditor(null)}>Close</Button>
                </Group>
                <Stack gap="xs">
                  <Group grow>
                    <TextInput label="First name" value={personEditor.firstName} onChange={(e) => setPersonEditor({ ...personEditor, firstName: e.currentTarget.value })} required />
                    <TextInput label="Last name" value={personEditor.lastName} onChange={(e) => setPersonEditor({ ...personEditor, lastName: e.currentTarget.value })} required />
                  </Group>
                  <Group grow>
                    <TextInput label="Email (optional)" leftSection={<IconMail size={15} />} value={personEditor.email} onChange={(e) => setPersonEditor({ ...personEditor, email: e.currentTarget.value })} />
                    <TextInput label="Phone (optional)" inputMode="tel" value={personEditor.phone} onChange={(e) => setPersonEditor({ ...personEditor, phone: formatPhoneInput(e.currentTarget.value) })} />
                  </Group>
                  <Button onClick={savePerson} style={{ alignSelf: 'flex-end', minWidth: 170 }}>
                    {EMAIL_REGEX.test(personEditor.email.trim()) ? 'Send email invite' : 'Save invite'}
                  </Button>
                </Stack>
              </Paper>
            ) : null}

            <Divider label="Roster" labelPosition="left" />
            {rosterRows(true)}
          </Stack>
        ) : null}

        {activeStep === 'review' ? (
          <Stack gap="sm">
            <Paper withBorder radius="md" p="md">
              <Group justify="space-between" align="start">
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Team</Text>
                  <Text size="lg" fw={700}>{teamName.trim()}</Text>
                  <Text size="sm" c="dimmed">{sport} · {resolvedTeamSize} players</Text>
                </div>
                <Badge variant="light">{openSlots} open</Badge>
              </Group>
            </Paper>
            <div>
              <Text fw={700}>Review staff</Text>
              <Text size="sm" c="dimmed">Invited staff receive their role after accepting. A replacement manager takes over after acceptance.</Text>
            </div>
            {staffRows(false)}
            <div>
              <Text fw={700}>Review roster</Text>
              <Text size="sm" c="dimmed">Invitations are sent after the team is created. Free agents remain free agents until they accept.</Text>
            </div>
            {rosterRows(false)}
          </Stack>
        ) : null}

        <Divider />
        <Group justify="space-between" wrap="nowrap">
          <Button
            variant="default"
            leftSection={step > 0 ? <IconChevronLeft size={16} /> : undefined}
            onClick={step > 0 ? () => { setError(null); setStep((current) => current - 1); } : closeBuilder}
            disabled={creating}
            size="md"
          >
            {step > 0 ? 'Back' : 'Cancel'}
          </Button>
          {step < steps.length - 1 ? (
            <Button rightSection={<IconChevronRight size={16} />} onClick={nextStep} size="md" disabled={loadingEvent && activeStep === 'team'}>
              {activeStep === 'invite' ? 'Review team' : 'Continue'}
            </Button>
          ) : (
            <Button leftSection={<IconCheck size={16} />} onClick={() => { void createTeam(); }} loading={creating} size="md">
              Create team
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

function RosterRow({
  avatar,
  name,
  detail,
  badge,
  onEdit,
  onRemove,
}: {
  avatar?: string | null;
  name: string;
  detail: string;
  badge?: string;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Avatar src={avatar} name={name} size={40} radius="xl" />
          <div style={{ minWidth: 0 }}>
            <Text fw={600} size="sm" truncate>{name}</Text>
            <Group gap={6} wrap="nowrap">
              <Text size="xs" c="dimmed" truncate>{detail}</Text>
              {badge ? <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>{badge}</Badge> : null}
            </Group>
          </div>
        </Group>
        {onEdit || onRemove ? (
          <Group gap={2} wrap="nowrap">
            {onEdit ? (
              <Button variant="subtle" size="compact-xs" px={6} onClick={onEdit}>Edit</Button>
            ) : null}
            {onRemove ? (
              <Button variant="subtle" color="red" size="compact-xs" px={6} aria-label={`Remove ${name}`} onClick={onRemove}><IconX size={16} /></Button>
            ) : null}
          </Group>
        ) : null}
      </Group>
    </Paper>
  );
}
