import type { Dispatch, SetStateAction } from 'react';
import {
    NumberInput,
    TextInput,
} from '@mantine/core';
import { motion } from 'motion/react';

import TournamentFields from '@/app/discover/components/TournamentFields';
import type { Sport, TournamentConfig } from '@/types';

import { AnimatedSection } from '../components/AnimatedSection';
import { DIVISION_LAYOUT_TRANSITION } from '../constants';

type DivisionEditorPlayoffDivisionControlsProps = {
    visible: boolean;
    name: string;
    maxParticipants?: number | null;
    teamSignup: boolean;
    playoffConfig: TournamentConfig;
    sport?: Sport;
    maxStandardNumber: number;
    maxMediumTextLength: number;
    disabled: boolean;
    onNameChange: (value: string) => void;
    onMaxParticipantsChange: (value: string | number) => void;
    onPlayoffConfigChange: Dispatch<SetStateAction<TournamentConfig>>;
};

export const DivisionEditorPlayoffDivisionControls = ({
    visible,
    name,
    maxParticipants,
    teamSignup,
    playoffConfig,
    sport,
    maxStandardNumber,
    maxMediumTextLength,
    disabled,
    onNameChange,
    onMaxParticipantsChange,
    onPlayoffConfigChange,
}: DivisionEditorPlayoffDivisionControlsProps) => (
    <AnimatedSection in={visible}>
        <motion.div
            layout
            className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start"
            transition={DIVISION_LAYOUT_TRANSITION}
        >
            <TextInput
                label="Playoff Division Name"
                placeholder="Division display name"
                value={name}
                className="md:col-span-6"
                maw={520}
                maxLength={maxMediumTextLength}
                disabled={disabled}
                onChange={(event) => onNameChange(event.currentTarget.value)}
            />
            <NumberInput
                label={teamSignup ? 'Teams Count' : 'Participants Count'}
                value={maxParticipants ?? ''}
                max={maxStandardNumber}
                maw={220}
                clampBehavior="none"
                disabled={disabled}
                className="md:col-span-3"
                onChange={onMaxParticipantsChange}
            />
            <div className="md:col-span-12">
                <TournamentFields
                    title="Playoff Configuration"
                    tournamentData={playoffConfig}
                    setTournamentData={onPlayoffConfigChange}
                    sport={sport}
                    unstyled
                />
            </div>
        </motion.div>
    </AnimatedSection>
);
