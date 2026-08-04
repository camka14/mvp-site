import type { Dispatch, SetStateAction } from 'react';
import {
    NumberInput,
    TextInput,
} from '@mantine/core';
import { motion } from 'motion/react';

import TournamentFields from '@/app/discover/components/TournamentFields';
import type {
    DivisionPhaseSettings,
    DivisionPhaseSettingsMap,
    EventOfficialPosition,
    MatchRulesConfig,
    Sport,
    TournamentConfig,
} from '@/types';

import { AnimatedSection } from '../components/AnimatedSection';
import { DIVISION_LAYOUT_TRANSITION } from '../constants';
import {
    DIVISION_FIELD_ROW_CLASS,
    DIVISION_FULL_WIDTH_CLASS,
    DIVISION_NAME_FIELD_CLASS,
    DIVISION_NUMBER_FIELD_CLASS,
} from '../divisionLayout';
import { DivisionPhaseConfigurationControls } from './DivisionPhaseRulesEditor';

type DivisionEditorPlayoffDivisionControlsProps = {
    visible: boolean;
    name: string;
    maxParticipants?: number | null;
    teamSignup: boolean;
    playoffConfig: TournamentConfig;
    phaseSettings: DivisionPhaseSettingsMap;
    eventMatchRulesOverride?: MatchRulesConfig | null;
    officialPositions?: EventOfficialPosition[];
    autoCreatePointMatchIncidents?: boolean;
    sport?: Sport;
    maxStandardNumber: number;
    maxMediumTextLength: number;
    disabled: boolean;
    onNameChange: (value: string) => void;
    onMaxParticipantsChange: (value: string | number) => void;
    onPlayoffConfigChange: Dispatch<SetStateAction<TournamentConfig>>;
    onPhaseSettingsChange: (settings: DivisionPhaseSettings) => void;
};

export const DivisionEditorPlayoffDivisionControls = ({
    visible,
    name,
    maxParticipants,
    teamSignup,
    playoffConfig,
    phaseSettings,
    eventMatchRulesOverride,
    officialPositions,
    autoCreatePointMatchIncidents,
    sport,
    maxStandardNumber,
    maxMediumTextLength,
    disabled,
    onNameChange,
    onMaxParticipantsChange,
    onPlayoffConfigChange,
    onPhaseSettingsChange,
}: DivisionEditorPlayoffDivisionControlsProps) => (
    <AnimatedSection in={visible}>
        <motion.div
            layout
            className={DIVISION_FIELD_ROW_CLASS}
            transition={DIVISION_LAYOUT_TRANSITION}
        >
            <TextInput
                label="Playoff Division Name"
                placeholder="Division display name"
                value={name}
                className={DIVISION_NAME_FIELD_CLASS}
                maxLength={maxMediumTextLength}
                disabled={disabled}
                onChange={(event) => onNameChange(event.currentTarget.value)}
            />
            <NumberInput
                label={teamSignup ? 'Teams Count' : 'Participants Count'}
                value={maxParticipants ?? ''}
                max={maxStandardNumber}
                clampBehavior="none"
                disabled={disabled}
                className={DIVISION_NUMBER_FIELD_CLASS}
                onChange={onMaxParticipantsChange}
            />
            <div className={DIVISION_FULL_WIDTH_CLASS}>
                <TournamentFields
                    title="Playoff Configuration"
                    tournamentData={playoffConfig}
                    setTournamentData={onPlayoffConfigChange}
                    sport={sport}
                    unstyled
                />
                <DivisionPhaseConfigurationControls
                    phase="PLAYOFF"
                    divisionName={name}
                    phaseSettings={phaseSettings}
                    sport={sport}
                    eventMatchRulesOverride={eventMatchRulesOverride}
                    officialPositions={officialPositions}
                    autoCreatePointMatchIncidents={autoCreatePointMatchIncidents}
                    usesSets={Boolean(playoffConfig.usesSets)}
                    winnerSetCount={playoffConfig.winnerSetCount}
                    configuredMatchDurationMinutes={playoffConfig.matchDurationMinutes}
                    disabled={disabled}
                    onChange={(_phase, settings) => onPhaseSettingsChange(settings)}
                    onCalculatedDurationChange={(matchDurationMinutes) => onPlayoffConfigChange((previous) => ({
                        ...previous,
                        matchDurationMinutes,
                    }))}
                />
            </div>
        </motion.div>
    </AnimatedSection>
);
