import { renderHook } from '@testing-library/react';

import type { FamilyChild } from '@/lib/familyService';
import { buildEvent, buildTeam, buildUser } from '../../../../../../../test/factories';
import { useEventParticipantModel } from '../useEventParticipantModel';

const futureStart = new Date('2099-08-01T19:00:00.000Z');

function child(overrides: Partial<FamilyChild> = {}): FamilyChild {
    return {
        userId: 'child-one',
        firstName: 'Avery',
        lastName: 'Rivera',
        dateOfBirth: '2088-01-01',
        linkStatus: 'ACTIVE',
        ...overrides,
    } as FamilyChild;
}

function renderModel({
    event = buildEvent({
        start: futureStart.toISOString(),
        teamSignup: false,
        maxParticipants: 4,
    }),
    user = buildUser({ $id: 'viewer-one' }),
    players = [] as ReturnType<typeof buildUser>[],
    teams = [] as ReturnType<typeof buildTeam>[],
    freeAgents = [] as ReturnType<typeof buildUser>[],
    children = [] as FamilyChild[],
    selectedChildId = '',
    childRegistrationChildId = null as string | null,
    canRegisterChild = true,
}: Partial<Parameters<typeof useEventParticipantModel>[0]> = {}) {
    return renderHook(() => useEventParticipantModel({
        event,
        user,
        players,
        teams,
        freeAgents,
        children,
        childrenLoading: false,
        childrenError: null,
        selectedChildId,
        childRegistrationChildId,
        eventStartDate: futureStart,
        eventMinAge: undefined,
        eventMaxAge: undefined,
        hasAgeLimits: false,
        isTeamSignup: Boolean(event.teamSignup),
        selectedDivisionOption: null,
        canRegisterChild,
    }));
}

describe('useEventParticipantModel', () => {
    it('derives participant capacity and merges normalized free-agent sources', () => {
        const event = buildEvent({
            teamSignup: false,
            maxParticipants: 4,
            userIds: ['player-one'],
            freeAgentIds: ['agent-one'],
        });
        const { result } = renderModel({
            event,
            players: [buildUser({ $id: 'player-one' }), buildUser({ $id: 'player-two' })],
            freeAgents: [buildUser({ $id: 'agent-one' }), buildUser({ $id: 'agent-two' })],
        });

        expect(result.current.totalParticipants).toBe(2);
        expect(result.current.participantCapacity).toBe(4);
        expect(result.current.spotsLeft).toBe(2);
        expect(result.current.eventFillPercent).toBe(50);
        expect(result.current.normalizedFreeAgentIds).toEqual(['agent-one', 'agent-two']);
    });

    it('recognizes team membership, waitlist, and free-agent viewer states', () => {
        const viewer = buildUser({ $id: 'viewer-one' });
        const event = buildEvent({
            teamSignup: true,
            waitListIds: ['viewer-one'],
            freeAgentIds: ['viewer-one'],
        });
        const { result } = renderModel({
            event,
            user: viewer,
            teams: [buildTeam({ playerIds: ['viewer-one'] })],
        });

        expect(result.current.isUserRegistered).toBe(true);
        expect(result.current.isUserWaitlisted).toBe(true);
        expect(result.current.isUserFreeAgent).toBe(true);
        expect(result.current.hasRefundTarget).toBe(true);
    });

    it('keeps an ineligible linked child visible when the child already has event state', () => {
        const underageChild = child({
            userId: 'child-underage',
            dateOfBirth: '2095-01-01',
        });
        const event = buildEvent({
            teamSignup: false,
            minAge: 12,
            waitListIds: ['child-underage'],
        });
        const { result } = renderHook(() => useEventParticipantModel({
            event,
            user: buildUser(),
            players: [],
            teams: [],
            freeAgents: [],
            children: [underageChild],
            childrenLoading: false,
            childrenError: null,
            selectedChildId: 'child-underage',
            childRegistrationChildId: null,
            eventStartDate: futureStart,
            eventMinAge: 12,
            eventMaxAge: undefined,
            hasAgeLimits: true,
            isTeamSignup: false,
            selectedDivisionOption: null,
            canRegisterChild: true,
        }));

        expect(result.current.childOptions).toEqual([
            expect.objectContaining({ value: 'child-underage' }),
        ]);
        expect(result.current.selectedChildEligible).toBe(false);
        expect(result.current.selectedChildIsWaitlisted).toBe(true);
        expect(result.current.hasRefundTarget).toBe(true);
    });

    it('exposes selected-child registration and completion status independently', () => {
        const linkedChild = child();
        const { result } = renderModel({
            event: buildEvent({ teamSignup: false, userIds: ['child-one'] }),
            players: [buildUser({ $id: 'child-one' })],
            children: [linkedChild],
            selectedChildId: 'child-one',
            childRegistrationChildId: 'child-one',
        });

        expect(result.current.selectedChildIsRegistered).toBe(true);
        expect(result.current.showChildRegistrationStatus).toBe(true);
        expect(result.current.shouldShowChildRegistrationPanel).toBe(true);
    });
});
