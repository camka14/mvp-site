import { eventService } from '@/lib/eventService';
import { paymentService } from '@/lib/paymentService';
import { registrationService } from '@/lib/registrationService';
import type { Event, Team, UserData } from '@/types';

import {
    createEventJoinActions,
    type PaymentPlanPreviewState,
} from '../eventJoinActions';

jest.mock('@/lib/analytics/eventAnalytics', () => ({
    trackEventRegistrationStarted: jest.fn(),
}));

jest.mock('@/lib/eventService', () => ({
    eventService: {
        removeFreeAgent: jest.fn(),
        removeFromWaitlist: jest.fn(),
    },
}));

jest.mock('@/lib/paymentService', () => ({
    paymentService: {
        leaveEvent: jest.fn(),
    },
}));

jest.mock('@/lib/registrationService', () => ({
    registrationService: {
        registerSelfForEvent: jest.fn(),
    },
}));

const mockedRemoveFreeAgent = eventService.removeFreeAgent as jest.MockedFunction<
    typeof eventService.removeFreeAgent
>;
const mockedRemoveFromWaitlist = eventService.removeFromWaitlist as jest.MockedFunction<
    typeof eventService.removeFromWaitlist
>;
const mockedLeaveEvent = paymentService.leaveEvent as jest.MockedFunction<
    typeof paymentService.leaveEvent
>;
const mockedRegisterSelf = registrationService.registerSelfForEvent as jest.MockedFunction<
    typeof registrationService.registerSelfForEvent
>;

const event = {
    $id: 'event_1',
    teamSignup: false,
    maxParticipants: 10,
    divisionDetails: [],
} as Event;
const user = { $id: 'user_1' } as UserData;
const team = { $id: 'team_1', name: 'River City' } as Team;

const ensureWeeklyOccurrenceSelected = jest.fn(() => true);
const shouldAskRegistrationQuestions = jest.fn(() => false);
const openRegistrationQuestionsStep = jest.fn();
const beginSigningFlow = jest.fn(async () => false);
const finalizeJoin = jest.fn(async () => undefined);
const reload = jest.fn(async () => undefined);
const setJoining = jest.fn();
const setJoiningChildFreeAgent = jest.fn();
const setRegisteringChild = jest.fn();
const setJoinError = jest.fn();
const setJoinNotice = jest.fn();
const setPaymentPlanPreview = jest.fn();

type Inputs = Parameters<typeof createEventJoinActions>[0];

function makeActions(overrides: Partial<Inputs> = {}) {
    const inputs: Inputs = {
        event,
        user,
        eventHasStarted: false,
        joinClosedMessage: 'Registration is closed.',
        isDivisionSelectionMissing: false,
        registrationByDivisionType: false,
        selfRegistrationBlockedReason: null,
        isMinor: false,
        billing: {
            priceCents: 0,
            allowPaymentPlans: false,
            installmentAmounts: [],
            installmentDueDates: [],
            installmentDueRelativeDays: [],
        },
        selection: { divisionId: 'division_1', divisionTypeId: 'type_1' },
        occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        selectedChildId: 'child_1',
        selectedChildEligible: true,
        selectedChildIsFreeAgent: false,
        selectedChildIsWaitlisted: false,
        selectedChildIsRegistered: false,
        selectedChildEmail: 'child@test.com',
        playerCount: 0,
        selectedTeamId: 'team_1',
        selectedTeamIsWaitlisted: false,
        userTeams: [team],
        paymentPlanPreview: null,
        timeoutMs: 5_000,
        ensureWeeklyOccurrenceSelected,
        shouldAskRegistrationQuestions,
        openRegistrationQuestionsStep,
        beginSigningFlow,
        finalizeJoin,
        reload,
        setJoining,
        setJoiningChildFreeAgent,
        setRegisteringChild,
        setJoinError,
        setJoinNotice,
        setPaymentPlanPreview,
        ...overrides,
    };
    return { inputs, actions: createEventJoinActions(inputs) };
}

describe('createEventJoinActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ensureWeeklyOccurrenceSelected.mockReturnValue(true);
        shouldAskRegistrationQuestions.mockReturnValue(false);
        beginSigningFlow.mockResolvedValue(false);
        finalizeJoin.mockResolvedValue(undefined);
        mockedRemoveFreeAgent.mockResolvedValue(undefined);
        mockedRemoveFromWaitlist.mockResolvedValue(undefined);
        mockedLeaveEvent.mockResolvedValue(undefined);
        mockedRegisterSelf.mockResolvedValue({
            registration: { id: 'registration_1', status: 'pendingConsent' },
            requiresParentApproval: true,
        });
    });

    it('hands a self registration from signing into finalization', async () => {
        const { actions } = makeActions();

        await actions.handleJoinEvent();

        expect(beginSigningFlow).toHaveBeenCalledWith({ mode: 'user' });
        expect(finalizeJoin).toHaveBeenCalledWith({ mode: 'user' });
        expect(setJoining.mock.calls).toEqual([[true], [false]]);
    });

    it('opens payment-plan preview before starting an adult self registration', async () => {
        const { actions } = makeActions({
            billing: {
                priceCents: 2_500,
                allowPaymentPlans: true,
                installmentAmounts: [1_250, 1_250],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
            },
        });

        await actions.handleJoinEvent();

        expect(setPaymentPlanPreview).toHaveBeenCalledWith({
            intent: { mode: 'user' },
            ownerLabel: 'You',
        });
        expect(beginSigningFlow).not.toHaveBeenCalled();
    });

    it('routes a minor self registration to parent approval', async () => {
        const { actions } = makeActions({ isMinor: true });

        await actions.handleJoinEvent();

        expect(mockedRegisterSelf).toHaveBeenCalledWith(
            'event_1',
            { divisionId: 'division_1', divisionTypeId: 'type_1' },
        );
        expect(setJoinNotice).toHaveBeenCalledWith(
            'Join request sent. A parent/guardian can approve it from their child management page.',
        );
        expect(reload).toHaveBeenCalledTimes(1);
        expect(beginSigningFlow).not.toHaveBeenCalled();
    });

    it('removes an existing child free agent and restores operation state', async () => {
        const teamEvent = { ...event, teamSignup: true } as Event;
        const { actions } = makeActions({
            event: teamEvent,
            selectedChildIsFreeAgent: true,
        });

        await actions.handleRegisterChild();

        expect(mockedRemoveFreeAgent).toHaveBeenCalledWith(
            'event_1',
            'child_1',
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(setJoiningChildFreeAgent.mock.calls).toEqual([[true], [false]]);
        expect(setJoinNotice).toHaveBeenCalledWith('Child removed from free agent list.');
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('removes an existing child waitlist entry and restores operation state', async () => {
        const { actions } = makeActions({ selectedChildIsWaitlisted: true });

        await actions.handleRegisterChild();

        expect(mockedRemoveFromWaitlist).toHaveBeenCalledWith(
            'event_1',
            'child_1',
            'user',
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(setRegisteringChild.mock.calls).toEqual([[true], [false]]);
        expect(setJoinNotice).toHaveBeenCalledWith('Child removed from waitlist.');
    });

    it('blocks an ineligible child before signing or finalization', async () => {
        const { actions } = makeActions({ selectedChildEligible: false });

        await actions.handleRegisterChild();

        expect(setJoinError).toHaveBeenCalledWith('Selected child is not eligible for this event.');
        expect(beginSigningFlow).not.toHaveBeenCalled();
        expect(finalizeJoin).not.toHaveBeenCalled();
    });

    it('removes a selected team from the waitlist', async () => {
        const { actions } = makeActions({ selectedTeamIsWaitlisted: true });

        await actions.handleJoinTeamWaitlist();

        expect(mockedRemoveFromWaitlist).toHaveBeenCalledWith(
            'event_1',
            'team_1',
            'team',
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(setJoinNotice).toHaveBeenCalledWith('Team removed from waitlist.');
        expect(setJoining.mock.calls).toEqual([[true], [false]]);
    });

    it('opens a team payment-plan preview with the resolved team label', async () => {
        const { actions } = makeActions({
            billing: {
                priceCents: 4_000,
                allowPaymentPlans: true,
                installmentAmounts: [2_000, 2_000],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
            },
        });

        await actions.handleJoinAsTeam();

        expect(setPaymentPlanPreview).toHaveBeenCalledWith({
            intent: { mode: 'team', team },
            ownerLabel: 'River City',
        });
        expect(finalizeJoin).not.toHaveBeenCalled();
    });

    it('continues the retained team payment-plan intent without reopening preview', async () => {
        const preview: PaymentPlanPreviewState = {
            intent: { mode: 'team', team },
            ownerLabel: 'River City',
        };
        const { actions } = makeActions({
            paymentPlanPreview: preview,
            billing: {
                priceCents: 4_000,
                allowPaymentPlans: true,
                installmentAmounts: [2_000, 2_000],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
            },
        });

        actions.continuePaymentPlanPreview();
        await Promise.resolve();
        await Promise.resolve();

        expect(setPaymentPlanPreview).toHaveBeenCalledWith(null);
        expect(beginSigningFlow).toHaveBeenCalledWith({ mode: 'team', team });
        expect(finalizeJoin).toHaveBeenCalledWith({ mode: 'team', team });
    });

    it('withdraws the selected team with the scoped occurrence', async () => {
        const { actions } = makeActions();

        await actions.handleWithdrawTeam();

        expect(mockedLeaveEvent).toHaveBeenCalledWith(
            user,
            event,
            team,
            undefined,
            undefined,
            5_000,
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(setJoinNotice).toHaveBeenCalledWith('Team withdrawn from this event.');
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
