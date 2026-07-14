import { buildEvent, buildTeam, buildUser } from '../../../../../../test/factories';
import {
    buildEmptyParticipantEventData,
    buildEventDetailsLoadKey,
    buildParticipantEventData,
    collectUniqueUserIds,
    getManagedUserTeamsForEvent,
} from '../eventDetailData';

describe('event detail data helpers', () => {
    it('builds stable event and weekly-occurrence load keys', () => {
        expect(buildEventDetailsLoadKey(' event_1 ')).toBe('event_1:all');
        expect(buildEventDetailsLoadKey('event_1', {
            slotId: ' slot_1 ',
            occurrenceDate: ' 2026-07-21 ',
        })).toBe('event_1:slot_1:2026-07-21');
        expect(buildEventDetailsLoadKey('')).toBeNull();
    });

    it('selects only sport-matching teams managed by the current user', () => {
        const event = buildEvent({ sport: 'Volleyball' });
        const managedVolleyball = buildTeam({
            $id: 'team_managed',
            sport: 'volleyball',
            managerId: 'user_1',
        });
        const coachedVolleyball = buildTeam({
            $id: 'team_coached',
            sport: 'VOLLEYBALL',
            assistantCoachIds: ['user_1'],
        } as any);
        const wrongSport = buildTeam({
            $id: 'team_wrong_sport',
            sport: 'Basketball',
            managerId: 'user_1',
        });
        const unmanaged = buildTeam({
            $id: 'team_unmanaged',
            sport: 'Volleyball',
            managerId: 'user_2',
        });

        expect(getManagedUserTeamsForEvent(
            [managedVolleyball, coachedVolleyball, wrongSport, unmanaged],
            event,
            'user_1',
        ).map((team) => team.$id)).toEqual(['team_managed', 'team_coached']);
    });

    it('normalizes, orders, and projects canonical participant data', () => {
        const event = buildEvent({ $id: 'event_1' });
        const userOne = buildUser({ $id: 'user_1' });
        const userTwo = buildUser({ $id: '' }) as ReturnType<typeof buildUser> & { id: string };
        userTwo.id = 'user_2';
        const teamOne = buildTeam({ $id: '' }) as ReturnType<typeof buildTeam> & { id: string };
        teamOne.id = 'team_1';

        const result = buildParticipantEventData(event, {
            participants: {
                teamIds: ['team_1', 'team_1'],
                userIds: ['user_2', 'user_1'],
                waitListIds: ['wait_1'],
                freeAgentIds: ['user_1'],
                divisions: [],
            },
            registrations: {
                teams: [{ registrantId: 'team_1', status: 'PAYMENT_FAILED' }],
                users: [{ registrantId: 'user_2', status: 'PAYMENT_FAILED' }],
                children: [],
                waitlist: [],
                freeAgents: [],
            },
            teams: [teamOne],
            users: [userOne, userTwo],
            participantCount: 3,
            participantCapacity: 8,
            occurrence: null,
            divisionWarnings: [],
        } as any, 'user_2');

        expect(result.teams.map((team) => team.$id)).toEqual(['team_1']);
        expect(result.players.map((user) => user.$id)).toEqual(['user_2', 'user_1']);
        expect(result.freeAgents.map((user) => user.$id)).toEqual(['user_1']);
        expect(result.event).toEqual(expect.objectContaining({
            teamIds: ['team_1'],
            userIds: ['user_2', 'user_1'],
            waitListIds: ['wait_1'],
            freeAgentIds: ['user_1'],
            participantCount: 3,
            participantCapacity: 8,
        }));
        expect(result.currentUserPaymentFailed).toBe(true);
        expect(result.paymentFailedTeamIds).toEqual(['team_1']);
    });

    it('clears occurrence participants without mutating the source event', () => {
        const event = buildEvent({
            teamIds: ['team_1'],
            userIds: ['user_1'],
            waitListIds: ['wait_1'],
            freeAgentIds: ['free_1'],
        });

        const result = buildEmptyParticipantEventData(event);

        expect(collectUniqueUserIds([' user_1 ', '', 'user_1', null])).toEqual(['user_1']);
        expect(result.event).toEqual(expect.objectContaining({
            teamIds: [],
            userIds: [],
            waitListIds: [],
            freeAgentIds: [],
        }));
        expect(event.teamIds).toEqual(['team_1']);
    });
});
