import Image from 'next/image';
import { Button, Collapse, Group, Paper, Progress, Text } from '@mantine/core';

import ParticipantsDropdown from '@/components/ui/ParticipantsDropdown';
import ParticipantsPreview from '@/components/ui/ParticipantsPreview';
import UserCard from '@/components/ui/UserCard';
import type { Team, UserData } from '@/types';
import {
    getTeamAvatarUrl,
    getUserAvatarUrl,
    getUserFullName,
    getUserHandle,
} from '@/types';

export type ParticipantDivisionCapacityRow = {
    id: string;
    label: string;
    filled: number;
    capacity: number;
    spotsLeft: number;
    fillPercent: number;
};

type EventParticipantsSectionProps = {
    isTeamSignup: boolean;
    participantCapacity: number;
    totalParticipants: number;
    freeAgentCount: number;
    waitlistCount: number;
    spotsLeft: number;
    fillPercent: number;
    divisionCapacityRows: ParticipantDivisionCapacityRow[];
    capacityBreakdownOpened: boolean;
    players: UserData[];
    teams: Team[];
    freeAgents: UserData[];
    loading: boolean;
    onToggleCapacityBreakdown: () => void;
    onOpenPlayers: () => void;
    onOpenTeams: () => void;
    onOpenFreeAgents: () => void;
};

export function EventParticipantsSection({
    isTeamSignup,
    participantCapacity,
    totalParticipants,
    freeAgentCount,
    waitlistCount,
    spotsLeft,
    fillPercent,
    divisionCapacityRows,
    capacityBreakdownOpened,
    players,
    teams,
    freeAgents,
    loading,
    onToggleCapacityBreakdown,
    onOpenPlayers,
    onOpenTeams,
    onOpenFreeAgents,
}: EventParticipantsSectionProps) {
    return (
        <>
            <h3 className="mb-4 text-lg font-semibold text-slate-950">Participants</h3>

            <Paper withBorder p="md" radius="md" className="space-y-3 border-slate-200 bg-white shadow-sm">
                <Group justify="space-between" align="flex-start" gap="xs">
                    <div>
                        <Text size="xs" c="dimmed">{isTeamSignup ? 'Teams' : 'Spots'}</Text>
                        <Text fw={600}>
                            {participantCapacity > 0
                                ? `${totalParticipants}/${participantCapacity}`
                                : totalParticipants}
                        </Text>
                    </div>
                    <div>
                        <Text size="xs" c="dimmed">{isTeamSignup ? 'Free Agents' : 'Waitlist'}</Text>
                        <Text fw={600}>{isTeamSignup ? freeAgentCount : waitlistCount}</Text>
                    </div>
                    <div>
                        <Text size="xs" c="dimmed">Left</Text>
                        <Text fw={600}>{participantCapacity > 0 ? spotsLeft : '—'}</Text>
                    </div>
                </Group>
                <Progress value={fillPercent} />
                <Text size="xs" c="dimmed">
                    {participantCapacity > 0
                        ? `${fillPercent}% full • ${spotsLeft} left`
                        : 'No capacity configured'}
                </Text>

                {divisionCapacityRows.length > 0 ? (
                    <>
                        <Button
                            variant="subtle"
                            size="xs"
                            px={0}
                            onClick={onToggleCapacityBreakdown}
                        >
                            {capacityBreakdownOpened ? 'Hide division breakdown' : 'Show division breakdown'}
                        </Button>
                        <Collapse in={capacityBreakdownOpened}>
                            <div className="space-y-2 pt-2">
                                {divisionCapacityRows.map((row) => (
                                    <Paper
                                        key={row.id}
                                        withBorder
                                        p="sm"
                                        radius="md"
                                        className="space-y-2"
                                    >
                                        <Group justify="space-between" align="center" gap="xs">
                                            <Text size="sm" fw={600}>{row.label}</Text>
                                            <Text size="sm" c="dimmed" fw={600}>
                                                {row.capacity > 0
                                                    ? `${row.filled}/${row.capacity}`
                                                    : row.filled}
                                            </Text>
                                        </Group>
                                        <Progress value={row.fillPercent} size="sm" />
                                        <Text size="xs" c="dimmed">
                                            {row.capacity > 0
                                                ? `${row.fillPercent}% full • ${row.spotsLeft} left`
                                                : 'No capacity configured'}
                                        </Text>
                                    </Paper>
                                ))}
                            </div>
                        </Collapse>
                    </>
                ) : null}
            </Paper>

            {!isTeamSignup ? (
                <div className="mb-4">
                    <ParticipantsPreview
                        title="Players"
                        participants={players}
                        totalCount={players.length}
                        isLoading={loading}
                        onClick={onOpenPlayers}
                        getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                        emptyMessage="No players registered yet"
                    />
                </div>
            ) : (
                <>
                    <div className="mb-4">
                        <ParticipantsPreview
                            title="Teams"
                            participants={teams}
                            totalCount={teams.length}
                            isLoading={loading}
                            onClick={onOpenTeams}
                            getAvatarUrl={(participant) => getTeamAvatarUrl(participant as Team, 32)}
                            emptyMessage="No teams registered yet"
                        />
                    </div>
                    <div className="mb-4">
                        <ParticipantsPreview
                            title="Free Agents"
                            participants={freeAgents}
                            totalCount={freeAgentCount}
                            isLoading={loading}
                            onClick={onOpenFreeAgents}
                            getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                            emptyMessage="No free agents yet"
                        />
                    </div>
                </>
            )}
        </>
    );
}

type EventParticipantDropdownsProps = {
    visible: boolean;
    isTeamSignup: boolean;
    playersOpened: boolean;
    teamsOpened: boolean;
    freeAgentsOpened: boolean;
    players: UserData[];
    teams: Team[];
    freeAgents: UserData[];
    loading: boolean;
    renderTeam: (team: Team | UserData) => React.ReactNode;
    onClosePlayers: () => void;
    onCloseTeams: () => void;
    onCloseFreeAgents: () => void;
    onOpenFreeAgentActions: (user: UserData) => void;
};

export function EventParticipantDropdowns({
    visible,
    isTeamSignup,
    playersOpened,
    teamsOpened,
    freeAgentsOpened,
    players,
    teams,
    freeAgents,
    loading,
    renderTeam,
    onClosePlayers,
    onCloseTeams,
    onCloseFreeAgents,
    onOpenFreeAgentActions,
}: EventParticipantDropdownsProps) {
    if (!visible) {
        return null;
    }

    return (
        <>
            {!isTeamSignup ? (
                <ParticipantsDropdown
                    isOpen={playersOpened}
                    onClose={onClosePlayers}
                    title="Event Players"
                    participants={players}
                    isLoading={loading}
                    renderParticipant={(participant) => {
                        const name = getUserFullName(participant as UserData);
                        const handle = getUserHandle(participant as UserData);
                        return (
                            <div className="flex items-center space-x-3 rounded-lg p-3 hover:bg-gray-50">
                                <Image
                                    src={getUserAvatarUrl(participant as UserData, 40)}
                                    alt={name}
                                    width={40}
                                    height={40}
                                    unoptimized
                                    className="h-10 w-10 rounded-full object-cover"
                                />
                                <div>
                                    <div className="font-medium text-gray-900">{name}</div>
                                    {handle ? <div className="text-sm text-gray-500">{handle}</div> : null}
                                </div>
                            </div>
                        );
                    }}
                    emptyMessage="No players have joined this event yet."
                />
            ) : (
                <>
                    <ParticipantsDropdown
                        isOpen={teamsOpened}
                        onClose={onCloseTeams}
                        title="Event Teams"
                        participants={teams}
                        isLoading={loading}
                        renderParticipant={renderTeam}
                        emptyMessage="No teams have registered for this event yet."
                    />
                    <ParticipantsDropdown
                        isOpen={freeAgentsOpened}
                        onClose={onCloseFreeAgents}
                        title="Free Agents"
                        participants={freeAgents}
                        isLoading={loading}
                        renderParticipant={(participant) => (
                            <div className="p-1">
                                <UserCard
                                    user={participant as UserData}
                                    onClick={() => onOpenFreeAgentActions(participant as UserData)}
                                />
                            </div>
                        )}
                        emptyMessage="No free agents have listed for this event yet."
                    />
                </>
            )}
        </>
    );
}
