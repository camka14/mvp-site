import { Switch } from '@mantine/core';
import {
    Controller,
    type Control,
} from 'react-hook-form';

import type { EventFormValues } from '../formTypes';

type TeamOfficiatingControlsProps = {
    control: Control<EventFormValues>;
    doTeamsOfficiate: boolean;
    onTeamsOfficiateChange: (checked: boolean) => void;
};

export const TeamOfficiatingControls = ({
    control,
    doTeamsOfficiate,
    onTeamsOfficiateChange,
}: TeamOfficiatingControlsProps) => (
    <>
        <Controller
            name="doTeamsOfficiate"
            control={control}
            render={({ field }) => (
                <Switch
                    label="Teams provide officials"
                    description="Allow assigning team officials alongside dedicated staff refs."
                    checked={Boolean(field.value)}
                    onChange={(event) => {
                        const checked = event?.currentTarget?.checked ?? false;
                        field.onChange(checked);
                        onTeamsOfficiateChange(checked);
                    }}
                />
            )}
        />
        {doTeamsOfficiate && (
            <Controller
                name="teamOfficialsMaySwap"
                control={control}
                render={({ field }) => (
                    <Switch
                        label="Team officials may swap"
                        description="Allow any participating team to take over officiating a match."
                        checked={Boolean(field.value)}
                        onChange={(event) => field.onChange(event?.currentTarget?.checked ?? false)}
                    />
                )}
            />
        )}
    </>
);
