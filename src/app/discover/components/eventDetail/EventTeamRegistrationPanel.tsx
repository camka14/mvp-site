import type { ReactNode } from 'react';
import { Alert, Button, Paper, Select as MantineSelect, Text } from '@mantine/core';

import type { Team } from '@/types';
import { formatPrice } from '@/types';

type EventTeamRegistrationPanelProps = {
    eventHasStarted: boolean;
    selectedWeeklySession: boolean;
    showTeamJoinOptions: boolean;
    isLoadingTeams: boolean;
    userTeams: Team[];
    selectedTeamId: string;
    showTeamWaitlistActions: boolean;
    joining: boolean;
    weeklySelectionRequired: boolean;
    selectedTeamIsWaitlisted: boolean;
    isDivisionSelectionMissing: boolean;
    selectedTeamIsRegistered: boolean;
    confirmingPurchase: boolean;
    isFreeForUser: boolean;
    priceCents: number;
    selectedTeamPaymentFailed: boolean;
    selfRegistrationBlockedReason: string | null;
    isMinor: boolean;
    isUserFreeAgent: boolean;
    freeAgentJoinBlockedReason: string | null;
    childRegistrationPanel: ReactNode;
    canShowScheduleButton: boolean;
    hostManageQrActions: ReactNode;
    renderInline: boolean;
    isTournament: boolean;
    sportName?: string;
    totalParticipants: number;
    participantCapacity: number;
    comboboxProps: React.ComponentProps<typeof MantineSelect>['comboboxProps'];
    onToggleTeamOptions: () => void;
    onSelectedTeamChange: (teamId: string) => void;
    onManageTeams: () => void;
    onJoinTeamWaitlist: () => void;
    onJoinAsTeam: () => void;
    onWithdrawTeam: () => void;
    onLeaveFreeAgents: () => void;
    onJoinFreeAgents: () => void;
    onViewBracket: () => void;
};

export function EventTeamRegistrationPanel({
    eventHasStarted,
    selectedWeeklySession,
    showTeamJoinOptions,
    isLoadingTeams,
    userTeams,
    selectedTeamId,
    showTeamWaitlistActions,
    joining,
    weeklySelectionRequired,
    selectedTeamIsWaitlisted,
    isDivisionSelectionMissing,
    selectedTeamIsRegistered,
    confirmingPurchase,
    isFreeForUser,
    priceCents,
    selectedTeamPaymentFailed,
    selfRegistrationBlockedReason,
    isMinor,
    isUserFreeAgent,
    freeAgentJoinBlockedReason,
    childRegistrationPanel,
    canShowScheduleButton,
    hostManageQrActions,
    renderInline,
    isTournament,
    sportName,
    totalParticipants,
    participantCapacity,
    comboboxProps,
    onToggleTeamOptions,
    onSelectedTeamChange,
    onManageTeams,
    onJoinTeamWaitlist,
    onJoinAsTeam,
    onWithdrawTeam,
    onLeaveFreeAgents,
    onJoinFreeAgents,
    onViewBracket,
}: EventTeamRegistrationPanelProps) {
    return (
        <div className="space-y-6">
            {eventHasStarted ? (
                <Alert color="yellow" variant="light">
                    {selectedWeeklySession
                        ? 'This weekly session has already started. Joining and leaving are no longer available.'
                        : 'This event has already started. Joining and leaving are no longer available.'}
                </Alert>
            ) : null}
            <Button fullWidth disabled={eventHasStarted} onClick={onToggleTeamOptions}>
                {showTeamJoinOptions ? 'Hide Team Options' : 'View Team Options'}
            </Button>

            {showTeamJoinOptions ? (
                <Paper withBorder p="md" radius="md" className="space-y-4">
                    {isLoadingTeams ? (
                        <div className="text-sm text-gray-600">Loading your teams...</div>
                    ) : userTeams.length > 0 ? (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Select your team
                                </label>
                                <MantineSelect
                                    placeholder="Choose a team"
                                    data={userTeams.map((team) => ({
                                        value: team.$id,
                                        label: team.name || 'Team',
                                    }))}
                                    value={selectedTeamId}
                                    onChange={(value) => onSelectedTeamChange(value || '')}
                                    searchable
                                    comboboxProps={comboboxProps}
                                />
                            </div>

                            <div className="flex justify-center">
                                <Button variant="default" onClick={onManageTeams}>
                                    Manage Teams
                                </Button>
                            </div>

                            <div className="flex flex-col items-center gap-2 pt-2">
                                {showTeamWaitlistActions ? (
                                    <Button
                                        onClick={onJoinTeamWaitlist}
                                        disabled={
                                            joining
                                            || eventHasStarted
                                            || weeklySelectionRequired
                                            || !selectedTeamId
                                            || (!selectedTeamIsWaitlisted && isDivisionSelectionMissing)
                                        }
                                        color="orange"
                                    >
                                        {eventHasStarted
                                            ? 'Unavailable'
                                            : joining
                                                ? 'Updating...'
                                                : (selectedTeamIsWaitlisted
                                                    ? 'Leave Waitlist'
                                                    : 'Join Waitlist')}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={onJoinAsTeam}
                                        disabled={
                                            joining
                                            || eventHasStarted
                                            || weeklySelectionRequired
                                            || !selectedTeamId
                                            || confirmingPurchase
                                            || isDivisionSelectionMissing
                                            || selectedTeamIsRegistered
                                        }
                                        color={selectedTeamIsRegistered ? 'gray' : 'green'}
                                    >
                                        {eventHasStarted
                                            ? 'Unavailable'
                                            : selectedTeamIsRegistered
                                                ? 'Already in Event'
                                                : confirmingPurchase
                                                    ? 'Confirming purchase...'
                                                    : joining
                                                        ? 'Joining...'
                                                        : !selectedTeamId
                                                            ? 'Choose a team'
                                                            : (!isFreeForUser && priceCents > 0)
                                                                ? (selectedTeamPaymentFailed
                                                                    ? 'Complete payment'
                                                                    : `Join for ${formatPrice(priceCents)}`)
                                                                : 'Join Event'}
                                    </Button>
                                )}
                                {selectedTeamIsRegistered ? (
                                    <Button
                                        onClick={onWithdrawTeam}
                                        disabled={
                                            joining
                                            || eventHasStarted
                                            || weeklySelectionRequired
                                            || !selectedTeamId
                                        }
                                        color={!isFreeForUser && priceCents > 0 ? 'orange' : 'red'}
                                        variant="light"
                                    >
                                        {joining ? 'Withdrawing...' : 'Withdraw Team'}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 text-center">
                            <p className="text-sm text-gray-600">
                                You have no managed teams{sportName ? ` for ${sportName}` : ''}.
                            </p>
                            <Button variant="default" onClick={onManageTeams}>
                                Create Team
                            </Button>
                            <div className="text-center">
                                <Text size="sm" c="dimmed">
                                    {totalParticipants} / {participantCapacity} total participants
                                </Text>
                            </div>
                        </div>
                    )}
                </Paper>
            ) : null}

            {!selfRegistrationBlockedReason && isMinor ? (
                <Alert color="blue" variant="light">
                    Tap Send to request parent/guardian approval before joining as a free agent.
                </Alert>
            ) : null}
            {isUserFreeAgent ? (
                <div className="space-y-2">
                    <div className="w-full rounded-lg bg-purple-50 px-4 py-2 text-center font-medium text-purple-700">
                        You are listed as a free agent
                    </div>
                    <button
                        type="button"
                        onClick={onLeaveFreeAgents}
                        disabled={joining || eventHasStarted}
                        className={`w-full rounded-lg px-4 py-2 font-medium text-white transition-colors ${
                            joining || eventHasStarted
                                ? 'cursor-not-allowed bg-gray-400'
                                : 'bg-red-600 hover:bg-red-700'
                        }`}
                    >
                        {eventHasStarted
                            ? 'Unavailable'
                            : (joining ? 'Updating…' : 'Leave Free Agent List')}
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={onJoinFreeAgents}
                    disabled={joining || Boolean(freeAgentJoinBlockedReason)}
                    className={`w-full rounded-lg px-4 py-2 font-medium text-white transition-colors ${
                        joining || freeAgentJoinBlockedReason
                            ? 'cursor-not-allowed bg-gray-400'
                            : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                >
                    {joining
                        ? (isMinor ? 'Sending…' : 'Adding…')
                        : freeAgentJoinBlockedReason
                            ? 'Unavailable'
                            : isMinor
                                ? 'Send'
                                : 'Join as Free Agent (Free)'}
                </button>
            )}

            {childRegistrationPanel}

            {canShowScheduleButton ? (
                <div className="mt-2">{hostManageQrActions}</div>
            ) : null}

            {!renderInline && isTournament ? (
                <button
                    type="button"
                    onClick={onViewBracket}
                    className="mt-2 w-full rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                    View Tournament Bracket
                </button>
            ) : null}
        </div>
    );
}
