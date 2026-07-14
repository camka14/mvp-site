import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { eventService } from '@/lib/eventService';
import type { Event, UserData } from '@/types';

import {
    isTargetTeamInParticipantSnapshot,
    useRegistrationConfirmationController,
} from '../useRegistrationConfirmationController';

jest.mock('@/lib/eventService', () => ({
    eventService: {
        getEventParticipants: jest.fn(),
        getEventWithRelations: jest.fn(),
    },
}));

const mockedGetParticipants = eventService.getEventParticipants as jest.MockedFunction<
    typeof eventService.getEventParticipants
>;
const mockedGetEvent = eventService.getEventWithRelations as jest.MockedFunction<
    typeof eventService.getEventWithRelations
>;

const user = { $id: 'user_1' } as UserData;
const event = { $id: 'event_1', teamSignup: false } as Event;
const reload = jest.fn();
const navigateToCompletion = jest.fn();
const setConfirming = jest.fn();

function participantSnapshot({
    userIds = [],
    teamIds = [],
    teams = [],
}: {
    userIds?: string[];
    teamIds?: string[];
    teams?: Array<{ $id?: string; id?: string; parentTeamId?: string }>;
}) {
    return {
        participants: { userIds, teamIds },
        teams,
    } as unknown as Awaited<ReturnType<typeof eventService.getEventParticipants>>;
}

function useHarness({
    activeEvent = event,
    selectedTeamId = '',
    timeoutMs = 30_000,
}: {
    activeEvent?: Event;
    selectedTeamId?: string;
    timeoutMs?: number;
} = {}) {
    const [joinError, setJoinError] = useState<string | null>('old error');
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const controller = useRegistrationConfirmationController({
        event: activeEvent,
        user,
        selectedTeamId,
        occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        reload,
        navigateToCompletion,
        setConfirming,
        setJoinError,
        setJoinNotice,
        timeoutMs,
        pollIntervalMs: 1,
    });
    return { controller, joinError, joinNotice };
}

describe('useRegistrationConfirmationController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        reload.mockResolvedValue(undefined);
    });

    it('recognizes canonical, legacy, and parent team identities in a participant snapshot', () => {
        expect(isTargetTeamInParticipantSnapshot({
            targetTeamId: 'team_parent',
            teamIds: ['team_direct'],
            teams: [
                { $id: 'event_team', parentTeamId: 'team_parent' },
                { id: 'legacy_team' },
            ],
        })).toBe(true);
        expect(isTargetTeamInParticipantSnapshot({
            targetTeamId: 'legacy_team',
            teamIds: [],
            teams: [{ id: 'legacy_team' }],
        })).toBe(true);
    });

    it('reloads and navigates when a weekly participant snapshot confirms the user', async () => {
        mockedGetParticipants.mockResolvedValue(participantSnapshot({ userIds: ['user_1'] }));
        const { result } = renderHook(() => useHarness());

        await act(async () => {
            await result.current.controller.confirmRegistrationAfterPayment();
        });

        expect(mockedGetParticipants).toHaveBeenCalledWith(
            'event_1',
            { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        );
        expect(reload).toHaveBeenCalledTimes(1);
        expect(navigateToCompletion).toHaveBeenCalledTimes(1);
        expect(result.current.joinError).toBeNull();
        expect(setConfirming).toHaveBeenNthCalledWith(1, true);
        expect(setConfirming).toHaveBeenLastCalledWith(false);
    });

    it('reports pending bank payment without navigating after confirmation', async () => {
        mockedGetParticipants.mockResolvedValue(participantSnapshot({ userIds: ['user_1'] }));
        const { result } = renderHook(() => useHarness());

        await act(async () => {
            await result.current.controller.confirmRegistrationAfterPayment({ pendingPayment: true });
        });

        expect(result.current.joinNotice).toBe(
            'Payment submitted. Your registration is pending until the bank payment clears.',
        );
        expect(navigateToCompletion).not.toHaveBeenCalled();
    });

    it('requires a team before polling a team registration', async () => {
        const { result } = renderHook(() => useHarness({
            activeEvent: { ...event, teamSignup: true } as Event,
        }));

        await act(async () => {
            await result.current.controller.confirmRegistrationAfterPayment();
        });

        expect(result.current.joinError).toBe('Team is required to complete registration.');
        expect(mockedGetParticipants).not.toHaveBeenCalled();
        expect(setConfirming).toHaveBeenLastCalledWith(false);
    });

    it('reports a bounded timeout when registration never appears', async () => {
        const { result } = renderHook(() => useHarness({ timeoutMs: 0 }));

        await act(async () => {
            await result.current.controller.confirmRegistrationAfterPayment();
        });

        expect(result.current.joinError).toBe('Timed out');
        expect(mockedGetParticipants).not.toHaveBeenCalled();
    });

    it('rejects a deferred participant response after the event scope changes', async () => {
        let resolveSnapshot!: (
            value: Awaited<ReturnType<typeof eventService.getEventParticipants>>,
        ) => void;
        mockedGetParticipants.mockReturnValue(new Promise((resolve) => {
            resolveSnapshot = resolve;
        }));
        const { result, rerender } = renderHook(
            ({ activeEvent }) => useHarness({ activeEvent }),
            { initialProps: { activeEvent: event } },
        );

        let confirmation!: Promise<void>;
        act(() => {
            confirmation = result.current.controller.confirmRegistrationAfterPayment();
        });
        rerender({ activeEvent: { ...event, $id: 'event_2' } as Event });

        await act(async () => {
            resolveSnapshot(participantSnapshot({ userIds: ['user_1'] }));
            await confirmation;
        });

        expect(reload).not.toHaveBeenCalled();
        expect(navigateToCompletion).not.toHaveBeenCalled();
        expect(setConfirming).not.toHaveBeenCalledWith(false);
        expect(mockedGetEvent).not.toHaveBeenCalled();
    });
});
