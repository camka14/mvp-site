import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import { NumberInput } from '@mantine/core';

import LeagueFields from '@/app/discover/components/LeagueFields';
import TournamentFields from '@/app/discover/components/TournamentFields';
import type {
    DivisionCompetitionPhase,
    DivisionPhaseSettings,
    DivisionPhaseSettingsMap,
    EventOfficialPosition,
    LeagueConfig,
    MatchRulesConfig,
    Sport,
    TournamentConfig,
} from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import {
    DIVISION_FULL_WIDTH_CLASS,
    DIVISION_NUMBER_FIELD_CLASS,
} from '../divisionLayout';
import { BRACKET_TEAM_COUNT_ERROR } from '../divisionMessages';
import { parseOptionalWholeNumber } from '../divisionNumbers';
import { DivisionPhaseConfigurationControls } from './DivisionPhaseRulesEditor';

type DivisionEditorLeagueConfigControlsProps = {
    leagueConfigVisible: boolean;
    playoffTeamCountVisible: boolean;
    playoffConfigVisible: boolean;
    leagueData: LeagueConfig;
    sport?: Sport;
    participantCount?: number;
    playoffTeamCount?: number | null;
    playoffConfig: TournamentConfig;
    divisionName: string;
    phaseSettings: DivisionPhaseSettingsMap;
    eventMatchRulesOverride?: MatchRulesConfig | null;
    officialPositions?: EventOfficialPosition[];
    autoCreatePointMatchIncidents?: boolean;
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    disabled: boolean;
    playoffTeamCountError?: string;
    onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
    onPlayoffTeamCountChange: (value: number | null) => void;
    onPlayoffConfigChange: Dispatch<SetStateAction<TournamentConfig>>;
    onPhaseSettingsChange: (phase: DivisionCompetitionPhase, settings: DivisionPhaseSettings) => void;
};

export const DivisionEditorLeagueConfigControls = ({
    leagueConfigVisible,
    playoffTeamCountVisible,
    playoffConfigVisible,
    leagueData,
    sport,
    participantCount,
    playoffTeamCount,
    playoffConfig,
    divisionName,
    phaseSettings,
    eventMatchRulesOverride,
    officialPositions,
    autoCreatePointMatchIncidents,
    maxStandardNumber,
    numberInputStyles,
    disabled,
    playoffTeamCountError,
    onLeagueDataChange,
    onPlayoffTeamCountChange,
    onPlayoffConfigChange,
    onPhaseSettingsChange,
}: DivisionEditorLeagueConfigControlsProps) => (
    <>
        <AnimatedLayoutSection in={leagueConfigVisible} className={DIVISION_FULL_WIDTH_CLASS}>
            <LeagueFields
                leagueData={leagueData}
                sport={sport}
                participantCount={participantCount}
                onLeagueDataChange={onLeagueDataChange}
                slots={[]}
                onAddSlot={() => undefined}
                onUpdateSlot={() => undefined}
                onRemoveSlot={() => undefined}
                fields={[]}
                fieldsLoading={false}
                showPlayoffSettings={false}
                showTimeslots={false}
                unstyled
            />
            <DivisionPhaseConfigurationControls
                phase="LEAGUE"
                divisionName={divisionName}
                phaseSettings={phaseSettings}
                sport={sport}
                eventMatchRulesOverride={eventMatchRulesOverride}
                officialPositions={officialPositions}
                autoCreatePointMatchIncidents={autoCreatePointMatchIncidents}
                usesSets={Boolean(leagueData.usesSets)}
                setsPerMatch={leagueData.setsPerMatch}
                configuredMatchDurationMinutes={leagueData.matchDurationMinutes}
                disabled={disabled}
                onChange={onPhaseSettingsChange}
                onCalculatedDurationChange={(matchDurationMinutes) => onLeagueDataChange({
                    matchDurationMinutes,
                })}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={playoffTeamCountVisible} className={DIVISION_NUMBER_FIELD_CLASS}>
            <NumberInput
                label="Division Playoff Team Count"
                min={2}
                max={maxStandardNumber}
                w="100%"
                styles={numberInputStyles}
                value={playoffTeamCount ?? ''}
                clampBehavior="none"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    onPlayoffTeamCountChange(parseOptionalWholeNumber(value) ?? null);
                }}
                error={playoffTeamCountError || (
                    typeof playoffTeamCount === 'number' && playoffTeamCount >= 2
                        ? undefined
                        : BRACKET_TEAM_COUNT_ERROR
                )}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={playoffConfigVisible} className={DIVISION_FULL_WIDTH_CLASS}>
            <TournamentFields
                title="Playoff Configuration"
                tournamentData={playoffConfig}
                setTournamentData={onPlayoffConfigChange}
                sport={sport}
                unstyled
            />
            <DivisionPhaseConfigurationControls
                phase="PLAYOFF"
                divisionName={divisionName}
                phaseSettings={phaseSettings}
                sport={sport}
                eventMatchRulesOverride={eventMatchRulesOverride}
                officialPositions={officialPositions}
                autoCreatePointMatchIncidents={autoCreatePointMatchIncidents}
                usesSets={Boolean(playoffConfig.usesSets)}
                winnerSetCount={playoffConfig.winnerSetCount}
                configuredMatchDurationMinutes={playoffConfig.matchDurationMinutes}
                disabled={disabled}
                onChange={onPhaseSettingsChange}
                onCalculatedDurationChange={(matchDurationMinutes) => onPlayoffConfigChange((previous) => ({
                    ...previous,
                    matchDurationMinutes,
                }))}
            />
        </AnimatedLayoutSection>
    </>
);
