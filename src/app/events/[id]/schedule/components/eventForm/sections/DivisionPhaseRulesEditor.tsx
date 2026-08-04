'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Group,
    Modal,
    NumberInput,
    Stack,
    Text,
} from '@mantine/core';

import { calculateTimedMatchDurationMinutes } from '@/lib/divisionPhaseSettings';
import type {
    DivisionCompetitionPhase,
    DivisionPhaseSettings,
    DivisionPhaseSettingsMap,
    MatchRulesConfig,
    Sport,
} from '@/types';

import MatchRulesSection from '../../MatchRulesSection';

const PHASE_LABELS: Record<DivisionCompetitionPhase, string> = {
    LEAGUE: 'League',
    POOL: 'Pool',
    BRACKET: 'Bracket',
    PLAYOFF: 'Playoff',
};

const positiveInt = (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 1) return null;
    return Math.trunc(numeric);
};

const nonNegativeInt = (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return Math.trunc(numeric);
};

const pluralizeSegmentLabel = (label: string): string => {
    const normalized = label.trim();
    if (!normalized) return 'segments';
    if (normalized.toLowerCase() === 'half') return 'halves';
    if (/[^aeiou]y$/i.test(normalized)) return `${normalized.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/i.test(normalized)) return `${normalized}es`;
    return `${normalized}s`;
};

type DivisionPhaseConfigurationControlsProps = {
    phase: DivisionCompetitionPhase;
    divisionName: string;
    phaseSettings?: DivisionPhaseSettingsMap;
    sport?: Sport;
    eventMatchRulesOverride?: MatchRulesConfig | null;
    officialPositions?: Parameters<typeof MatchRulesSection>[0]['officialPositions'];
    autoCreatePointMatchIncidents?: boolean;
    usesSets: boolean;
    setsPerMatch?: number | null;
    winnerSetCount?: number | null;
    configuredMatchDurationMinutes?: number | null;
    disabled?: boolean;
    onChange: (phase: DivisionCompetitionPhase, settings: DivisionPhaseSettings) => void;
    onCalculatedDurationChange?: (durationMinutes: number | null) => void;
};

export const DivisionPhaseConfigurationControls = ({
    phase,
    divisionName,
    phaseSettings,
    sport,
    eventMatchRulesOverride,
    officialPositions,
    autoCreatePointMatchIncidents = false,
    usesSets,
    setsPerMatch,
    winnerSetCount,
    configuredMatchDurationMinutes,
    disabled = false,
    onChange,
    onCalculatedDurationChange,
}: DivisionPhaseConfigurationControlsProps) => {
    const [rulesOpened, setRulesOpened] = useState(false);
    const settings = useMemo(
        () => phaseSettings?.[phase] ?? {},
        [phase, phaseSettings],
    );
    const inheritedRules = useMemo<MatchRulesConfig>(() => ({
        ...(sport?.matchRulesTemplate ?? {}),
        ...(eventMatchRulesOverride ?? {}),
        timekeeping: {
            ...(sport?.matchRulesTemplate?.timekeeping ?? {}),
            ...(eventMatchRulesOverride?.timekeeping ?? {}),
        },
    }), [eventMatchRulesOverride, sport?.matchRulesTemplate]);
    const configuredRules = settings.matchRulesOverride ?? {};
    const segmentLabel = configuredRules.segmentLabel?.trim()
        || inheritedRules.segmentLabel?.trim()
        || 'Segment';
    const segmentCount = usesSets
        ? (setsPerMatch ?? winnerSetCount ?? 1)
        : (configuredRules.segmentCount ?? inheritedRules.segmentCount ?? 1);
    const inheritedSegmentLength = inheritedRules.timekeeping?.segmentDurationMinutes
        ?? (configuredMatchDurationMinutes && segmentCount > 0
            ? Math.max(1, Math.round(configuredMatchDurationMinutes / segmentCount))
            : null);
    const segmentLengthMinutes = settings.segmentLengthMinutes === undefined
        ? inheritedSegmentLength
        : settings.segmentLengthMinutes;
    const segmentBreakMinutes = settings.segmentBreakMinutes === undefined
        ? 0
        : settings.segmentBreakMinutes;
    const calculatedDurationMinutes = usesSets ? null : calculateTimedMatchDurationMinutes({
        segmentCount,
        segmentLengthMinutes,
        segmentBreakMinutes,
    });
    const resolvedSport = useMemo(() => ({
        ...(sport ?? {}),
        matchRulesTemplate: inheritedRules,
    }) as Sport, [inheritedRules, sport]);

    const updateSettings = (next: DivisionPhaseSettings) => {
        onChange(phase, next);
        if (!usesSets) {
            onCalculatedDurationChange?.(calculateTimedMatchDurationMinutes({
                segmentCount: next.matchRulesOverride?.segmentCount ?? inheritedRules.segmentCount ?? 1,
                segmentLengthMinutes: next.segmentLengthMinutes === undefined
                    ? inheritedSegmentLength
                    : next.segmentLengthMinutes,
                segmentBreakMinutes: next.segmentBreakMinutes === undefined
                    ? 0
                    : next.segmentBreakMinutes,
            }));
        }
    };

    useEffect(() => {
        if (
            usesSets
            || calculatedDurationMinutes == null
            || calculatedDurationMinutes === configuredMatchDurationMinutes
        ) return;

        onCalculatedDurationChange?.(calculatedDurationMinutes);
    }, [
        calculatedDurationMinutes,
        configuredMatchDurationMinutes,
        onCalculatedDurationChange,
        usesSets,
    ]);

    return (
        <div className="mt-4 border-t border-gray-200 pt-4">
            <Group align="flex-end" gap="md" wrap="wrap">
                {!usesSets ? (
                    <>
                        <NumberInput
                            className="w-full sm:w-48 sm:flex-none"
                            label={`${segmentLabel} length`}
                            suffix=" min"
                            min={1}
                            value={segmentLengthMinutes ?? ''}
                            disabled={disabled}
                            error={segmentLengthMinutes == null ? 'Enter at least 1 minute.' : undefined}
                            onChange={(value) => updateSettings({
                                ...settings,
                                segmentLengthMinutes: positiveInt(value),
                            })}
                        />
                        <NumberInput
                            className="w-full sm:w-52 sm:flex-none"
                            label={`Break between ${pluralizeSegmentLabel(segmentLabel).toLowerCase()}`}
                            suffix=" min"
                            min={0}
                            value={segmentBreakMinutes ?? ''}
                            disabled={disabled}
                            onChange={(value) => updateSettings({
                                ...settings,
                                segmentBreakMinutes: nonNegativeInt(value),
                            })}
                        />
                        <Text size="sm" c="dimmed" pb={8}>
                            {calculatedDurationMinutes == null
                                ? `Enter a ${segmentLabel.toLowerCase()} length to calculate match duration.`
                                : `Calculated match duration: ${calculatedDurationMinutes} minutes.`}
                        </Text>
                    </>
                ) : null}
                <Button
                    variant="light"
                    disabled={disabled}
                    onClick={() => setRulesOpened(true)}
                >
                    {`${PHASE_LABELS[phase]} rules`}
                </Button>
            </Group>

            <Modal
                opened={rulesOpened}
                onClose={() => setRulesOpened(false)}
                title={`${divisionName.trim() || 'Division'}: ${PHASE_LABELS[phase]} rules`}
                size="xl"
                centered
            >
                <Stack gap="lg">
                    <MatchRulesSection
                        sport={resolvedSport}
                        usesSets={usesSets}
                        setsPerMatch={setsPerMatch ?? undefined}
                        winnerSetCount={winnerSetCount ?? undefined}
                        officialPositions={officialPositions}
                        value={settings.matchRulesOverride ?? null}
                        onChange={(matchRulesOverride) => updateSettings({
                            ...settings,
                            matchRulesOverride,
                        })}
                        autoCreatePointMatchIncidents={settings.autoCreatePointMatchIncidents
                            ?? autoCreatePointMatchIncidents}
                        onAutoCreatePointMatchIncidentsChange={(nextValue) => updateSettings({
                            ...settings,
                            autoCreatePointMatchIncidents: nextValue,
                        })}
                        disabled={disabled}
                        incidentToggleDisabled={disabled}
                        showSegmentCount={!usesSets}
                        comboboxProps={{ withinPortal: true, zIndex: 2200 }}
                    />
                </Stack>
            </Modal>
        </div>
    );
};
