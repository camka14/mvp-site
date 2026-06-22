import type { ComponentProps } from 'react';

import LeagueFields from '@/app/discover/components/LeagueFields';
import TournamentFields from '@/app/discover/components/TournamentFields';
import type { Event, LeagueConfig, Sport, TournamentConfig } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import { SingleDivisionPoolControls } from './SingleDivisionPoolControls';

type SingleDivisionScheduleControlsProps = {
    singleDivision: boolean;
    eventType: Event['eventType'];
    includePlayoffs: boolean;
    splitLeaguePlayoffDivisions?: boolean | null;
    leagueData: LeagueConfig;
    playoffData: TournamentConfig;
    tournamentData: TournamentConfig;
    sport?: Sport;
    participantCount?: number;
    poolDefaults: ComponentProps<typeof SingleDivisionPoolControls>['defaults'];
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof SingleDivisionPoolControls>['numberInputStyles'];
    disabled: boolean;
    onLeagueDataChange: NonNullable<ComponentProps<typeof LeagueFields>['onLeagueDataChange']>;
    onPlayoffDataChange: ComponentProps<typeof TournamentFields>['setTournamentData'];
    onTournamentDataChange: ComponentProps<typeof TournamentFields>['setTournamentData'];
    onPoolDefaultsChange: ComponentProps<typeof SingleDivisionPoolControls>['onChange'];
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
    participantCount,
    poolDefaults,
    maxStandardNumber,
    numberInputStyles,
    disabled,
    onLeagueDataChange,
    onPlayoffDataChange,
    onTournamentDataChange,
    onPoolDefaultsChange,
}: SingleDivisionScheduleControlsProps) => (
    <>
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'LEAGUE'}
            className="md:col-span-12"
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
        </AnimatedLayoutSection>
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'LEAGUE' && includePlayoffs && !splitLeaguePlayoffDivisions}
            className="md:col-span-12"
        >
            <TournamentFields
                title="Playoff Configuration"
                tournamentData={playoffData}
                setTournamentData={onPlayoffDataChange}
                sport={sport}
                unstyled
            />
        </AnimatedLayoutSection>
        <SingleDivisionPoolControls
            visible={singleDivision && eventType === 'TOURNAMENT' && includePlayoffs}
            defaults={poolDefaults}
            maxStandardNumber={maxStandardNumber}
            numberInputStyles={numberInputStyles}
            disabled={disabled}
            onChange={onPoolDefaultsChange}
        />
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'TOURNAMENT' && includePlayoffs}
            className="md:col-span-12"
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
        </AnimatedLayoutSection>
        <AnimatedLayoutSection
            in={singleDivision && eventType === 'TOURNAMENT'}
            className="md:col-span-12"
        >
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
