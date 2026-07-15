'use client';

import { Controller, type Control } from 'react-hook-form';
import {
    Alert,
    Badge,
    Checkbox,
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
    fieldCount: number;
    setFieldCount: (count: number) => void;
    onChoicesChange: (updates: Partial<EventSetupChoices>) => void;
    onEventTypeChange: (nextType: Event['eventType'], applyValue: (nextType: Event['eventType']) => void) => void;
    onExternalRegistrationChange: (checked: boolean, applyValue: (checked: boolean) => void) => void;
    onSingleDivisionChange: (singleDivision: boolean, applyValue: (singleDivision: boolean) => void) => void;
    onIncludePlayoffsChange: (checked: boolean) => void;
    onIncludePoolPlayChange: (checked: boolean) => void;
    onSplitLeaguePlayoffDivisionsChange: (checked: boolean, applyValue: (checked: boolean) => void) => void;
    isImmutableField: (key: keyof Event) => boolean;
};

const choiceCardClassName = 'rounded-md border border-gray-200 bg-gray-50 p-4';

export const SimpleSetupPlanningPage = ({
    pageId,
    control,
    eventData,
    eventTypeOptions,
    capabilities,
    choices,
    includePlayoffs,
    fieldCount,
    setFieldCount,
    onChoicesChange,
    onEventTypeChange,
    onExternalRegistrationChange,
    onSingleDivisionChange,
    onIncludePlayoffsChange,
    onIncludePoolPlayChange,
    onSplitLeaguePlayoffDivisionsChange,
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
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
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
                </SimpleGrid>
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
                        Choose the schedule and resource model before entering dates, locations, and timeslots.
                    </Text>
                </div>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    <Select
                        label="Schedule style"
                        value={choices.scheduleStyle}
                        disabled={!capabilities.usesInternalSchedule}
                        data={[
                            { value: 'FIXED_WINDOW', label: 'Fixed event window' },
                            { value: 'WEEKLY_SLOTS', label: 'Weekly repeating timeslots' },
                            { value: 'FIXED_SLOTS', label: 'Fixed one-time timeslots' },
                            { value: 'MIXED_SLOTS', label: 'Mixed repeating and fixed timeslots' },
                        ]}
                        onChange={(value) => {
                            if (value) onChoicesChange({ scheduleStyle: value as EventSetupChoices['scheduleStyle'] });
                        }}
                    />
                    <Select
                        label="Resource source"
                        value={choices.resourceSource}
                        disabled={!capabilities.usesInternalSchedule || choices.resourceSource === 'RENTAL_LOCKED'}
                        data={[
                            { value: 'ORGANIZATION', label: 'Organization resources' },
                            { value: 'CUSTOM', label: 'Custom event resources' },
                            { value: 'LOCATION_ONLY', label: 'Location only' },
                            ...(choices.resourceSource === 'RENTAL_LOCKED'
                                ? [{ value: 'RENTAL_LOCKED', label: 'Rental resources (locked)' }]
                                : []),
                        ]}
                        onChange={(value) => {
                            if (value) onChoicesChange({ resourceSource: value as EventSetupChoices['resourceSource'] });
                        }}
                    />
                    <NumberInput
                        label="Custom resource count"
                        min={0}
                        max={12}
                        value={fieldCount}
                        disabled={!capabilities.usesInternalSchedule || choices.resourceSource !== 'CUSTOM'}
                        onChange={(value) => {
                            const numeric = typeof value === 'number' && Number.isFinite(value)
                                ? Math.max(0, Math.trunc(value))
                                : 0;
                            setFieldCount(numeric);
                        }}
                    />
                    <div className={choiceCardClassName}>
                        <Text fw={600} size="sm">Division assignment</Text>
                        <Text size="sm" c="dimmed">
                            {eventData.singleDivision
                                ? 'Shared configuration assigns all divisions to each timeslot.'
                                : capabilities.isTryout
                                    ? 'Each tryout timeslot must select its organization division.'
                                    : 'Each timeslot can apply to all divisions or selected divisions.'}
                        </Text>
                    </div>
                </SimpleGrid>
            </Stack>
        );
    }

    if (pageId === 'competition-plan') {
        return (
            <Stack gap="lg">
                <div>
                    <Title order={4}>Choose competition options</Title>
                    <Text size="sm" c="dimmed">Enable the rule editors you intend to customize.</Text>
                </div>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Customize match rules"
                            description="Override sport defaults for scoring, incidents, and match behavior."
                            checked={choices.customizeMatchRules}
                            onChange={(event) => onChoicesChange({ customizeMatchRules: event.currentTarget.checked })}
                        />
                    </div>
                    <div className={choiceCardClassName}>
                        <Switch
                            label="Customize standings or pool scoring"
                            checked={choices.customizeScoring}
                            disabled={!capabilities.isLeague && !capabilities.isTournament}
                            onChange={(event) => onChoicesChange({ customizeScoring: event.currentTarget.checked })}
                        />
                    </div>
                </SimpleGrid>
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
                        <Controller
                            name="allowPaymentPlans"
                            control={control}
                            render={({ field }) => (
                                <Switch
                                    mt="md"
                                    label="Payment plans"
                                    checked={Boolean(field.value)}
                                    disabled={!choices.paidRegistration || capabilities.isExternal || isImmutableField('allowPaymentPlans')}
                                    onChange={(event) => field.onChange(event.currentTarget.checked)}
                                />
                            )}
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
                                    onChange={(value) => field.onChange(value)}
                                >
                                    <Stack gap="xs" mt="sm">
                                        <Radio value="ONLINE" label="BracketIQ online checkout" disabled={capabilities.isExternal} />
                                        <Radio value="MANUAL" label="Self-managed payment" disabled={capabilities.isExternal} />
                                    </Stack>
                                </Radio.Group>
                            )}
                        />
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
                        <Controller
                            name="teamCheckInMode"
                            control={control}
                            render={({ field }) => (
                                <Checkbox
                                    label="Team check-in and roster operations"
                                    checked={field.value !== 'OFF'}
                                    disabled={!eventData.teamSignup}
                                    onChange={(event) => {
                                        field.onChange(event.currentTarget.checked ? 'EVENT' : 'OFF');
                                    }}
                                />
                            )}
                        />
                    </div>
                </SimpleGrid>
            </Stack>
        );
    }

    if (pageId === 'review-publish') {
        const eventTypeLabel = eventTypeOptions.find((option) => option.value === eventData.eventType)?.label
            ?? eventData.eventType;
        return (
            <Stack gap="lg">
                <div>
                    <Title order={4}>Review the event setup</Title>
                    <Text size="sm" c="dimmed">
                        Review the summary, open any page that needs changes, then use the form&apos;s save action.
                    </Text>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-5">
                    <Stack gap="sm">
                        <div>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Event</Text>
                            <Text fw={700}>{eventData.name?.trim() || 'Untitled event'}</Text>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="light">{eventTypeLabel}</Badge>
                            <Badge variant="light">{capabilities.isExternal ? 'External registration' : 'BracketIQ registration'}</Badge>
                            <Badge variant="light">{eventData.teamSignup ? 'Teams' : 'Individuals'}</Badge>
                            <Badge variant="light">{eventData.singleDivision ? 'Shared configuration' : 'Split divisions'}</Badge>
                            <Badge variant="light">{choices.scheduleStyle.replace(/_/g, ' ').toLowerCase()}</Badge>
                        </div>
                        <Text size="sm" c="dimmed">
                            {eventData.location?.trim() || 'Location not specified'}
                        </Text>
                    </Stack>
                </div>
                <Alert color="blue" variant="light">
                    Simple and Advanced Setup use the same draft. Switching modes will not discard these values.
                </Alert>
            </Stack>
        );
    }

    return null;
};
