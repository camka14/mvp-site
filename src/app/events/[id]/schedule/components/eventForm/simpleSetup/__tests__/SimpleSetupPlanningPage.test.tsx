import { fireEvent, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { renderWithMantine } from '../../../../../../../../../test/utils/renderWithMantine';
import type { EventFormValues } from '../../formTypes';
import { resolveEventSetupCapabilities } from '../resolveEventSetup';
import { SimpleSetupPlanningPage } from '../SimpleSetupPlanningPage';
import type { EventSetupChoices } from '../types';

const choices: EventSetupChoices = {
    scheduleStyle: 'FIXED_WINDOW',
    paidRegistration: true,
    useRequiredDocuments: false,
    useRegistrationQuestions: false,
    useStaffAssignments: false,
    useDedicatedOfficials: false,
    useCustomOfficialPositions: false,
    useTeamCheckInAndRosterOperations: false,
};

const capabilities = resolveEventSetupCapabilities({
    eventType: 'EVENT',
    isExternalRegistration: false,
    singleDivision: true,
    teamSignup: false,
    includePlayoffs: false,
    includePoolPlay: false,
    splitLeaguePlayoffDivisions: false,
    hasImmutableRentalResources: false,
    choices,
});

const RegistrationPlanHarness = ({
    hasStripeAccount,
    onConnectStripe,
    onRegistrationPaymentModeChange,
}: {
    hasStripeAccount: boolean;
    onConnectStripe: () => void;
    onRegistrationPaymentModeChange: (mode: 'ONLINE' | 'MANUAL') => void;
}) => {
    const form = useForm<EventFormValues>({
        defaultValues: {
            registrationPaymentMode: 'MANUAL',
            allowPaymentPlans: false,
        } as EventFormValues,
    });
    const eventData = form.watch();
    return (
        <SimpleSetupPlanningPage
            pageId="format"
            control={form.control}
            eventData={eventData}
            eventTypeOptions={[]}
            capabilities={capabilities}
            choices={choices}
            includePlayoffs={false}
            hasStripeAccount={hasStripeAccount}
            connectingStripe={false}
            onChoicesChange={jest.fn()}
            onEventTypeChange={jest.fn()}
            onExternalRegistrationChange={jest.fn()}
            onSingleDivisionChange={jest.fn()}
            onIncludePlayoffsChange={jest.fn()}
            onIncludePoolPlayChange={jest.fn()}
            onSplitLeaguePlayoffDivisionsChange={jest.fn()}
            onConnectStripe={onConnectStripe}
            onRegistrationPaymentModeChange={onRegistrationPaymentModeChange}
            isImmutableField={() => false}
        />
    );
};

describe('SimpleSetupPlanningPage registration plan', () => {
    it('defaults to the manual selection and offers Stripe connection when unavailable', () => {
        const onConnectStripe = jest.fn();
        const onRegistrationPaymentModeChange = jest.fn();
        renderWithMantine(
            <RegistrationPlanHarness
                hasStripeAccount={false}
                onConnectStripe={onConnectStripe}
                onRegistrationPaymentModeChange={onRegistrationPaymentModeChange}
            />,
        );

        expect(screen.getByLabelText('Self-managed payment')).toBeChecked();
        expect(screen.getByLabelText('BracketIQ online checkout')).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Connect Stripe for online checkout' }));
        expect(onConnectStripe).toHaveBeenCalledTimes(1);
        expect(onRegistrationPaymentModeChange).not.toHaveBeenCalled();
    });

    it('allows online checkout when Stripe is connected', () => {
        const onRegistrationPaymentModeChange = jest.fn();
        renderWithMantine(
            <RegistrationPlanHarness
                hasStripeAccount
                onConnectStripe={jest.fn()}
                onRegistrationPaymentModeChange={onRegistrationPaymentModeChange}
            />,
        );

        fireEvent.click(screen.getByLabelText('BracketIQ online checkout'));
        expect(onRegistrationPaymentModeChange).toHaveBeenCalledWith('ONLINE');
        expect(screen.queryByRole('button', { name: 'Connect Stripe for online checkout' }))
            .not.toBeInTheDocument();
    });
});

describe('SimpleSetupPlanningPage operations plan', () => {
    it('stores team operations as an explicit setup choice', () => {
        const onChoicesChange = jest.fn();
        const operationChoices = {
            ...choices,
            useTeamCheckInAndRosterOperations: false,
        };
        const operationCapabilities = resolveEventSetupCapabilities({
            eventType: 'LEAGUE',
            isExternalRegistration: false,
            singleDivision: true,
            teamSignup: true,
            includePlayoffs: false,
            includePoolPlay: false,
            splitLeaguePlayoffDivisions: false,
            hasImmutableRentalResources: false,
            choices: operationChoices,
        });
        const OperationsHarness = () => {
            const form = useForm<EventFormValues>({
                defaultValues: {
                    eventType: 'LEAGUE',
                    teamSignup: true,
                    teamCheckInMode: 'OFF',
                } as EventFormValues,
            });
            return (
                <SimpleSetupPlanningPage
                    pageId="format"
                    control={form.control}
                    eventData={form.getValues()}
                    eventTypeOptions={[]}
                    capabilities={operationCapabilities}
                    choices={operationChoices}
                    includePlayoffs={false}
                    hasStripeAccount={false}
                    connectingStripe={false}
                    onChoicesChange={onChoicesChange}
                    onEventTypeChange={jest.fn()}
                    onExternalRegistrationChange={jest.fn()}
                    onSingleDivisionChange={jest.fn()}
                    onIncludePlayoffsChange={jest.fn()}
                    onIncludePoolPlayChange={jest.fn()}
                    onSplitLeaguePlayoffDivisionsChange={jest.fn()}
                    onConnectStripe={jest.fn()}
                    onRegistrationPaymentModeChange={jest.fn()}
                    isImmutableField={() => false}
                />
            );
        };
        renderWithMantine(<OperationsHarness />);

        expect(screen.getByLabelText('Custom official positions')).toBeDisabled();
        fireEvent.click(screen.getByLabelText('Team check-in and roster operations'));
        expect(onChoicesChange).toHaveBeenCalledWith({
            useTeamCheckInAndRosterOperations: true,
        });
    });
});

describe('SimpleSetupPlanningPage Weekly Event schedule plan', () => {
    it('offers only repeating and mixed schedule styles', () => {
        const onChoicesChange = jest.fn();
        const weeklyChoices: EventSetupChoices = {
            ...choices,
            scheduleStyle: 'WEEKLY_SLOTS',
        };
        const weeklyCapabilities = resolveEventSetupCapabilities({
            eventType: 'WEEKLY_EVENT',
            isExternalRegistration: false,
            singleDivision: true,
            teamSignup: false,
            includePlayoffs: false,
            includePoolPlay: false,
            splitLeaguePlayoffDivisions: false,
            hasImmutableRentalResources: false,
            choices: weeklyChoices,
        });
        const WeeklyScheduleHarness = () => {
            const form = useForm<EventFormValues>({
                defaultValues: {
                    eventType: 'WEEKLY_EVENT',
                    teamSignup: false,
                    singleDivision: true,
                } as EventFormValues,
            });
            return (
                <SimpleSetupPlanningPage
                    pageId="format"
                    control={form.control}
                    eventData={form.getValues()}
                    eventTypeOptions={[]}
                    capabilities={weeklyCapabilities}
                    choices={weeklyChoices}
                    includePlayoffs={false}
                    hasStripeAccount={false}
                    connectingStripe={false}
                    onChoicesChange={onChoicesChange}
                    onEventTypeChange={jest.fn()}
                    onExternalRegistrationChange={jest.fn()}
                    onSingleDivisionChange={jest.fn()}
                    onIncludePlayoffsChange={jest.fn()}
                    onIncludePoolPlayChange={jest.fn()}
                    onSplitLeaguePlayoffDivisionsChange={jest.fn()}
                    onConnectStripe={jest.fn()}
                    onRegistrationPaymentModeChange={jest.fn()}
                    isImmutableField={() => false}
                />
            );
        };

        renderWithMantine(<WeeklyScheduleHarness />);

        expect(screen.getByText('Weekly Events require at least one weekly repeating timeslot.')).toBeInTheDocument();
        expect(screen.getByLabelText('Weekly repeating timeslots')).toBeInTheDocument();
        expect(screen.getByLabelText('Mixed repeating and fixed timeslots')).toBeInTheDocument();
        expect(screen.queryByLabelText('Fixed event window')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Fixed one-time timeslots')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Mixed repeating and fixed timeslots'));
        expect(onChoicesChange).toHaveBeenCalledWith({ scheduleStyle: 'MIXED_SLOTS' });
    });
});
