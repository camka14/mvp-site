import type { ReactNode } from 'react';
import { Alert, Button, Group, Loader, Paper, Select, Stack, Text } from '@mantine/core';

import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import type { EventParticipantDivisionWarning } from '@/lib/eventService';
import type { Team, UserData } from '@/types';

type ParticipantDivisionColumn = {
  id: string;
  label: string;
  teamIds: string[];
};

type SelectOption = {
  value: string;
  label: string;
};

type ParticipantTeamCardParams = {
  cardKey: string;
  team: Team;
  actions?: ReactNode;
  className?: string;
  showComplianceDetails?: boolean;
  showTeamMetadata?: boolean;
  enableDetailsView?: boolean;
  fullWidth?: boolean;
};

type ParticipantUserCardParams = {
  cardKey: string;
  participant: UserData;
  actions?: ReactNode;
  className?: string;
  fullWidth?: boolean;
};

type ParticipantsPanelProps = {
  teamSignup?: boolean | null;
  weeklyParticipantSelectionRequired: boolean;
  participantUsers: UserData[];
  participantTeams: Team[];
  filledParticipantTeams: Team[];
  canManageEvent: boolean;
  participantsError: string | null;
  canUseTeamCompliance: boolean;
  teamComplianceError: string | null;
  canUseUserCompliance: boolean;
  userComplianceError: string | null;
  participantsLoading: boolean;
  isSplitDivisionEvent: boolean;
  participantDivisionColumns: ParticipantDivisionColumn[];
  participantTeamsById: Map<string, Team>;
  participantDivisionWarningsByDivisionId: Map<string, EventParticipantDivisionWarning[]>;
  participantDivisionSelectData: SelectOption[];
  participantsUpdatingTeamId: string | null;
  isEditingEvent: boolean;
  unassignedParticipantTeams: Team[];
  unassignedFilledParticipantTeams: Team[];
  isPlaceholderParticipantTeam: (team: Team | null | undefined) => boolean;
  toUserParticipantPseudoTeam: (participant: UserData) => Team;
  renderEditBillingActions: (team: Team) => ReactNode;
  renderParticipantTeamCard: (params: ParticipantTeamCardParams) => ReactNode;
  renderParticipantUserCard: (params: ParticipantUserCardParams) => ReactNode;
  onOpenAddParticipants: () => void;
  onOpenAddTeam: () => void;
  onMoveTeamDivision: (team: Team, divisionId: string | null) => void | Promise<void>;
  onRemoveTeamFromParticipants: (team: Team) => void | Promise<void>;
  onRemoveUserFromParticipants: (participant: UserData) => void | Promise<void>;
};

export default function ParticipantsPanel({
  teamSignup,
  weeklyParticipantSelectionRequired,
  participantUsers,
  participantTeams,
  filledParticipantTeams,
  canManageEvent,
  participantsError,
  canUseTeamCompliance,
  teamComplianceError,
  canUseUserCompliance,
  userComplianceError,
  participantsLoading,
  isSplitDivisionEvent,
  participantDivisionColumns,
  participantTeamsById,
  participantDivisionWarningsByDivisionId,
  participantDivisionSelectData,
  participantsUpdatingTeamId,
  isEditingEvent,
  unassignedParticipantTeams,
  unassignedFilledParticipantTeams,
  isPlaceholderParticipantTeam,
  toUserParticipantPseudoTeam,
  renderEditBillingActions,
  renderParticipantTeamCard,
  renderParticipantUserCard,
  onOpenAddParticipants,
  onOpenAddTeam,
  onMoveTeamDivision,
  onRemoveTeamFromParticipants,
  onRemoveUserFromParticipants,
}: ParticipantsPanelProps) {
  const isUserSignup = teamSignup === false;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          {weeklyParticipantSelectionRequired
            ? 'Select a session from the Schedule tab to manage weekly participants.'
            : isUserSignup
              ? (
                participantUsers.length === 1
                  ? '1 participant is currently registered.'
                  : `${participantUsers.length} participants are currently registered.`
              )
              : (
                filledParticipantTeams.length === 1
                  ? '1 team is currently participating.'
                  : `${filledParticipantTeams.length} teams are currently participating.`
              )}
        </Text>
        {canManageEvent && !weeklyParticipantSelectionRequired && (
          isUserSignup ? (
            <Button variant="light" onClick={onOpenAddParticipants}>
              Add Participants
            </Button>
          ) : (
            <Button variant="light" onClick={onOpenAddTeam}>
              Add Team
            </Button>
          )
        )}
      </Group>

      {participantsError && (
        <Alert color="red" radius="md">
          {participantsError}
        </Alert>
      )}

      {canUseTeamCompliance && teamComplianceError && (
        <Alert color="yellow" radius="md">
          {teamComplianceError}
        </Alert>
      )}

      {canUseUserCompliance && userComplianceError && (
        <Alert color="yellow" radius="md">
          {userComplianceError}
        </Alert>
      )}

      {weeklyParticipantSelectionRequired ? (
        <Paper withBorder radius="md" p="xl" ta="center">
          <Text>Select a session in the Schedule tab before viewing or managing participants.</Text>
        </Paper>
      ) : participantsLoading ? (
        <Paper withBorder radius="md" p="xl">
          <Group justify="center" gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Loading participants...</Text>
          </Group>
        </Paper>
      ) : isUserSignup ? (
        participantUsers.length === 0 ? (
          <Paper withBorder radius="md" p="xl" ta="center">
            <Text>No participants have been added yet.</Text>
          </Paper>
        ) : (
          <ResponsiveCardGrid maxCardWidth={360}>
            {participantUsers.map((participant) => {
              const pseudoTeam = toUserParticipantPseudoTeam(participant);
              return renderParticipantUserCard({
                cardKey: participant.$id,
                participant,
                fullWidth: true,
                actions: canManageEvent
                  ? (
                    participantsUpdatingTeamId === participant.$id
                      ? <Text size="xs" c="dimmed">Updating...</Text>
                      : (
                        <Stack gap={6} align="flex-start">
                          {renderEditBillingActions(pseudoTeam)}
                          <Button
                            size="xs"
                            variant="light"
                            color="red"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onRemoveUserFromParticipants(participant);
                            }}
                          >
                            Remove
                          </Button>
                        </Stack>
                      )
                  )
                  : undefined,
              });
            })}
          </ResponsiveCardGrid>
        )
      ) : participantTeams.length === 0 ? (
        <Paper withBorder radius="md" p="xl" ta="center">
          <Text>No teams have been added yet.</Text>
        </Paper>
      ) : isSplitDivisionEvent ? (
        <div className="overflow-x-auto">
          <Group align="flex-start" gap="md" wrap="nowrap">
            {participantDivisionColumns.map((column) => {
              const columnTeams = column.teamIds
                .map((teamId) => participantTeamsById.get(teamId))
                .filter((team): team is Team => Boolean(team));
              const filledColumnTeamsCount = columnTeams.filter((team) => !isPlaceholderParticipantTeam(team)).length;
              const columnWarnings = participantDivisionWarningsByDivisionId.get(column.id.toLowerCase()) ?? [];
              return (
                <Paper key={column.id} withBorder radius="md" p="md" miw={320}>
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Text fw={600}>{column.label}</Text>
                      <Text size="xs" c="dimmed">{filledColumnTeamsCount}</Text>
                    </Group>
                    {columnWarnings.map((warning) => (
                      <Alert key={`${column.id}:${warning.code}`} color="yellow" radius="md" py="xs">
                        <Text size="xs">{warning.message}</Text>
                      </Alert>
                    ))}
                    {columnTeams.length === 0 ? (
                      <Text size="sm" c="dimmed">No teams assigned.</Text>
                    ) : (
                      <Stack gap="sm">
                        {columnTeams.map((team) => {
                          const canMoveTeamBetweenDivisions = isEditingEvent && canManageEvent;
                          const isPlaceholderTeam = isPlaceholderParticipantTeam(team);
                          const teamActions = isEditingEvent && canManageEvent && !isPlaceholderTeam
                            ? (
                              participantsUpdatingTeamId === team.$id
                                ? <Text size="xs" c="dimmed">Updating...</Text>
                                : (
                                  <Stack gap={6} align="flex-start">
                                    {canMoveTeamBetweenDivisions ? (
                                      <Select
                                        size="xs"
                                        aria-label={`Move ${team.name || 'team'} to division`}
                                        data={participantDivisionSelectData}
                                        value={column.id}
                                        onChange={(value) => {
                                          void onMoveTeamDivision(team, value);
                                        }}
                                        allowDeselect={false}
                                        w={200}
                                      />
                                    ) : null}
                                    {renderEditBillingActions(team)}
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="red"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void onRemoveTeamFromParticipants(team);
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  </Stack>
                                )
                            )
                            : undefined;

                          return renderParticipantTeamCard({
                            cardKey: `${column.id}:${team.$id}`,
                            team,
                            className: isPlaceholderTeam ? '!bg-gray-100' : '',
                            enableDetailsView: !isPlaceholderTeam,
                            actions: teamActions,
                          });
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              );
            })}
            {canManageEvent && (
              <Paper withBorder radius="md" p="md" miw={320}>
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text fw={600}>Unassigned</Text>
                    <Text size="xs" c={unassignedFilledParticipantTeams.length > 0 ? 'red' : 'dimmed'}>
                      {unassignedFilledParticipantTeams.length}
                    </Text>
                  </Group>
                  {unassignedParticipantTeams.length === 0 ? (
                    <Text size="sm" c="dimmed">All teams assigned.</Text>
                  ) : (
                    <Stack gap="sm">
                      {unassignedParticipantTeams.map((team) => {
                        const isPlaceholderTeam = isPlaceholderParticipantTeam(team);
                        const teamActions = isEditingEvent && !isPlaceholderTeam
                          ? (
                            participantsUpdatingTeamId === team.$id
                              ? <Text size="xs" c="dimmed">Updating...</Text>
                              : (
                                <Stack gap={6} align="flex-start">
                                  <Select
                                    size="xs"
                                    aria-label={`Move ${team.name || 'team'} to division`}
                                    data={participantDivisionSelectData}
                                    value={null}
                                    placeholder="Move to division"
                                    onChange={(value) => {
                                      void onMoveTeamDivision(team, value);
                                    }}
                                    allowDeselect
                                    w={200}
                                  />
                                  {renderEditBillingActions(team)}
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="red"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void onRemoveTeamFromParticipants(team);
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </Stack>
                              )
                          )
                          : undefined;

                        return renderParticipantTeamCard({
                          cardKey: `unassigned:${team.$id}`,
                          team,
                          className: isPlaceholderTeam ? '!bg-gray-100' : '',
                          enableDetailsView: !isPlaceholderTeam,
                          actions: teamActions,
                        });
                      })}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            )}
          </Group>
        </div>
      ) : (
        <ResponsiveCardGrid maxCardWidth={360}>
          {participantTeams.map((team) => {
            const isPlaceholderTeam = isPlaceholderParticipantTeam(team);
            return renderParticipantTeamCard({
              cardKey: team.$id,
              team,
              className: isPlaceholderTeam ? '!bg-gray-100' : '',
              enableDetailsView: !isPlaceholderTeam,
              fullWidth: true,
              actions: isEditingEvent && canManageEvent && !isPlaceholderTeam
                ? (
                  participantsUpdatingTeamId === team.$id
                    ? <Text size="xs" c="dimmed">Updating...</Text>
                    : (
                      <Stack gap={6} align="flex-start">
                        {renderEditBillingActions(team)}
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onRemoveTeamFromParticipants(team);
                          }}
                        >
                          Remove
                        </Button>
                      </Stack>
                    )
                )
                : undefined,
            });
          })}
        </ResponsiveCardGrid>
      )}
    </Stack>
  );
}
