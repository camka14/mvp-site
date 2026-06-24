import type { ReactNode } from 'react';
import {
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import TeamDetailModal from '@/components/ui/TeamDetailModal';
import UserCard from '@/components/ui/UserCard';
import type { Team, UserData } from '@/types';

import {
  collectTeamRosterUserIds,
  type DivisionOption,
  type ParticipantInviteMode,
  type ParticipantInviteRow,
} from './helpers';

export type ParticipantTeamCardRenderArgs = {
  cardKey: string;
  team: Team;
  actions?: ReactNode;
  className?: string;
  showComplianceDetails?: boolean;
  showTeamMetadata?: boolean;
  enableDetailsView?: boolean;
  fullWidth?: boolean;
};

type AddParticipantModalProps = {
  opened: boolean;
  fullScreen: boolean;
  inviteMode: ParticipantInviteMode;
  participantSearchValue: string;
  participantSearchError: string | null;
  participantSearchLoading: boolean;
  participantSearchResults: UserData[];
  participantsUpdatingTeamId: string | null;
  inviteRows: ParticipantInviteRow[];
  inviteError: string | null;
  invitingParticipants: boolean;
  organizationIdForParticipants?: string | null;
  organizationTeamsLoading: boolean;
  availableOrganizationParticipantTeams: Team[];
  participantUserIdSet: Set<string>;
  onClose: () => void;
  onInviteModeChange: (mode: ParticipantInviteMode) => void;
  onSearchParticipants: (query: string) => void;
  onAddExistingParticipant: (participant: UserData) => void;
  onInviteRowsChange: (rows: ParticipantInviteRow[]) => void;
  onInviteParticipantsByEmail: () => void;
  onAddTeamRosterParticipants: (team: Team) => void;
  renderParticipantTeamCard: (args: ParticipantTeamCardRenderArgs) => ReactNode;
};

export function AddParticipantModal({
  opened,
  fullScreen,
  inviteMode,
  participantSearchValue,
  participantSearchError,
  participantSearchLoading,
  participantSearchResults,
  participantsUpdatingTeamId,
  inviteRows,
  inviteError,
  invitingParticipants,
  organizationIdForParticipants,
  organizationTeamsLoading,
  availableOrganizationParticipantTeams,
  participantUserIdSet,
  onClose,
  onInviteModeChange,
  onSearchParticipants,
  onAddExistingParticipant,
  onInviteRowsChange,
  onInviteParticipantsByEmail,
  onAddTeamRosterParticipants,
  renderParticipantTeamCard,
}: AddParticipantModalProps) {
  const updateInviteRow = (index: number, patch: Partial<ParticipantInviteRow>) => {
    const next = [...inviteRows];
    next[index] = { ...next[index], ...patch };
    onInviteRowsChange(next);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add Participant"
      size="xl"
      centered
      fullScreen={fullScreen}
    >
      <Stack gap="md">
        <SegmentedControl
          value={inviteMode}
          onChange={(value) => onInviteModeChange(value as ParticipantInviteMode)}
          data={[
            { label: 'Add existing', value: 'existing' },
            { label: 'Email invite', value: 'email' },
            ...(organizationIdForParticipants ? [{ label: 'Add from team', value: 'team' }] : []),
          ]}
        />

        {inviteMode === 'existing' ? (
          <Stack gap="sm">
            <TextInput
              label="Search participants"
              placeholder="Search by name or username"
              value={participantSearchValue}
              onChange={(event) => onSearchParticipants(event.currentTarget.value)}
            />
            {participantSearchError ? (
              <Text size="xs" c="red">{participantSearchError}</Text>
            ) : null}
            {participantSearchLoading ? (
              <Paper withBorder radius="md" p="md">
                <Group justify="center" gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Searching participants...</Text>
                </Group>
              </Paper>
            ) : participantSearchValue.trim().length < 2 ? (
              <Text size="sm" c="dimmed">Type at least 2 characters to search.</Text>
            ) : participantSearchResults.length > 0 ? (
              <Stack gap="xs">
                {participantSearchResults.map((result) => (
                  <Paper key={result.$id} withBorder p="sm" radius="md">
                    <Group justify="space-between" align="center" gap="sm">
                      <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                      <Button
                        size="xs"
                        onClick={() => onAddExistingParticipant(result)}
                        loading={participantsUpdatingTeamId === result.$id}
                      >
                        Add
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">No users found.</Text>
            )}
          </Stack>
        ) : inviteMode === 'email' ? (
          <Stack gap="sm">
            {inviteRows.map((invite, index) => (
              <Paper key={index} withBorder radius="md" p="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput
                    label="First name"
                    placeholder="First name"
                    value={invite.firstName}
                    onChange={(event) => updateInviteRow(index, { firstName: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Last name"
                    placeholder="Last name"
                    value={invite.lastName}
                    onChange={(event) => updateInviteRow(index, { lastName: event.currentTarget.value })}
                  />
                </SimpleGrid>
                <TextInput
                  mt="sm"
                  label="Email"
                  placeholder="name@example.com"
                  value={invite.email}
                  onChange={(event) => updateInviteRow(index, { email: event.currentTarget.value })}
                />
                {inviteRows.length > 1 ? (
                  <Group justify="flex-end" mt="xs">
                    <Button
                      variant="subtle"
                      color="red"
                      size="xs"
                      onClick={() => onInviteRowsChange(inviteRows.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Remove
                    </Button>
                  </Group>
                ) : null}
              </Paper>
            ))}
            <Group justify="space-between" align="center">
              <Button
                type="button"
                variant="default"
                size="xs"
                onClick={() => onInviteRowsChange([...inviteRows, { firstName: '', lastName: '', email: '' }])}
              >
                Add row
              </Button>
              <Button
                onClick={onInviteParticipantsByEmail}
                loading={invitingParticipants}
                disabled={invitingParticipants}
              >
                Send invites
              </Button>
            </Group>
            {inviteError ? <Text size="xs" c="red">{inviteError}</Text> : null}
          </Stack>
        ) : (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Add every player and staff member from an organization team, including managers and coaches.
            </Text>
            {inviteError ? <Text size="xs" c="red">{inviteError}</Text> : null}
            {organizationTeamsLoading ? (
              <Paper withBorder radius="md" p="md">
                <Group justify="center" gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Loading organization teams...</Text>
                </Group>
              </Paper>
            ) : availableOrganizationParticipantTeams.length === 0 ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed" ta="center">
                  No organization teams are available.
                </Text>
              </Paper>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                {availableOrganizationParticipantTeams.map((team) => {
                  const rosterUserIds = collectTeamRosterUserIds(team);
                  const availableRosterCount = rosterUserIds.filter((userId) => !participantUserIdSet.has(userId)).length;
                  return renderParticipantTeamCard({
                    cardKey: `participant-roster-${team.$id}`,
                    team,
                    showComplianceDetails: false,
                    showTeamMetadata: true,
                    enableDetailsView: false,
                    actions: participantsUpdatingTeamId === team.$id
                      ? <Text size="xs" c="dimmed">Adding roster...</Text>
                      : (
                        <Stack gap={6}>
                          <Text size="xs" c="dimmed">
                            {availableRosterCount > 0
                              ? `${availableRosterCount} roster member${availableRosterCount === 1 ? '' : 's'} available to add`
                              : 'All roster members already added'}
                          </Text>
                          <Button
                            size="xs"
                            disabled={availableRosterCount === 0}
                            onClick={(event) => {
                              event.stopPropagation();
                              onAddTeamRosterParticipants(team);
                            }}
                          >
                            Add Roster
                          </Button>
                        </Stack>
                      ),
                  });
                })}
              </SimpleGrid>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

type AddTeamModalProps = {
  opened: boolean;
  fullScreen: boolean;
  teamSearchQuery: string;
  isSplitDivisionEvent: boolean;
  participantDivisionSelectData: DivisionOption[];
  selectedAddTeamDivisionId: string | null;
  organizationIdForParticipants?: string | null;
  organizationTeamsLoading: boolean;
  displayedOrganizationTeams: Team[];
  hasTeamSearchInput: boolean;
  teamSearchMeetsMinimum: boolean;
  searchTeamsLoading: boolean;
  searchResultTeams: Team[];
  participantsUpdatingTeamId: string | null;
  onOpenedChange: (opened: boolean) => void;
  onTeamSearchQueryChange: (query: string) => void;
  onSelectedAddTeamDivisionIdChange: (divisionId: string | null) => void;
  onAddTeamToParticipants: (team: Team) => void;
  renderParticipantTeamCard: (args: ParticipantTeamCardRenderArgs) => ReactNode;
};

export function AddTeamModal({
  opened,
  fullScreen,
  teamSearchQuery,
  isSplitDivisionEvent,
  participantDivisionSelectData,
  selectedAddTeamDivisionId,
  organizationIdForParticipants,
  organizationTeamsLoading,
  displayedOrganizationTeams,
  hasTeamSearchInput,
  teamSearchMeetsMinimum,
  searchTeamsLoading,
  searchResultTeams,
  participantsUpdatingTeamId,
  onOpenedChange,
  onTeamSearchQueryChange,
  onSelectedAddTeamDivisionIdChange,
  onAddTeamToParticipants,
  renderParticipantTeamCard,
}: AddTeamModalProps) {
  const closeModal = () => {
    onOpenedChange(false);
    onTeamSearchQueryChange('');
    onSelectedAddTeamDivisionIdChange(null);
  };

  const renderTeamCard = (team: Team, cardKey: string) => renderParticipantTeamCard({
    cardKey,
    team,
    showComplianceDetails: false,
    showTeamMetadata: true,
    enableDetailsView: false,
    actions: participantsUpdatingTeamId === team.$id
      ? <Text size="xs" c="dimmed">Adding...</Text>
      : (
        <Button
          size="xs"
          onClick={(event) => {
            event.stopPropagation();
            onAddTeamToParticipants(team);
          }}
        >
          Add
        </Button>
      ),
  });

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title="Add Team"
      size="xl"
      centered
      fullScreen={fullScreen}
    >
      <Stack gap="md">
        <TextInput
          label="Search teams"
          placeholder="Type at least 2 characters"
          value={teamSearchQuery}
          onChange={(event) => onTeamSearchQueryChange(event.currentTarget.value)}
        />

        {isSplitDivisionEvent && (
          <Select
            label="Assign to division"
            data={participantDivisionSelectData}
            value={selectedAddTeamDivisionId}
            onChange={(value) => onSelectedAddTeamDivisionIdChange(value)}
            allowDeselect={false}
          />
        )}

        {organizationIdForParticipants && (
          <Stack gap="sm">
            <Text fw={600} size="sm">Organization Teams</Text>
            {organizationTeamsLoading ? (
              <Paper withBorder radius="md" p="md">
                <Group justify="center" gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Loading organization teams...</Text>
                </Group>
              </Paper>
            ) : displayedOrganizationTeams.length === 0 ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed" ta="center">
                  {hasTeamSearchInput && !teamSearchMeetsMinimum
                    ? 'Enter at least 2 characters to search organization teams.'
                    : hasTeamSearchInput
                      ? 'No organization teams match your search.'
                      : 'No organization teams available to add.'}
                </Text>
              </Paper>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                {displayedOrganizationTeams.map((team) => renderTeamCard(team, `org-team-${team.$id}`))}
              </SimpleGrid>
            )}
          </Stack>
        )}

        {!organizationIdForParticipants && (
          <Stack gap="sm">
            <Text fw={600} size="sm">Search Results</Text>
            {!teamSearchMeetsMinimum ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed" ta="center">
                  Enter at least 2 characters to search your teams.
                </Text>
              </Paper>
            ) : searchTeamsLoading ? (
              <Paper withBorder radius="md" p="md">
                <Group justify="center" gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Loading your teams...</Text>
                </Group>
              </Paper>
            ) : searchResultTeams.length === 0 ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed" ta="center">
                  No personal teams match your search.
                </Text>
              </Paper>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                {searchResultTeams.map((team) => renderTeamCard(team, `search-team-${team.$id}`))}
              </SimpleGrid>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

type ParticipantTeamDetailModalProps = {
  team: Team | null;
  onClose: () => void;
};

export function ParticipantTeamDetailModal({
  team,
  onClose,
}: ParticipantTeamDetailModalProps) {
  if (!team) {
    return null;
  }

  return (
    <TeamDetailModal
      currentTeam={team}
      isOpen={Boolean(team)}
      onClose={onClose}
      canManage={false}
    />
  );
}

