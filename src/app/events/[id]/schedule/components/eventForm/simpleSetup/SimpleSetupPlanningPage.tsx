'use client';

import { Controller, type Control } from 'react-hook-form';
import {
    Alert,
    Button,
    NumberInput,
    Radio,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';

import type { Event } from '@/types';

import type { EventFormValues } from '../formTypes';
import type {
    EventSetupCapabilities,
    EventSetupChoices,
    EventSetupPageId,
} from './types';

type SimpleSetupPlanningPageProps = {
    pageId: EventSetupPageId;
    control: Control<EventFormValues>;
    eventData: EventFormValues;
    eventTypeOptions: Array<{ value: string; label: string }>;
    capabilities: EventSetupCapabilities;
    choices: EventSetupChoices;
    includePlayoffs: boolean;
    hasStripeAccount: boolean;
    connectingStripe: boolean;
    onChoicesChange: (updates: Partial<EventSetupChoices>) => void;
    onEventTypeChange: (nextType: Event['eventType'], applyValue: (nextType: Event['eventType']) => void) => void;
    onExternalRegistrationChange: (checked: boolean, applyValue: (checked: boolean) => void) => void;
    onSingleDivisionChange: (singleDivision: boolean, applyValue: (singleDivision: boolean) => void) => void;
    onIncludePlayoffsChange: (checked: boolean) => void;
    onIncludePoolPlayChange: (checked: boolean) => void;
    onSplitLeaguePlayoffDivisionsChange: (checked: boolean, applyValue: (checked: boolean) => void) => void;
    onConnectStripe: () => void;
    onRegistrationPaymentModeChange: (mode: 'ONLINE' | 'MANUAL') => void;
    isImmutableField: (key: keyof Event) => boolean;
};

const choiceCardClassName = 'rounded-md border border-gray-200 bg-gray-50 p-4';
const scheduleStyleOptions: Array<{
    value: EventSetupChoices['scheduleStyle'];
    label: string;
    description: string;
}> = [
    {
        value: 'FIXED_WINDOW',
        label: 'Fixed event window',
        description: 'Use one non-repeating timeslot that always matches the event start and end.',
    },
    {
        value: 'WEEKLY_SLOTS',
        label: 'Weekly repeating timeslots',
        description: 'Use the same selected weekdays and times each week during the event.',
    },
    {
        value: 'FIXED_SLOTS',
        label: 'Fixed one-time timeslots',
        description: 'Add individual dates and times that do not repeat.',
    },
    {
        value: 'MIXED_SLOTS',
        label: 'Mixed repeating and fixed timeslots',
        description: 'Combine weekly availability with one-time dates or exceptions.',
    },
];

export const SimpleSetupPlanningPage = ({
    pageId,
    control,
    eventData,
    eventTypeOptions,
    capabilities,
    choices,
    includePlayoffs,
    hasStripeAccount,
    connectingStripe,
    onChoicesChange,
    onEventTypeChange,
    onExternalRegistrationChange,
    onSingleDivisionChange,
    onIncludePlayoffsChange,
    onIncludePoolPlayChange,
    onSplitLeaguePlayoffDivisionsChange,
    onConnectStripe,
    onRegistrationPaymentModeChange,
    isImmutableField,
}: SimpleSetupPlanningPageProps) => {
    if (pageId === 'format') {
        return (
            <Stack gap="lg">
                <div>
                    <Title order={4}>What are you creating?</Title>
                    <Text size="sm" c="dimmed">
                        These choices determine which setup pages and BracketIQ tools apply to this event.
                    </Text>
                </div>
                <div
                    data-testid="simple-setup-format-layout"
                    className="flex flex-wrap items-start gap-x-8 gap-y-6"
                >
                    <div className="w-full sm:w-[22rem] sm:flex-none">
                        <Controller
                            name="eventType"
                            control={control}
                            render={({ field, fieldState }) => (
                                <Select
                                    label="Event type"
                                    description="Tryouts are available only to organizations with club features enabled."
                                    data={eventTypeOptions}
                                    value={field.value}
                                    disabled={isImmutableField('eventType')}
                                    error={fieldState.error?.message as string | undefined}
                                    onChange={(value) => {
                                        if (!value || isImmutableField('eventType')) return;
                                        onEventTypeChange(value as Event['eventType'], field.onChange);
                                    }}
                                />
                            )}
                        />
                    </div>
                    <div className="w-full min-w-0 sm:w-auto sm:min-w-[22rem] sm:flex-none">
                        <Controller
                            name="isAffiliateEvent"
                            control={control}
                            render={({ field }) => (
                                <Radio.Group
                                    label="Registration destination"
                                    description="External listings send participants to the official registration website."
                                    value={field.value ? 'EXTERNAL' : 'BRACKET_IQ'}
                                    onChange={(value) => {
                                        if (isImmutableField('affiliateUrl')) return;
                                        onExternalRegistrationChange(value === 'EXTERNAL', field.onChange);
                                    }}
                                >
                                    <Stack gap="xs" mt="sm">
                                        <Radio value="BRACKET_IQ" label="BracketIQ registration" />
                                        <Radio value="EXTERNAL" label="External registration" />
                                    </Stack>
                                </Radio.Group>
                            )}
                        />
                    </div>
                </div>
                {capabilities.isExternal ? (
                    <Alert color="blue" variant="light">
                        BracketIQ will publish and filter this listing, but checkout, questions, documents,
                        match generation, and staff operations remain on the linked website.
                    </Alert>
                ) : null}
            </Stack>
        );
    }

    if (pageId === 'participation-plan') {
        const teamChoiceDisabled = !capabilities.canChooseTeamRegistration;
        const divisionChoiceDisabled = !capabilities.canChooseDivisionMode;
        return (
            <Stack gap="lg">
                <div>
                    <Title order={4}>Plan participation and divisions</Title>
                    <Text size="sm" c="dimmed">
                        Decide who registers and where capacity, pricing, schedules, and competition settings belong.
                    </Text>
                </div>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <div className={choiceCardClassName}>
                        <Controller
                            name="teamSignup"
                            control={control}
                            render={({ field }) => (
                                <Radio.Group
                                    label="Registration unit"
                                    value={field.value ? 'TEAMS' : 'INDIVIDUALS'}
                                    onChange={(value) => {
                                        if (teamChoiceDisabled || isImmutableField('teamSignup')) return;
                                        field.onChange(value === 'TEAMS');
                                    }}
                                >
                                    <Stack gap="xs" mt="sm">
                                        <Radio value="INDIVIDUALS" label="Individuals" disabled={teamChoiceDisabled} />
                                        <Radio value="TEAMS" label="Teams" disabled={teamChoiceDisabled} />
                                    </Stack>
                                </Radio.Group>
                            )}
                        />
                        {teamChoiceDisabled ? (
                            <Text size="xs" c="dimmed" mt="sm">
                                {capabilities.isTryout
                                    ? 'Tryouts always register individual players.'
                                    : capabilities.isExternal
                                        ? 'External listings do not use BracketIQ team registration.'
                                        : 'Leagues and tournaments always register teams.'}
                            </Text>
                        ) : null}
                    </div>
                    <div className={choiceCardClassName}>
                        <Controller
                            name="teamSizeLimit"
                            control={control}
                            render={({ field, fieldState }) => (
                                <NumberInput
                                    label="Team size"
                                    description="Used for team registrations and team capacity calculations."
                                    min={1}
                                    max={999}
                                    value={field.value ?? ''}
                                    disabled={!eventData.teamSignup || isImmutableField('teamSizeLimit')}
                                    error={fieldState.error?.message as string | undefined}
                                    onChange={(value) => {
                                        const numeric = typeof value === 'number' && Number.isFinite(value)
                                            ? Math.max(1, Math.trunc(value))
                                            : null;
                                        field.onChange(numeric);
                                    }}
                                />
                            )}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Controller
                            name="singleDivision"
                            control={control}
                            render={({ field }) => (
                                <Radio.Group
                                    label="Division configuration"
                                    value={field.value ? 'SHARED' : 'SPLIT'}
                                    onChange={(value) => {
                                        if (divisionChoiceDisabled || isImmutableField('singleDivision')) return;
                                        onSingleDivisionChange(value === 'SHARED', field.onChange);
                                    }}
                                >
                                    <Stack gap="xs" mt="sm">
                                        <Radio value="SHARED" label="Shared configuration" disabled={divisionChoiceDisabled} />
                                        <Radio value="SPLIT" label="Split divisions" disabled={divisionChoiceDisabled} />
                                    </Stack>
                                </Radio.Group>
                            )}
                        />
                        <Text size="xs" c="dimmed" mt="sm">
                            {capabilities.isTryout
                                ? 'Tryouts use the organization divisions selected on the next page.'
                                : 'Split divisions can own separate capacity, price, schedule, and competition settings.'}
                        </Text>
                    </div>
                    <div className={choiceCardClassName}>
                        <Controller
                            name="registrationByDivisionType"
                            control={control}
                            render={({ field }) => (
                                <Switch
                                    label="Register by division type"
                                    description="Participants choose a classification and are assigned to a matching division."
                                    checked={Boolean(field.value)}
                                    disabled={!capabilities.canUseRegistrationByDivisionType || isImmutableField('registrationByDivisionType')}
                                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                                />
                            )}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="League playoffs"
                            checked={capabilities.isLeague && includePlayoffs}
                            disabled={!capabilities.canUseLeaguePlayoffs || isImmutableField('includePlayoffs')}
                            onChange={(event) => onIncludePlayoffsChange(event.currentTarget.checked)}
                        />
                        <Controller
                            name="splitLeaguePlayoffDivisions"
                            control={control}
                            render={({ field }) => (
                                <Switch
                                    mt="md"
                                    label="Split league and playoff divisions"
                                    checked={Boolean(field.value)}
                                    disabled={!capabilities.canSplitLeaguePlayoffDivisions || isImmutableField('splitLeaguePlayoffDivisions')}
                                    onChange={(event) => onSplitLeaguePlayoffDivisionsChange(
                                        event.currentTarget.checked,
                                        field.onChange,
                                    )}
                                />
                            )}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Tournament pool play"
                            description="Configure pools before the tournament bracket."
                            checked={capabilities.isTournament && includePlayoffs}
                            disabled={!capabilities.canUsePoolPlay || isImmutableField('includePlayoffs')}
                            onChange={(event) => onIncludePoolPlayChange(event.currentTarget.checked)}
                        />
                    </div>
                </SimpleGrid>
            </Stack>
        );
    }

    if (pageId === 'schedule-plan') {
        return (
            <Stack gap="lg">
                <div>
                    <Title order={4}>Plan the schedule structure</Title>
                    <Text size="sm" c="dimmed">
                        Choose how dates and timeslots will work before entering the schedule and location.
                    </Text>
                </div>
                <Radio.Group
                    label="Schedule style"
                    value={choices.scheduleStyle}
                    onChange={(value) => onChoicesChange({
                        scheduleStyle: value as EventSetupChoices['scheduleStyle'],
                    })}
                >
                    <Stack gap="md" mt="sm">
                        {scheduleStyleOptions.map((option) => (
                            <label
                                key={option.value}
                                className="flex cursor-pointer items-start gap-3"
                            >
                                <Radio
                                    value={option.value}
                                    aria-label={option.label}
                                    disabled={!capabilities.usesInternalSchedule}
                                    mt={2}
                                />
                                <div className="min-w-0">
                                    <Text fw={600} size="sm">{option.label}</Text>
                                    <Text c="dimmed" mt={2} size="sm">{option.description}</Text>
                                </div>
                            </label>
                        ))}
                    </Stack>
                </Radio.Group>
            </Stack>
        );
    }

    if (pageId === 'registration-plan') {
        return (
            <Stack gap="lg">
                <div>
                    <Title order={4}>Plan registration</Title>
                    <Text size="sm" c="dimmed">Choose which registration tools should be configured on the following pages.</Text>
                </div>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Paid registration"
                            description={capabilities.isExternal
                                ? 'Publish the official listing price or division price range.'
                                : 'Collect a total event or division price.'}
                            checked={choices.paidRegistration}
                            onChange={(event) => onChoicesChange({ paidRegistration: event.currentTarget.checked })}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Controller
                            name="registrationPaymentMode"
                            control={control}
                            render={({ field }) => (
                                <Radio.Group
                                    label="Payment collection"
                                    value={field.value ?? 'ONLINE'}
                                    onChange={(value) => {
                                        const mode = value as 'ONLINE' | 'MANUAL';
                                        if (mode === 'ONLINE' && !hasStripeAccount) return;
                                        onRegistrationPaymentModeChange(mode);
                                    }}
                                >
                                    <Stack gap="xs" mt="sm">
                                        <Radio
                                            value="ONLINE"
                                            label="BracketIQ online checkout"
                                            disabled={capabilities.isExternal || !hasStripeAccount}
                                        />
                                        <Radio value="MANUAL" label="Self-managed payment" disabled={capabilities.isExternal} />
                                    </Stack>
                                </Radio.Group>
                            )}
                        />
                        {!capabilities.isExternal && !hasStripeAccount ? (
                            <Alert color="orange" variant="light" mt="md">
                                <Text size="sm" mb="sm">
                                    Self-managed payment is the default until Stripe is connected.
                                </Text>
                                <Button
                                    type="button"
                                    size="xs"
                                    loading={connectingStripe}
                                    onClick={onConnectStripe}
                                >
                                    Connect Stripe for online checkout
                                </Button>
                            </Alert>
                        ) : null}
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Required documents"
                            checked={choices.useRequiredDocuments}
                            disabled={!capabilities.usesInternalRegistration}
                            onChange={(event) => onChoicesChange({ useRequiredDocuments: event.currentTarget.checked })}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Registration questions"
                            checked={choices.useRegistrationQuestions}
                            disabled={!capabilities.usesInternalRegistration}
                            onChange={(event) => onChoicesChange({ useRegistrationQuestions: event.currentTarget.checked })}
                        />
                    </div>
                </SimpleGrid>
            </Stack>
        );
    }

    if (pageId === 'operations-plan') {
        return (
            <Stack gap="lg">
                <div>
                    <Title order={4}>Plan event operations</Title>
                    <Text size="sm" c="dimmed">Enable only the operational editors this event will use.</Text>
                </div>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Staff assignments"
                            checked={choices.useStaffAssignments}
                            onChange={(event) => onChoicesChange({ useStaffAssignments: event.currentTarget.checked })}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Dedicated officials"
                            checked={choices.useDedicatedOfficials}
                            onChange={(event) => onChoicesChange({ useDedicatedOfficials: event.currentTarget.checked })}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Custom official positions"
                            checked={choices.useCustomOfficialPositions}
                            disabled={!choices.useDedicatedOfficials}
                            onChange={(event) => onChoicesChange({ useCustomOfficialPositions: event.currentTarget.checked })}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Team check-in and roster operations"
                            checked={choices.useTeamCheckInAndRosterOperations}
                            disabled={!eventData.teamSignup}
                            onChange={(event) => onChoicesChange({
                                useTeamCheckInAndRosterOperations: event.currentTarget.checked,
                            })}
                        />
                    </div>
                </SimpleGrid>
            </Stack>
        );
    }

    return null;
};
