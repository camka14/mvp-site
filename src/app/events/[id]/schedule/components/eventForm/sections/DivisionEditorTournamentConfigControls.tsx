import type { Dispatch, SetStateAction } from 'react';

import LeagueFields from '@/app/discover/components/LeagueFields';
import TournamentFields from '@/app/discover/components/TournamentFields';
import type { LeagueConfig, Sport, TournamentConfig } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';

type DivisionEditorTournamentConfigControlsProps = {
    poolConfigVisible: boolean;
    tournamentConfigVisible: boolean;
    leagueData: LeagueConfig;
    tournamentData: TournamentConfig;
    sport?: Sport;
    participantCount?: number;
    onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
    onTournamentDataChange: Dispatch<SetStateAction<TournamentConfig>>;
};

export const DivisionEditorTournamentConfigControls = ({
    poolConfigVisible,
    tournamentConfigVisible,
    leagueData,
    tournamentData,
    sport,
    participantCount,
    onLeagueDataChange,
    onTournamentDataChange,
}: DivisionEditorTournamentConfigControlsProps) => (
    <>
        <AnimatedLayoutSection in={poolConfigVisible} className="md:col-span-12">
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
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={tournamentConfigVisible} className="md:col-span-12">
            <TournamentFields
                title="Tournament Configuration"
                tournamentData={tournamentData}
                setTournamentData={onTournamentDataChange}
                sport={sport}
                unstyled
            />
        </AnimatedLayoutSection>
    </>
);
