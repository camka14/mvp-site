import { serializeMatchesLegacy } from '../serialize';
import { Division, Match, Team, UserData } from '../types';

describe('scheduler legacy serialization', () => {
  it('includes roster players and registrations for match scoring dialogs', () => {
    const division = new Division('open', 'Open');
    const player = new UserData({
      id: 'player_1',
      firstName: 'Alex',
      lastName: 'Morgan',
      userName: 'alexm',
      divisions: [division],
    });
    const team = new Team({
      id: 'team_1',
      captainId: 'player_1',
      division,
      name: 'Aces',
      playerIds: ['player_1'],
      players: [player],
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        jerseyNumber: '9',
        position: 'Forward',
      }],
    });
    const match = new Match({
      id: 'match_1',
      matchId: 1,
      start: new Date('2026-03-01T10:00:00.000Z'),
      end: new Date('2026-03-01T11:00:00.000Z'),
      division,
      team1: team,
      team2: null,
      team1Points: [0],
      team2Points: [0],
      setResults: [0],
      bufferMs: 0,
      eventId: 'event_1',
    });

    const [serialized] = serializeMatchesLegacy([match]);

    expect(serialized.team1).toEqual(expect.objectContaining({
      $id: 'team_1',
      playerIds: ['player_1'],
      players: [expect.objectContaining({
        $id: 'player_1',
        firstName: 'Alex',
        lastName: 'Morgan',
      })],
      playerRegistrations: [expect.objectContaining({
        id: 'registration_1',
        userId: 'player_1',
        jerseyNumber: '9',
        position: 'Forward',
      })],
    }));
  });
});
