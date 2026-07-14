import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import type { Event, Team } from '@/types';

import { EventDetailRegistrationPanels } from '../EventDetailRegistrationPanels';

jest.mock('../ChildRegistrationPanel', () => ({
    ChildRegistrationPanel: () => <div>Child registration</div>,
}));
jest.mock('../EventIndividualRegistrationPanel', () => ({
    EventIndividualRegistrationPanel: ({
        onJoinEvent,
        onJoinWaitlist,
        showSelfWaitlistActions,
    }: {
        onJoinEvent: () => void;
        onJoinWaitlist: () => void;
        showSelfWaitlistActions: boolean;
    }) => (
        <div>
            <div>Waitlist actions: {String(showSelfWaitlistActions)}</div>
            <button type="button" onClick={onJoinEvent}>Join event</button>
            <button type="button" onClick={onJoinWaitlist}>Join waitlist</button>
        </div>
    ),
}));
jest.mock('../EventTeamRegistrationPanel', () => ({
    EventTeamRegistrationPanel: ({
        onSelectedTeamChange,
        onWithdrawTeam,
        selectedTeamIsRegistered,
    }: {
        onSelectedTeamChange: (teamId: string) => void;
        onWithdrawTeam: () => void;
        selectedTeamIsRegistered: boolean;
    }) => (
        <div>
            <div>Team registered: {String(selectedTeamIsRegistered)}</div>
            <button type="button" onClick={() => onSelectedTeamChange('team_2')}>Select team</button>
            <button type="button" onClick={onWithdrawTeam}>Withdraw team</button>
        </div>
    ),
}));

type RegistrationPanelsProps = ComponentProps<typeof EventDetailRegistrationPanels>;

const buildProps = (
    overrides: Partial<RegistrationPanelsProps> = {},
): RegistrationPanelsProps => ({
    childrenError: null,
    childrenLoading: false,
    currentEvent: {
        $id: 'event_1',
        eventType: 'LEAGUE',
        name: 'Summer League',
        teamIds: [],
        teamSignup: false,
    } as Event,
    currentUserPaymentFailed: false,
    divisionModel: {
        canRegisterChild: true,
        eventHasStarted: false,
        eventMaxAge: null,
        eventMinAge: null,
        hasAgeLimits: false,
        isDivisionSelectionMissing: false,
        isFreeForUser: true,
        isMinor: false,
        selectedDivisionAtCapacity: false,
        selectedDivisionBilling: { priceCents: 0 },
        selfRegistrationBlockedReason: null,
    } as unknown as RegistrationPanelsProps['divisionModel'],
    eventTeams: [],
    isLoadingTeams: false,
    joinActions: {
        handleJoinAsTeam: jest.fn(),
        handleJoinEvent: jest.fn(),
        handleJoinTeamWaitlist: jest.fn(),
        handleJoinWaitlist: jest.fn(),
        handleRegisterChild: jest.fn(),
        handleWithdrawTeam: jest.fn(),
    } as unknown as RegistrationPanelsProps['joinActions'],
    joining: false,
    joiningChildFreeAgent: false,
    joinFinalizationController: {
        childConsent: null,
        childRegistration: null,
        registeringChild: false,
    } as unknown as RegistrationPanelsProps['joinFinalizationController'],
    onManageTeams: jest.fn(),
    onSelectedChildChange: jest.fn(),
    onSelectedTeamChange: jest.fn(),
    onViewBracket: jest.fn(),
    onViewSchedule: jest.fn(),
    participantActions: {
        handleJoinFreeAgents: jest.fn(),
        handleLeaveFreeAgents: jest.fn(),
        handleLeaveWaitlist: jest.fn(),
    } as unknown as RegistrationPanelsProps['participantActions'],
    participantModel: {
        childOptions: [],
        eventAtCapacity: false,
        isUserFreeAgent: false,
        isUserWaitlisted: false,
        participantCapacity: 16,
        selectedChild: null,
        selectedChildEligible: false,
        selectedChildHasEmail: false,
        selectedChildIsFreeAgent: false,
        selectedChildIsRegistered: false,
        selectedChildIsWaitlisted: false,
        shouldShowChildRegistrationPanel: false,
        showChildRegistrationStatus: false,
        totalParticipants: 4,
    } as unknown as RegistrationPanelsProps['participantModel'],
    paymentFailedTeamIds: [],
    presentationController: {
        openQrCode: jest.fn(),
        teamJoinOptionsOpened: true,
        toggleTeamJoinOptions: jest.fn(),
    } as unknown as RegistrationPanelsProps['presentationController'],
    publicModel: {
        canShowScheduleButton: true,
        scheduleButtonLabel: 'View schedule',
    } as unknown as RegistrationPanelsProps['publicModel'],
    registrationWorkflowController: {
        confirmingPurchase: false,
    } as unknown as RegistrationPanelsProps['registrationWorkflowController'],
    renderInline: false,
    selectedChildId: '',
    selectedTeamId: '',
    selectedTeamIsWaitlisted: false,
    userTeams: [],
    weeklyModel: {
        isWeeklyParentEvent: false,
        selectedWeeklyOccurrenceOption: null,
        weeklySelectionRequired: false,
    } as unknown as RegistrationPanelsProps['weeklyModel'],
    ...overrides,
});

describe('EventDetailRegistrationPanels', () => {
    it('routes individual waitlist actions through the join action owner', () => {
        const props = buildProps({
            participantModel: {
                ...buildProps().participantModel,
                eventAtCapacity: true,
            },
        });

        render(<EventDetailRegistrationPanels {...props} />);

        expect(screen.getByText('Waitlist actions: true')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
        expect(props.joinActions.handleJoinWaitlist).toHaveBeenCalledTimes(1);
    });

    it('recognizes a schedulable child team registration and preserves team callbacks', () => {
        const registeredTeam = {
            $id: 'event_team_1',
            name: 'Cascade Crew',
            parentTeamId: 'team_1',
        } as Team;
        const props = buildProps({
            currentEvent: {
                ...buildProps().currentEvent,
                teamSignup: true,
            },
            eventTeams: [registeredTeam],
            selectedTeamId: 'team_1',
            userTeams: [{ $id: 'team_1', name: 'Cascade Crew' } as Team],
        });

        render(<EventDetailRegistrationPanels {...props} />);

        expect(screen.getByText('Team registered: true')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Select team' }));
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw team' }));

        expect(props.onSelectedTeamChange).toHaveBeenCalledWith('team_2');
        expect(props.joinActions.handleWithdrawTeam).toHaveBeenCalledTimes(1);
    });
});
