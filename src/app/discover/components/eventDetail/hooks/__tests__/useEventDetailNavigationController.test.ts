import { act, renderHook } from '@testing-library/react';

import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { buildEvent, buildUser } from '../../../../../../../test/factories';
import { useInlineEventAuthController } from '../useInlineEventAuthController';
import { useEventDetailNavigationController } from '../useEventDetailNavigationController';

const mockPush = jest.fn();
const mockOpenAuth = jest.fn();

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/publicCompletionRedirect', () => ({
    navigateToPublicCompletion: jest.fn(),
}));

jest.mock('../useInlineEventAuthController', () => ({
    useInlineEventAuthController: jest.fn(() => ({
        open: mockOpenAuth,
    })),
}));

function buildArgs(overrides: Record<string, unknown> = {}) {
    return {
        event: buildEvent({ $id: 'event-one', eventType: 'LEAGUE' }),
        user: buildUser({ $id: 'user-one' }),
        refreshSession: jest.fn().mockResolvedValue(undefined),
        onClose: jest.fn(),
        onWeeklyOccurrenceChange: undefined,
        publicCompletion: undefined,
        clearRegistrationProgress: jest.fn(),
        setJoinError: jest.fn(),
        setJoinNotice: jest.fn(),
        ...overrides,
    };
}

const weeklySession = {
    id: 'slot-one:2026-07-16',
    slotId: 'slot-one',
    occurrenceDate: '2026-07-16',
    start: new Date('2026-07-16T18:00:00'),
    end: new Date('2026-07-16T19:00:00'),
    label: 'Thu 7/16/26, 6:00pm-7:00pm',
    divisionLabel: 'Open',
};

describe('useEventDetailNavigationController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-07-14T12:00:00'));
        window.history.replaceState({}, '', '/discover?view=event#details');
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('owns schedule and tournament bracket navigation while closing the sheet', () => {
        const args = buildArgs({
            event: buildEvent({ $id: 'tournament-one', eventType: 'TOURNAMENT' }),
        });
        const { result } = renderHook(() => useEventDetailNavigationController(args));

        act(() => result.current.viewSchedule());
        act(() => result.current.viewBracket());

        expect(mockPush).toHaveBeenNthCalledWith(1, '/events/tournament-one');
        expect(mockPush).toHaveBeenNthCalledWith(2, '/events/tournament-one?tab=bracket');
        expect(args.onClose).toHaveBeenCalledTimes(2);
        expect(result.current.maxAuthDob).toBe('2026-07-14');
    });

    it('publishes a weekly occurrence through the parent callback without navigating', () => {
        const onWeeklyOccurrenceChange = jest.fn();
        const args = buildArgs({
            event: buildEvent({ $id: 'weekly-one', eventType: 'WEEKLY_EVENT', parentEvent: undefined }),
            onWeeklyOccurrenceChange,
        });
        const { result } = renderHook(() => useEventDetailNavigationController(args));

        act(() => result.current.selectWeeklySession(weeklySession));

        expect(args.setJoinError).toHaveBeenCalledWith(null);
        expect(args.setJoinNotice).toHaveBeenCalledWith(null);
        expect(onWeeklyOccurrenceChange).toHaveBeenCalledWith({
            slotId: 'slot-one',
            occurrenceDate: '2026-07-16',
        });
        expect(mockPush).not.toHaveBeenCalled();
        expect(args.onClose).not.toHaveBeenCalled();
    });

    it('opens authentication for a signed-out weekly selection', () => {
        const args = buildArgs({
            event: buildEvent({ $id: 'weekly-one', eventType: 'WEEKLY_EVENT', parentEvent: undefined }),
            user: null,
        });
        const { result } = renderHook(() => useEventDetailNavigationController(args));

        act(() => result.current.selectWeeklySession(weeklySession));

        expect(mockOpenAuth).toHaveBeenCalledTimes(1);
        expect(mockPush).not.toHaveBeenCalled();
        expect(args.onClose).not.toHaveBeenCalled();
    });

    it('routes a signed-in weekly selection to its exact occurrence', () => {
        const args = buildArgs({
            event: buildEvent({ $id: 'weekly-one', eventType: 'WEEKLY_EVENT', parentEvent: undefined }),
        });
        const { result } = renderHook(() => useEventDetailNavigationController(args));

        act(() => result.current.selectWeeklySession(weeklySession));

        expect(args.setJoinNotice).toHaveBeenLastCalledWith(
            'Session selected. Finish registration on the event page.',
        );
        expect(mockPush).toHaveBeenCalledWith(
            '/events/weekly-one?tab=schedule&slotId=slot-one&occurrenceDate=2026-07-16',
        );
        expect(args.onClose).toHaveBeenCalledTimes(1);
    });

    it('owns auth feedback, profile continuation, and public completion routing', () => {
        const clearRegistrationProgress = jest.fn();
        const args = buildArgs({
            publicCompletion: { slug: 'summer-event', redirectUrl: 'https://example.test/thanks' },
            clearRegistrationProgress,
        });
        const { result } = renderHook(() => useEventDetailNavigationController(args));
        const authOptions = (useInlineEventAuthController as jest.Mock).mock.calls[0][0];

        act(() => {
            authOptions.onAuthenticated();
            authOptions.onSignedIn();
            authOptions.onProfileCompletionRequired();
            result.current.navigateToCompletion();
        });

        expect(args.setJoinError).toHaveBeenCalledWith(null);
        expect(args.setJoinNotice).toHaveBeenCalledWith('Signed in. Continue registration.');
        expect(mockPush).toHaveBeenCalledWith(
            '/complete-profile?next=%2Fdiscover%3Fview%3Devent%23details',
        );
        expect(clearRegistrationProgress).toHaveBeenCalledTimes(1);
        expect(navigateToPublicCompletion).toHaveBeenCalledWith({
            router: expect.objectContaining({ push: mockPush }),
            slug: 'summer-event',
            kind: 'event',
            redirectUrl: 'https://example.test/thanks',
        });
    });
});
