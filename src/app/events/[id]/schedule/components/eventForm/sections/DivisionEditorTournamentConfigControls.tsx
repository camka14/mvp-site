import type { Dispatch, SetStateAction } from 'react';

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
import { DIVISION_FULL_WIDTH_CLASS } from '../divisionLayout';
import { DivisionPhaseConfigurationControls } from './DivisionPhaseRulesEditor';

type DivisionEditorTournamentConfigControlsProps = {
    poolConfigVisible: boolean;
    tournamentConfigVisible: boolean;
    leagueData: LeagueConfig;
    tournamentData: TournamentConfig;
    sport?: Sport;
    participantCount?: number;
    divisionName: string;
    phaseSettings: DivisionPhaseSettingsMap;
    eventMatchRulesOverride?: MatchRulesConfig | null;
    officialPositions?: EventOfficialPosition[];
    autoCreatePointMatchIncidents?: boolean;
    disabled?: boolean;
    onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
    onTournamentDataChange: Dispatch<SetStateAction<TournamentConfig>>;
    onPhaseSettingsChange: (phase: DivisionCompetitionPhase, settings: DivisionPhaseSettings) => void;
};

export const DivisionEditorTournamentConfigControls = ({
    poolConfigVisible,
    tournamentConfigVisible,
    leagueData,
    tournamentData,
    sport,
    participantCount,
    divisionName,
    phaseSettings,
    eventMatchRulesOverride,
    officialPositions,
    autoCreatePointMatchIncidents,
    disabled = false,
    onLeagueDataChange,
    onTournamentDataChange,
    onPhaseSettingsChange,
}: DivisionEditorTournamentConfigControlsProps) => (
    <>
        <AnimatedLayoutSection in={poolConfigVisible} className={DIVISION_FULL_WIDTH_CLASS}>
            <LeagueFields
                configurationTitle="Pool Configuration"
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
                phase="POOL"
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
        <AnimatedLayoutSection in={tournamentConfigVisible} className={DIVISION_FULL_WIDTH_CLASS}>
            <TournamentFields
                title={poolConfigVisible ? 'Bracket Configuration' : 'Tournament Configuration'}
                tournamentData={tournamentData}
                setTournamentData={onTournamentDataChange}
                sport={sport}
                unstyled
            />
            <DivisionPhaseConfigurationControls
                phase="BRACKET"
                divisionName={divisionName}
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
