import { eventService } from '@/lib/eventService';
import { apiRequest } from '@/lib/apiClient';
import { sportsService } from '@/lib/sportsService';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('@/lib/sportsService', () => ({
  sportsService: {
    getAll: jest.fn(),
  },
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;
const sportsServiceMock = sportsService as jest.Mocked<typeof sportsService>;

const baseEventRow = {
  $id: 'evt_1',
  name: 'Test Event',
  description: 'Desc',
  start: '2025-01-01T00:00:00Z',
  end: '2025-01-01T01:00:00Z',
  location: 'Denver',
  coordinates: [0, 0],
  price: 1000,
  imageId: 'img_1',
  hostId: 'host_1',
  state: 'PUBLISHED',
  maxParticipants: 10,
  teamSizeLimit: 6,
  restTimeMinutes: 0,
  teamSignup: false,
  singleDivision: false,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: 0,
  registrationCutoffHours: 0,
  seedColor: 0,
  $createdAt: '2025-01-01T00:00:00Z',
  $updatedAt: '2025-01-01T00:00:00Z',
  eventType: 'EVENT',
  sport: { $id: 'sport_1', name: 'Volleyball' },
  divisions: [],
};

describe('eventService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    sportsServiceMock.getAll.mockResolvedValue([] as any);
  });

  it('fetches event by id via apiRequest', async () => {
    apiRequestMock.mockResolvedValue({ ...baseEventRow });

    const event = await eventService.getEvent('evt_1');

    expect(apiRequestMock).toHaveBeenCalledWith('/api/events/evt_1');
    expect(event?.$id).toBe('evt_1');
  });

  it('creates event via apiRequest', async () => {
    apiRequestMock.mockResolvedValue({ event: { ...baseEventRow } });

    const created = await eventService.createEvent({
      $id: 'evt_1',
      name: 'Test Event',
      description: 'Desc',
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T01:00:00Z',
      location: 'Denver',
      coordinates: [0, 0],
      price: 1000,
      imageId: 'img_1',
      hostId: 'host_1',
      state: 'PUBLISHED',
      maxParticipants: 10,
      teamSizeLimit: 6,
      teamSignup: false,
      singleDivision: false,
      waitListIds: [],
      freeAgentIds: [],
      cancellationRefundHours: 0,
      registrationCutoffHours: 0,
      seedColor: 0,
      eventType: 'EVENT',
      sport: { $id: 'sport_1', name: 'Volleyball' },
      divisions: [],
    } as any);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' }));
    expect(created.$id).toBe('evt_1');
  });

  it('sends division pricing and league scoring updates when updating an event', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ ...baseEventRow })
      .mockResolvedValueOnce({
        ...baseEventRow,
        eventType: 'LEAGUE',
        leagueScoringConfigId: 'cfg_1',
      });

    await eventService.updateEvent('evt_1', {
      ...baseEventRow,
      eventType: 'LEAGUE',
      divisions: ['evt_1__division__open'],
      divisionDetails: [
        {
          id: 'evt_1__division__open',
          key: 'open',
          name: 'Open',
          price: 2500,
          maxParticipants: 14,
          playoffTeamCount: 8,
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [1500, 1000],
          installmentDueDates: ['2025-01-02T00:00:00Z', '2025-01-09T00:00:00Z'],
          fieldIds: [],
        } as any,
      ],
      leagueScoringConfigId: 'cfg_1',
      leagueScoringConfig: {
        $id: 'cfg_1',
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
      } as any,
    } as any);

    expect(apiRequestMock).toHaveBeenCalledTimes(3);

    const [url, options] = apiRequestMock.mock.calls[0];
    expect(url).toBe('/api/events/evt_1');
    expect(options?.method).toBe('PATCH');
    expect(options?.body).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          eventType: 'LEAGUE',
          leagueScoringConfigId: 'cfg_1',
          leagueScoringConfig: expect.objectContaining({
            pointsForWin: 3,
            pointsForDraw: 1,
            pointsForLoss: 0,
          }),
          divisionDetails: [
            expect.objectContaining({
              id: 'evt_1__division__open',
              price: 2500,
              maxParticipants: 14,
              playoffTeamCount: 8,
              allowPaymentPlans: true,
              installmentCount: 2,
              installmentAmounts: [1500, 1000],
              installmentDueDates: ['2025-01-02T00:00:00Z', '2025-01-09T00:00:00Z'],
            }),
          ],
        }),
      }),
    );
    expect(apiRequestMock.mock.calls[1][0]).toBe('/api/events/evt_1');
    expect(apiRequestMock.mock.calls[2][0]).toBe('/api/league-scoring-configs/cfg_1');
  });

  it('maps template rows without sport data using a fallback sport object', async () => {
    const rowWithoutSport = {
      ...baseEventRow,
      state: 'TEMPLATE',
      sport: undefined,
      sportId: undefined,
    };

    const event = await eventService.mapRowFromDatabase(rowWithoutSport, false);

    expect(event.state).toBe('TEMPLATE');
    expect(event.sport).toBeDefined();
    expect(event.sport.$id).toBe('');
    expect(event.sport.name).toBe('');
    expect(sportsServiceMock.getAll).not.toHaveBeenCalled();
  });

  it('maps template rows when sport id cannot be resolved', async () => {
    sportsServiceMock.getAll.mockResolvedValueOnce([] as any).mockResolvedValueOnce([] as any);

    const rowWithUnknownSport = {
      ...baseEventRow,
      state: 'TEMPLATE',
      sport: undefined,
      sportId: 'unknown_sport',
    };

    const event = await eventService.mapRowFromDatabase(rowWithUnknownSport, false);

    expect(event.state).toBe('TEMPLATE');
    expect(event.sport.$id).toBe('unknown_sport');
    expect(event.sport.name).toBe('unknown_sport');
  });

  it('preserves split playoff division settings when mapping event rows', async () => {
    apiRequestMock.mockResolvedValue({
      ...baseEventRow,
      eventType: 'LEAGUE',
      splitLeaguePlayoffDivisions: true,
      playoffDivisionDetails: [
        {
          id: 'evt_1__playoff__gold',
          name: 'Gold Playoff',
          key: 'gold',
          maxParticipants: '8',
          playoffTeamCount: '4',
          teamIds: ['team_1', 'team_2', '', null],
          playoffConfig: {
            doubleElimination: true,
            winnerSetCount: 1,
            loserSetCount: 1,
            winnerBracketPointsToVictory: [21],
            loserBracketPointsToVictory: [21],
            prize: '',
            fieldCount: 1,
            restTimeMinutes: 0,
          },
        },
      ],
    });

    const event = await eventService.getEvent('evt_1');

    expect(event?.splitLeaguePlayoffDivisions).toBe(true);
    expect(event?.playoffDivisionDetails).toHaveLength(1);
    expect(event?.playoffDivisionDetails?.[0]).toEqual(
      expect.objectContaining({
        id: 'evt_1__playoff__gold',
        name: 'Gold Playoff',
        key: 'gold',
        kind: 'PLAYOFF',
        maxParticipants: 8,
        playoffTeamCount: 4,
        teamIds: ['team_1', 'team_2'],
      }),
    );
    expect((event?.playoffDivisionDetails?.[0] as any)?.playoffConfig).toEqual(
      expect.objectContaining({
        doubleElimination: true,
      }),
    );
  });

  it('prefers explicit attendee counts from API payloads', async () => {
    apiRequestMock.mockResolvedValue({
      ...baseEventRow,
      eventType: 'LEAGUE',
      teamSignup: true,
      teamIds: ['slot_1', 'slot_2', 'slot_3'],
      attendees: 2,
    });

    const event = await eventService.getEvent('evt_1');

    expect(event?.attendees).toBe(2);
  });
});
