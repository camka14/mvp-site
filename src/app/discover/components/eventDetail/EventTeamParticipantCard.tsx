import Image from 'next/image';
import { Alert, Button, Text } from '@mantine/core';

import TeamRegistrationFlow from '@/components/ui/TeamRegistrationFlow';
import { resolveDivisionDisplayName } from '@/lib/divisionDisplay';
import type { Event, Team, UserData } from '@/types';
import { getTeamAvatarUrl } from '@/types';

import { getOrganizationName } from './eventDetailPresentation';

type EventTeamParticipantCardProps = {
    event: Event;
    team: Team;
    user?: UserData | null;
    divisionNameIndex: Map<string, string>;
    onRequireAuth: () => void;
    onReload: () => Promise<unknown> | unknown;
    onNotice: (message: string) => void;
};

export function EventTeamParticipantCard({
    event,
    team,
    user,
    divisionNameIndex,
    onRequireAuth,
    onReload,
    onNotice,
}: EventTeamParticipantCardProps) {
    const organizationName = getOrganizationName(event.organization) ?? event.location ?? 'Event';
    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? null;
    const divisionLabel = resolveDivisionDisplayName({
        division: team.division,
        divisionNameIndex,
        sportInput,
    }) ?? 'Division';
    const divisionSuffix = /\bdivision\b/i.test(divisionLabel) ? '' : ' Division';

    return (
        <TeamRegistrationFlow
            team={team}
            user={user}
            paymentSummary={{
                name: team.name || 'Team',
                location: organizationName,
                eventType: event.eventType,
                price: Math.max(0, Math.round(Number(team.registrationPriceCents ?? 0))),
            }}
            organization={{
                $id: event.organizationId ?? undefined,
                name: organizationName,
            }}
            onRequireAuth={onRequireAuth}
            onTeamUpdated={() => {
                void onReload();
            }}
            onCompleted={async () => {
                onNotice(`You joined ${team.name || 'this team'}.`);
                await onReload();
            }}
        >
            {(flow) => (
                <div className="space-y-2 rounded-lg p-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                        <Image
                            src={getTeamAvatarUrl(team, 40)}
                            alt={team.name || 'Team'}
                            width={40}
                            height={40}
                            unoptimized
                            className="h-10 w-10 rounded-full object-cover"
                        />
                        <div className="flex-1">
                            <div className="font-medium text-gray-900">{team.name || 'Unnamed Team'}</div>
                            <div className="text-sm text-gray-500">
                                {team.currentSize} members &bull; {divisionLabel}{divisionSuffix}
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">Team</div>
                    </div>
                    {flow.registrationError ? (
                        <Alert color="red" variant="light" py="xs">
                            <Text size="xs">{flow.registrationError}</Text>
                        </Alert>
                    ) : null}
                    {flow.currentUserActiveMember && !flow.shouldOfferDocumentReview ? (
                        <Text size="xs" c="green" fw={600}>
                            Already on this team
                        </Text>
                    ) : null}
                    {flow.actionVisible ? (
                        <Button
                            size="xs"
                            fullWidth
                            loading={flow.actionLoading}
                            disabled={flow.actionDisabled}
                            onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                flow.openFlow();
                            }}
                        >
                            {flow.actionLabel}
                        </Button>
                    ) : null}
                </div>
            )}
        </TeamRegistrationFlow>
    );
}
