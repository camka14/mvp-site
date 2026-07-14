import { Alert, Button, Group, Paper, Select, Text } from '@mantine/core';

import type { ConsentLinks, EventRegistration } from '@/lib/registrationService';
import { formatAgeRange } from '@/lib/age';

type ChildOption = {
    value: string;
    label: string;
};

type ChildRegistrationPanelProps = {
    visible: boolean;
    isTeamSignup: boolean;
    waitlistMode: boolean;
    childrenError: string | null;
    childrenLoading: boolean;
    childOptions: ChildOption[];
    selectedChildId: string;
    selectedChildPresent: boolean;
    selectedChildHasEmail: boolean;
    selectedChildEligible: boolean;
    selectedChildIsFreeAgent: boolean;
    selectedChildIsWaitlisted: boolean;
    selectedChildIsRegistered: boolean;
    joiningChildFreeAgent: boolean;
    registeringChild: boolean;
    canRegisterChild: boolean;
    weeklySelectionRequired: boolean;
    isDivisionSelectionMissing: boolean;
    hasAgeLimits: boolean;
    eventMinAge?: number;
    eventMaxAge?: number;
    showRegistrationStatus: boolean;
    registration: EventRegistration | null;
    consent: ConsentLinks | null;
    comboboxProps: { withinPortal: boolean; zIndex: number };
    onChildChange: (childId: string) => void;
    onAction: () => void;
};

export function ChildRegistrationPanel({
    visible,
    isTeamSignup,
    waitlistMode,
    childrenError,
    childrenLoading,
    childOptions,
    selectedChildId,
    selectedChildPresent,
    selectedChildHasEmail,
    selectedChildEligible,
    selectedChildIsFreeAgent,
    selectedChildIsWaitlisted,
    selectedChildIsRegistered,
    joiningChildFreeAgent,
    registeringChild,
    canRegisterChild,
    weeklySelectionRequired,
    isDivisionSelectionMissing,
    hasAgeLimits,
    eventMinAge,
    eventMaxAge,
    showRegistrationStatus,
    registration,
    consent,
    comboboxProps,
    onChildChange,
    onAction,
}: ChildRegistrationPanelProps) {
    if (!visible) {
        return null;
    }

    const actionLabel = isTeamSignup
        ? (joiningChildFreeAgent
            ? 'Updating…'
            : (selectedChildIsFreeAgent ? 'Remove child from free agents' : 'Add child as free agent'))
        : waitlistMode
            ? (registeringChild
                ? 'Updating…'
                : (selectedChildIsWaitlisted ? 'Remove child from waitlist' : 'Add child to waitlist'))
            : (registeringChild ? 'Registering…' : 'Register child');
    const actionDisabled = !canRegisterChild
        || !selectedChildId
        || (isTeamSignup
            ? (!selectedChildEligible || joiningChildFreeAgent)
            : waitlistMode
                ? (
                    registeringChild
                    || (!selectedChildIsWaitlisted && (
                        weeklySelectionRequired
                        || !selectedChildEligible
                        || isDivisionSelectionMissing
                        || selectedChildIsRegistered
                    ))
                )
                : (
                    weeklySelectionRequired
                    || !selectedChildEligible
                    || registeringChild
                    || isDivisionSelectionMissing
                ));

    return (
        <Paper withBorder p="sm" radius="md" className="space-y-3">
            <Text size="sm" fw={600}>
                {isTeamSignup ? 'Child Free Agent' : (waitlistMode ? 'Child Waitlist' : 'Register a child')}
            </Text>
            {childrenError && (
                <Alert color="red" variant="light">
                    {childrenError}
                </Alert>
            )}
            {childrenLoading ? (
                <Text size="sm" c="dimmed">Loading children...</Text>
            ) : (
                <Select
                    placeholder="Select a child"
                    data={childOptions}
                    value={selectedChildId}
                    onChange={(value) => onChildChange(value || '')}
                    comboboxProps={comboboxProps}
                />
            )}
            {!childrenLoading && childOptions.length === 0 && (
                <Text size="xs" c="dimmed">
                    No active children linked yet. Add one from your profile.
                </Text>
            )}
            {isTeamSignup && (
                <Text size="xs" c="dimmed">
                    Team registration is only for teams. Child profiles can join as free agents.
                </Text>
            )}
            {!isTeamSignup && waitlistMode && (
                <Text size="xs" c="dimmed">
                    Manage the selected child&apos;s waitlist status.
                </Text>
            )}
            {selectedChildPresent && !selectedChildHasEmail && !isTeamSignup && (
                <Alert color="yellow" variant="light">
                    The selected child can register now, but child-signature steps remain pending until an email is added.
                </Alert>
            )}
            {!isTeamSignup && waitlistMode && selectedChildIsRegistered && (
                <Alert color="green" variant="light">
                    The selected child is already registered for this event.
                </Alert>
            )}
            {!isTeamSignup && waitlistMode && selectedChildIsWaitlisted && (
                <Alert color="blue" variant="light">
                    The selected child is currently on the waitlist.
                </Alert>
            )}
            <Button fullWidth variant="light" onClick={onAction} disabled={actionDisabled}>
                {actionLabel}
            </Button>
            {hasAgeLimits && (
                <Text size="xs" c="dimmed">
                    Eligible ages: {formatAgeRange(eventMinAge, eventMaxAge)}.
                </Text>
            )}
            {!isTeamSignup && showRegistrationStatus && registration?.status && (
                <Text size="xs" c="dimmed">
                    Registration status: {registration.status}
                </Text>
            )}
            {!isTeamSignup && showRegistrationStatus && consent?.status && (
                <Text size="xs" c="dimmed">
                    Consent status: {consent.status}
                </Text>
            )}
            {!isTeamSignup && showRegistrationStatus && (consent?.parentSignLink || consent?.childSignLink) && (
                <Group gap="xs">
                    {consent.parentSignLink && (
                        <Button component="a" href={consent.parentSignLink} target="_blank" rel="noreferrer" size="xs">
                            Parent Sign
                        </Button>
                    )}
                    {consent.childSignLink && (
                        <Button
                            component="a"
                            href={consent.childSignLink}
                            target="_blank"
                            rel="noreferrer"
                            size="xs"
                            variant="light"
                        >
                            Child Sign
                        </Button>
                    )}
                </Group>
            )}
        </Paper>
    );
}
