import { Controller, type Control } from 'react-hook-form';
import { Switch, Text } from '@mantine/core';

import type { Event } from '@/types';

import type { EventFormValues } from '../../EventForm';

type DivisionModeControlsProps = {
    control: Control<EventFormValues>;
    supportsEditableTeamSignup: boolean;
    showsFixedTeamEventToggle: boolean;
    eventType: Event['eventType'];
    singleDivision: boolean;
    leagueIncludesPlayoffs: boolean;
    splitLeaguePlayoffDivisionsLocked: boolean;
    hasExternalRentalField: boolean;
    isImmutableField: (key: keyof Event) => boolean;
};

export const DivisionModeControls = ({
    control,
    supportsEditableTeamSignup,
    showsFixedTeamEventToggle,
    eventType,
    singleDivision,
    leagueIncludesPlayoffs,
    splitLeaguePlayoffDivisionsLocked,
    hasExternalRentalField,
    isImmutableField,
}: DivisionModeControlsProps) => {
    const modeSwitches = (
        <>
            <Controller
                name="singleDivision"
                control={control}
                render={({ field }) => (
                    <Switch
                        label="Single Division (all skill levels play together)"
                        checked={field.value}
                        disabled={isImmutableField('singleDivision')}
                        onChange={(event) => {
                            if (isImmutableField('singleDivision')) return;
                            field.onChange(event?.currentTarget?.checked ?? field.value);
                        }}
                    />
                )}
            />
            <Controller
                name="registrationByDivisionType"
                control={control}
                render={({ field }) => (
                    <Switch
                        label="Register by Division Type"
                        description="When enabled, users pick a division type and are auto-assigned to one matching division."
                        checked={field.value}
                        disabled={isImmutableField('registrationByDivisionType')}
                        onChange={(event) => {
                            if (isImmutableField('registrationByDivisionType')) return;
                            field.onChange(event?.currentTarget?.checked ?? field.value);
                        }}
                    />
                )}
            />
        </>
    );

    if (supportsEditableTeamSignup) {
        return (
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3" data-testid="division-mode-switches">
                {modeSwitches}
            </div>
        );
    }

    if (!showsFixedTeamEventToggle) {
        return null;
    }

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2" data-testid="division-mode-switches">
            {modeSwitches}
            {eventType === 'LEAGUE' ? (
                <Controller
                    name="splitLeaguePlayoffDivisions"
                    control={control}
                    render={({ field }) => (
                        <Switch
                            label="Split League & Playoff Divisions"
                            description={leagueIncludesPlayoffs
                                ? 'Configure league divisions separately from playoff bracket divisions.'
                                : 'Enable playoffs to configure split league/playoff divisions.'}
                            checked={field.value}
                            disabled={
                                splitLeaguePlayoffDivisionsLocked
                                || !leagueIncludesPlayoffs
                                || (singleDivision && !hasExternalRentalField)
                            }
                            onChange={(event) => {
                                if (
                                    splitLeaguePlayoffDivisionsLocked
                                    || (singleDivision && !hasExternalRentalField)
                                ) {
                                    return;
                                }
                                field.onChange(event.currentTarget.checked);
                            }}
                        />
                    )}
                />
            ) : null}
            <Text size="sm" c="dimmed">
                Leagues and tournaments are always team events. When single division is enabled,
                each timeslot is automatically assigned all selected divisions.
            </Text>
        </div>
    );
};
