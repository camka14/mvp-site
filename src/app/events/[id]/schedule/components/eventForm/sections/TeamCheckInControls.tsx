import {
    NumberInput,
    Select,
    Stack,
    Switch,
} from '@mantine/core';
import {
    Controller,
    type Control,
} from 'react-hook-form';

import type { EventFormValues } from '../formTypes';

type TeamCheckInControlsProps = {
    control: Control<EventFormValues>;
    teamSignup: boolean;
    allowMatchRosterEdits: boolean;
    onRosterEditsChange: (checked: boolean) => void;
};

export const TeamCheckInControls = ({
    control,
    teamSignup,
    allowMatchRosterEdits,
    onRosterEditsChange,
}: TeamCheckInControlsProps) => (
    <Stack gap="sm">
        <Controller
            name="teamCheckInMode"
            control={control}
            render={({ field }) => (
                <Select
                    label="Team check-in"
                    description="Choose whether managers and coaches check in once for the event or separately for each match."
                    data={[
                        { value: 'OFF', label: 'Off' },
                        { value: 'EVENT', label: 'Event check-in' },
                        { value: 'MATCH', label: 'Match check-in' },
                    ]}
                    value={teamSignup ? field.value ?? 'OFF' : 'OFF'}
                    onChange={(value) => field.onChange(value ?? 'OFF')}
                    disabled={!teamSignup}
                />
            )}
        />
        <Controller
            name="teamCheckInOpenMinutesBefore"
            control={control}
            render={({ field }) => (
                <NumberInput
                    label="Check-in opens"
                    description="Minutes before event or match start."
                    min={0}
                    step={5}
                    value={field.value ?? 60}
                    onChange={(value) => {
                        const parsed = typeof value === 'number' ? value : Number(value);
                        field.onChange(Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 60);
                    }}
                    disabled={!teamSignup}
                />
            )}
        />
        <Controller
            name="allowMatchRosterEdits"
            control={control}
            render={({ field }) => (
                <Switch
                    label="Allow match roster edits"
                    description="Managers and coaches can remove players from a match roster before the match starts."
                    checked={teamSignup && Boolean(field.value)}
                    onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        field.onChange(checked);
                        onRosterEditsChange(checked);
                    }}
                    disabled={!teamSignup}
                />
            )}
        />
        <Controller
            name="allowTemporaryMatchPlayers"
            control={control}
            render={({ field }) => (
                <Switch
                    label="Allow temporary match players"
                    description="Managers and coaches can add match-only players with optional account linking."
                    checked={teamSignup && allowMatchRosterEdits && Boolean(field.value)}
                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                    disabled={!teamSignup || !allowMatchRosterEdits}
                />
            )}
        />
    </Stack>
);
