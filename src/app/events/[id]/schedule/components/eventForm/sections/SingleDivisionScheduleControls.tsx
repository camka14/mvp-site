import type { ComponentProps } from 'react';

import LeagueFields from '@/app/discover/components/LeagueFields';
import TournamentFields from '@/app/discover/components/TournamentFields';
import type {
    DivisionCompetitionPhase,
    DivisionPhaseSettings,
    DivisionPhaseSettingsMap,
    Event,
    EventOfficialPosition,
    LeagueConfig,
    MatchRulesConfig,
    Sport,
    TournamentConfig,
} from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import { DIVISION_FULL_WIDTH_CLASS } from '../divisionLayout';
import { SingleDivisionPoolControls } from './SingleDivisionPoolControls';
import { DivisionPhaseConfigurationControls } from './DivisionPhaseRulesEditor';

type SingleDivisionScheduleControlsProps = {
    singleDivision: boolean;
    eventType: Event['eventType'];
    includePlayoffs: boolean;
    splitLeaguePlayoffDivisions?: boolean | null;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    tournamentData: TournamentConfig;
    sport?: Sport;
    phaseSettings: DivisionPhaseSettingsMap;
    eventMatchRulesOverride?: MatchRulesConfig | null;
    officialPositions?: EventOfficialPosition[];
    autoCreatePointMatchIncidents?: boolean;
    participantCount?: number;
    poolDefaults: ComponentProps<typeof SingleDivisionPoolControls>['defaults'];
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof SingleDivisionPoolControls>['numberInputStyles'];
    disabled: boolean;
    playoffTeamCountError?: string;
    onLeagueDataChange: NonNullable<ComponentProps<typeof LeagueFields>['onLeagueDataChange']>;
    onPlayoffDataChange: ComponentProps<typeof TournamentFields>['setTournamentData'];
    onTournamentDataChange: ComponentProps<typeof TournamentFields>['setTournamentData'];
    onPoolDefaultsChange: ComponentProps<typeof SingleDivisionPoolControls>['onChange'];
    onPhaseSettingsChange: (phase: DivisionCompetitionPhase, settings: DivisionPhaseSettings) => void;
};

const emptySlots: ComponentProps<typeof LeagueFields>['slots'] = [];
const emptyFields: ComponentProps<typeof LeagueFields>['fields'] = [];
const noop = () => undefined;

export const SingleDivisionScheduleControls = ({
    singleDivision,
    eventType,
    includePlayoffs,
    splitLeaguePlayoffDivisions,
    leagueData,
    playoffData,
    tournamentData,
    sport,
    phaseSettings,
    eventMatchRulesOverride,
    officialPositions,
    autoCreatePointMatchIncidents,
    participantCount,
    poolDefaults,
    maxStandardNumber,
    numberInputStyles,
    disabled,
    playoffTeamCountError,
    onLeagueDataChange,
    onPlayoffDataChange,
    onTournamentDataChange,
    onPoolDefaultsChange,
    onPhaseSettingsChange,
}: SingleDivisionScheduleControlsProps) => (
    <>
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'LEAGUE'}
            className={DIVISION_FULL_WIDTH_CLASS}
        >
            <LeagueFields
                leagueData={leagueData}
                sport={sport}
                participantCount={participantCount}
                onLeagueDataChange={onLeagueDataChange}
                slots={emptySlots}
                onAddSlot={noop}
                onUpdateSlot={noop}
                onRemoveSlot={noop}
                fields={emptyFields}
                fieldsLoading={false}
                showPlayoffSettings={false}
                showTimeslots={false}
                unstyled
            />
            <DivisionPhaseConfigurationControls
                phase="LEAGUE"
                divisionName="Single division"
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
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'LEAGUE' && includePlayoffs && !splitLeaguePlayoffDivisions}
            className={DIVISION_FULL_WIDTH_CLASS}
        >
            <TournamentFields
                title="Playoff Configuration"
                tournamentData={playoffData}
                setTournamentData={onPlayoffDataChange}
                sport={sport}
                unstyled
            />
            <DivisionPhaseConfigurationControls
                phase="PLAYOFF"
                divisionName="Single division"
                phaseSettings={phaseSettings}
                sport={sport}
                eventMatchRulesOverride={eventMatchRulesOverride}
                officialPositions={officialPositions}
                autoCreatePointMatchIncidents={autoCreatePointMatchIncidents}
                usesSets={Boolean(playoffData.usesSets)}
                winnerSetCount={playoffData.winnerSetCount}
                configuredMatchDurationMinutes={playoffData.matchDurationMinutes}
                disabled={disabled}
                onChange={onPhaseSettingsChange}
                onCalculatedDurationChange={(matchDurationMinutes) => onPlayoffDataChange((previous) => ({
                    ...previous,
                    matchDurationMinutes,
                }))}
            />
        </AnimatedLayoutSection>
        <SingleDivisionPoolControls
            visible={singleDivision && eventType === 'TOURNAMENT' && includePlayoffs}
            defaults={poolDefaults}
            maxStandardNumber={maxStandardNumber}
            numberInputStyles={numberInputStyles}
            disabled={disabled}
            playoffTeamCountError={playoffTeamCountError}
            onChange={onPoolDefaultsChange}
        />
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'TOURNAMENT' && includePlayoffs}
            className={DIVISION_FULL_WIDTH_CLASS}
        >
            <LeagueFields
                configurationTitle="Pool Configuration"
                leagueData={leagueData}
                sport={sport}
                participantCount={participantCount}
                onLeagueDataChange={onLeagueDataChange}
                slots={emptySlots}
                onAddSlot={noop}
                onUpdateSlot={noop}
                onRemoveSlot={noop}
                fields={emptyFields}
                fieldsLoading={false}
                showPlayoffSettings={false}
                showTimeslots={false}
                unstyled
            />
            <DivisionPhaseConfigurationControls
                phase="POOL"
                divisionName="Single division"
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
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'TOURNAMENT'}
            className={DIVISION_FULL_WIDTH_CLASS}
        >
            <TournamentFields
                title={includePlayoffs ? 'Bracket Configuration' : 'Tournament Configuration'}
                tournamentData={tournamentData}
                setTournamentData={onTournamentDataChange}
                sport={sport}
                unstyled
            />
            <DivisionPhaseConfigurationControls
                phase="BRACKET"
                divisionName="Single division"
                phaseSettings={phaseSettings}
                sport={sport}
                eventMatchRulesOverride={eventMatchRulesOverride}
                officialPositions={officialPositions}
                autoCreatePointMatchIncidents={autoCreatePointMatchIncidents}
                usesSets={Boolean(tournamentData.usesSets)}
                winnerSetCount={tournamentData.winnerSetCount}
                configuredMatchDurationMinutes={tournamentData.matchDurationMinutes}
                disabled={disabled}
                onChange={onPhaseSettingsChange}
                onCalculatedDurationChange={(matchDurationMinutes) => onTournamentDataChange((previous) => ({
                    ...previous,
                    matchDurationMinutes,
                }))}
            />
        </AnimatedLayoutSection>
    </>
);
