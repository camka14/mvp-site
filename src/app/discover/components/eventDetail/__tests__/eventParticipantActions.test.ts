import { eventService } from '@/lib/eventService';
import { registrationService } from '@/lib/registrationService';
import type { Event, UserData } from '@/types';

import { createEventParticipantActions } from '../eventParticipantActions';

jest.mock('@/lib/analytics/eventAnalytics', () => ({
    trackEventRegistrationStarted: jest.fn(),
}));

jest.mock('@/lib/eventService', () => ({
    eventService: {
        removeFromWaitlist: jest.fn(),
        removeFreeAgent: jest.fn(),
        addFreeAgent: jest.fn(),
    },
}));

jest.mock('@/lib/registrationService', () => ({
    registrationService: {
        registerSelfForEvent: jest.fn(),
    },
}));

const mockedRemoveWaitlist = eventService.removeFromWaitlist as jest.MockedFunction<
    typeof eventService.removeFromWaitlist
>;
const mockedRemoveFreeAgent = eventService.removeFreeAgent as jest.MockedFunction<
    typeof eventService.removeFreeAgent
>;
const mockedAddFreeAgent = eventService.addFreeAgent as jest.MockedFunction<
    typeof eventService.addFreeAgent
>;
const mockedRegisterSelf = registrationService.registerSelfForEvent as jest.MockedFunction<
    typeof registrationService.registerSelfForEvent
>;

const event = { $id: 'event_1' } as Event;
const user = { $id: 'user_1' } as UserData;
const occurrence = { slotId: 'slot_1', occurrenceDate: '2026-07-15' };
const shouldAskRegistrationQuestions = jest.fn(() => false);
const openRegistrationQuestionsStep = jest.fn();
const reload = jest.fn(async () => undefined);
const setJoining = jest.fn();
const setJoinError = jest.fn();
const setJoinNotice = jest.fn();

type Inputs = Parameters<typeof createEventParticipantActions>[0];

function makeActions(overrides: Partial<Inputs> = {}) {
    return createEventParticipantActions({
        event,
        user,
        occurrence,
        selection: { divisionId: 'division_1', divisionTypeId: 'type_1' },
        isMinor: false,
        freeAgentJoinBlockedReason: null,
        shouldAskRegistrationQuestions,
        openRegistrationQuestionsStep,
        reload,
        setJoining,
        setJoinError,
        setJoinNotice,
        ...overrides,
    });
}

describe('createEventParticipantActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        shouldAskRegistrationQuestions.mockReturnValue(false);
        mockedRemoveWaitlist.mockResolvedValue(undefined);
        mockedRemoveFreeAgent.mockResolvedValue(undefined);
        mockedAddFreeAgent.mockResolvedValue(undefined);
        mockedRegisterSelf.mockResolvedValue({
            registration: { id: 'registration_1', status: 'pendingConsent' },
            requiresParentApproval: true,
        });
    });

    it('leaves the user waitlist and reloads the event', async () => {
        const actions = makeActions();

        await actions.handleLeaveWaitlist();

        expect(mockedRemoveWaitlist).toHaveBeenCalledWith('event_1', 'user_1', 'user', occurrence);
        expect(setJoinNotice).toHaveBeenCalledWith('Removed from waitlist.');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(setJoining.mock.calls).toEqual([[true], [false]]);
    });

    it('surfaces a waitlist removal failure and clears loading state', async () => {
        mockedRemoveWaitlist.mockRejectedValue(new Error('Waitlist unavailable.'));
        const actions = makeActions();

        await actions.handleLeaveWaitlist();

        expect(setJoinError).toHaveBeenLastCalledWith('Waitlist unavailable.');
        expect(setJoining).toHaveBeenLastCalledWith(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it('leaves the free-agent list and reloads', async () => {
        const actions = makeActions();

        await actions.handleLeaveFreeAgents();

        expect(mockedRemoveFreeAgent).toHaveBeenCalledWith('event_1', 'user_1', occurrence);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('adds an adult to the free-agent list without registration checkout', async () => {
        const actions = makeActions();

        await actions.handleJoinFreeAgents();

        expect(mockedAddFreeAgent).toHaveBeenCalledWith('event_1', 'user_1', occurrence);
        expect(mockedRegisterSelf).not.toHaveBeenCalled();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('routes a minor through registration questions before joining', async () => {
        shouldAskRegistrationQuestions.mockReturnValue(true);
        const actions = makeActions({ isMinor: true });

        await actions.handleJoinFreeAgents();

        expect(openRegistrationQuestionsStep).toHaveBeenCalledWith({ mode: 'user' });
        expect(mockedRegisterSelf).not.toHaveBeenCalled();
        expect(setJoining).not.toHaveBeenCalled();
    });

    it('creates a parent-approved minor registration after questions are complete', async () => {
        const actions = makeActions({ isMinor: true });

        await actions.handleJoinFreeAgents();

        expect(mockedRegisterSelf).toHaveBeenCalledWith(
            'event_1',
            { divisionId: 'division_1', divisionTypeId: 'type_1' },
        );
        expect(setJoinNotice).toHaveBeenCalledWith(
            'Join request sent. A parent/guardian can approve it from their child management page.',
        );
        expect(mockedAddFreeAgent).not.toHaveBeenCalled();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reports a blocking reason before any free-agent mutation', async () => {
        const actions = makeActions({ freeAgentJoinBlockedReason: 'Select a weekly session.' });

        await actions.handleJoinFreeAgents();

        expect(setJoinError).toHaveBeenCalledWith('Select a weekly session.');
        expect(mockedAddFreeAgent).not.toHaveBeenCalled();
        expect(mockedRegisterSelf).not.toHaveBeenCalled();
    });
});
