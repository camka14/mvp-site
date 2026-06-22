import {
    Alert,
    Badge,
    Button,
    Group,
    Paper,
    Stack,
    Text,
} from '@mantine/core';

import ResponsiveCardGrid from '@/components/ui/ResponsiveCardGrid';
import type { Event, TournamentConfig } from '@/types';
import { formatBillAmount, formatPrice } from '@/types';

import {
    type DivisionDetailForm,
    formatPlayoffDivisionParticipantCount,
    normalizePlacementDivisionIds,
    type PlayoffDivisionDetailForm,
} from '../divisionForm';

type DivisionSummaryListProps = {
    divisionDetails?: DivisionDetailForm[];
    playoffDivisionDetails?: PlayoffDivisionDetailForm[];
    singleDivision: boolean;
    teamSignup: boolean;
    eventType: Event['eventType'];
    includePlayoffs: boolean;
    splitDivisionEditorEnabled: boolean;
    eventPrice: number;
    eventMaxParticipants?: number | null;
    eventAllowPaymentPlans: boolean;
    eventInstallmentCount?: number | null;
    eventInstallmentAmounts?: number[];
    leaguePlayoffTeamCount?: number | null;
    disabled: boolean;
    playoffDivisionCapacityWarnings: string[];
    derivePoolTeamCount: (maxTeams?: number | null, poolCount?: number | null) => number | undefined;
    buildTournamentConfig: (source?: Partial<TournamentConfig>) => TournamentConfig;
    onEditDivision: (divisionId: string) => void;
    onRemoveDivision: (divisionId: string) => void;
    onEditPlayoffDivision: (divisionId: string) => void;
    onRemovePlayoffDivision: (divisionId: string) => void;
};

export const DivisionSummaryList = ({
    divisionDetails = [],
    playoffDivisionDetails = [],
    singleDivision,
    teamSignup,
    eventType,
    includePlayoffs,
    splitDivisionEditorEnabled,
    eventPrice,
    eventMaxParticipants,
    eventAllowPaymentPlans,
    eventInstallmentCount,
    eventInstallmentAmounts = [],
    leaguePlayoffTeamCount,
    disabled,
    playoffDivisionCapacityWarnings,
    derivePoolTeamCount,
    buildTournamentConfig,
    onEditDivision,
    onRemoveDivision,
    onEditPlayoffDivision,
    onRemovePlayoffDivision,
}: DivisionSummaryListProps) => {
    const hasNoDivisions = divisionDetails.length === 0
        && (!splitDivisionEditorEnabled || playoffDivisionDetails.length === 0);

    return (
        <div className="space-y-3">
            <Text size="sm" fw={600}>Divisions</Text>
            {hasNoDivisions ? (
                <Text size="sm" c="dimmed">
                    No divisions added yet.
                </Text>
            ) : (
                <ResponsiveCardGrid maxCardWidth={300}>
                    {divisionDetails.map((detail) => {
                        const effectiveDivisionPrice = singleDivision
                            ? Math.max(0, eventPrice || 0)
                            : Math.max(0, detail.price || 0);
                        const effectiveDivisionCapacity = singleDivision
                            ? Math.max(2, Math.trunc(eventMaxParticipants || 2))
                            : Math.max(2, Math.trunc(detail.maxParticipants || eventMaxParticipants || 2));
                        const effectiveDivisionPlayoffTeamCount = eventType === 'TOURNAMENT'
                            ? (typeof detail.playoffTeamCount === 'number'
                                ? Math.max(2, Math.trunc(detail.playoffTeamCount))
                                : undefined)
                            : singleDivision
                                ? (typeof leaguePlayoffTeamCount === 'number'
                                    ? Math.max(2, Math.trunc(leaguePlayoffTeamCount))
                                    : undefined)
                                : (typeof detail.playoffTeamCount === 'number'
                                    ? Math.max(2, Math.trunc(detail.playoffTeamCount))
                                    : undefined);
                        const effectivePoolCount = typeof detail.poolCount === 'number'
                            ? Math.max(1, Math.trunc(detail.poolCount))
                            : undefined;
                        const effectivePoolTeamCount = detail.poolTeamCount
                            ?? derivePoolTeamCount(effectiveDivisionCapacity, effectivePoolCount);
                        const effectiveDivisionAllowPaymentPlans = singleDivision
                            ? Boolean(eventAllowPaymentPlans)
                            : Boolean(detail.allowPaymentPlans);
                        const effectiveDivisionInstallmentAmounts = effectiveDivisionAllowPaymentPlans
                            ? (
                                singleDivision
                                    ? eventInstallmentAmounts
                                    : (detail.installmentAmounts || [])
                            ).map((value) => Math.max(0, Number(value) || 0))
                            : [];
                        const effectiveDivisionInstallmentCount = effectiveDivisionAllowPaymentPlans
                            ? (
                                singleDivision
                                    ? (eventInstallmentCount || effectiveDivisionInstallmentAmounts.length || 0)
                                    : (detail.installmentCount || effectiveDivisionInstallmentAmounts.length || 0)
                            )
                            : 0;
                        const divisionTypeSummary = [
                            detail.skillDivisionTypeName,
                            detail.ageDivisionTypeName,
                        ]
                            .map((part) => String(part ?? '').trim())
                            .filter(Boolean)
                            .join(' ')
                            || detail.divisionTypeName
                            || 'Open 18+';
                        const mappedPlacementCount = normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds)
                            .filter(Boolean)
                            .length;

                        return (
                            <Paper key={detail.id} withBorder radius={0} p="sm" className="bg-white">
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                                            <Text fw={700} size="sm" lineClamp={2}>{detail.name}</Text>
                                            <Badge size="sm" radius="sm" variant="light">League</Badge>
                                        </Group>
                                        <Text size="xs" c="dimmed">Division Type: League</Text>
                                        <Text size="xs" c="dimmed">{divisionTypeSummary}</Text>
                                        <Text size="xs" c="dimmed">
                                            {`Price: ${formatPrice(effectiveDivisionPrice)} • ${teamSignup ? 'Max teams' : 'Max participants'}: ${effectiveDivisionCapacity}`}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {effectiveDivisionAllowPaymentPlans
                                                ? `Payment plan: ${effectiveDivisionInstallmentCount || effectiveDivisionInstallmentAmounts.length || 0} installment(s) totaling ${formatBillAmount(effectiveDivisionInstallmentAmounts.reduce((sum, value) => sum + (Number(value) || 0), 0))}`
                                                : 'Payment plan: disabled'}
                                        </Text>
                                        {eventType === 'LEAGUE' && includePlayoffs ? (
                                            <Text size="xs" c="dimmed">
                                                {`Playoff teams: ${effectiveDivisionPlayoffTeamCount ?? 'Not set'}`}
                                            </Text>
                                        ) : null}
                                        {splitDivisionEditorEnabled && typeof effectiveDivisionPlayoffTeamCount === 'number' ? (
                                            <Text size="xs" c="dimmed">
                                                {`Mapped placements: ${mappedPlacementCount}/${effectiveDivisionPlayoffTeamCount}`}
                                            </Text>
                                        ) : null}
                                        {eventType === 'TOURNAMENT' && includePlayoffs ? (
                                            <Text size="xs" c="dimmed">
                                                {`Bracket teams: ${effectiveDivisionPlayoffTeamCount ?? 'Not set'} - Pools: ${effectivePoolCount ?? 'Not set'} - Pool teams: ${effectivePoolTeamCount ?? 'Not set'}`}
                                            </Text>
                                        ) : null}
                                        {detail.ageCutoffLabel ? (
                                            <Text size="xs" c="dimmed">
                                                {detail.ageCutoffLabel}
                                            </Text>
                                        ) : null}
                                    </div>
                                    <Group gap="xs" justify="flex-end">
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            onClick={() => onEditDivision(detail.id)}
                                            disabled={disabled}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            color="red"
                                            onClick={() => onRemoveDivision(detail.id)}
                                            disabled={disabled}
                                        >
                                            Remove
                                        </Button>
                                    </Group>
                                </div>
                            </Paper>
                        );
                    })}
                    {splitDivisionEditorEnabled
                        ? playoffDivisionDetails.map((playoffDivision) => {
                            const playoffConfig = buildTournamentConfig(playoffDivision.playoffConfig);
                            return (
                                <Paper key={playoffDivision.id} withBorder radius={0} p="sm" className="bg-white">
                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                                                <Text fw={700} size="sm" lineClamp={2}>{playoffDivision.name}</Text>
                                                <Badge size="sm" radius="sm" variant="light" color="grape">Playoff</Badge>
                                            </Group>
                                            <Text size="xs" c="dimmed">Division Type: Playoff</Text>
                                            <Text size="xs" c="dimmed">
                                                {`${teamSignup ? 'Teams' : 'Participants'} count: ${formatPlayoffDivisionParticipantCount(playoffDivision.maxParticipants)}`}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {playoffConfig.doubleElimination ? 'Format: Double elimination' : 'Format: Single elimination'}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {`Rest time: ${playoffConfig.restTimeMinutes ?? 0} min`}
                                            </Text>
                                        </div>
                                        <Group gap="xs" justify="flex-end">
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                onClick={() => onEditPlayoffDivision(playoffDivision.id)}
                                                disabled={disabled}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                color="red"
                                                onClick={() => onRemovePlayoffDivision(playoffDivision.id)}
                                                disabled={disabled}
                                            >
                                                Remove
                                            </Button>
                                        </Group>
                                    </div>
                                </Paper>
                            );
                        })
                        : null}
                </ResponsiveCardGrid>
            )}

            {playoffDivisionCapacityWarnings.length > 0 ? (
                <Alert color="yellow" radius="md">
                    <Stack gap={2}>
                        {playoffDivisionCapacityWarnings.map((warning) => (
                            <Text key={warning} size="sm">{warning}</Text>
                        ))}
                    </Stack>
                </Alert>
            ) : null}
        </div>
    );
};
