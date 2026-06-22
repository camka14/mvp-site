import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import { NumberInput } from '@mantine/core';

import LeagueFields from '@/app/discover/components/LeagueFields';
import TournamentFields from '@/app/discover/components/TournamentFields';
import type { LeagueConfig, Sport, TournamentConfig } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';

type DivisionEditorLeagueConfigControlsProps = {
    leagueConfigVisible: boolean;
    playoffTeamCountVisible: boolean;
    playoffConfigVisible: boolean;
    leagueData: LeagueConfig;
    sport?: Sport;
    participantCount?: number;
    playoffTeamCount?: number | null;
    playoffConfig: TournamentConfig;
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    disabled: boolean;
    onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
    onPlayoffTeamCountChange: (value: number | null) => void;
    onPlayoffConfigChange: Dispatch<SetStateAction<TournamentConfig>>;
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
    maxStandardNumber,
    numberInputStyles,
    disabled,
    onLeagueDataChange,
    onPlayoffTeamCountChange,
    onPlayoffConfigChange,
}: DivisionEditorLeagueConfigControlsProps) => (
    <>
        <AnimatedLayoutSection in={leagueConfigVisible} className="md:col-span-12">
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
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={playoffTeamCountVisible} className="md:col-span-3">
            <NumberInput
                label="Division Playoff Team Count"
                min={2}
                max={maxStandardNumber}
                w="100%"
                styles={numberInputStyles}
                maw={220}
                value={playoffTeamCount ?? ''}
                clampBehavior="strict"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onPlayoffTeamCountChange(Number.isFinite(numeric)
                        ? Math.max(2, Math.trunc(numeric))
                        : null);
                }}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={playoffConfigVisible} className="md:col-span-12">
            <TournamentFields
                title="Playoff Configuration"
                tournamentData={playoffConfig}
                setTournamentData={onPlayoffConfigChange}
                sport={sport}
                unstyled
            />
        </AnimatedLayoutSection>
    </>
);
