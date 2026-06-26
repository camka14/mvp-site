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
  cancellationRefundHours: null,
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

  it('preserves rental booking metadata for overlap-only field blockers', async () => {
    apiRequestMock.mockResolvedValue({
      events: [
        {
          $id: 'rental-booking-item-booking_item_1',
          id: 'rental-booking-item-booking_item_1',
          eventType: 'EVENT',
          start: '2026-06-24T03:00:00.000Z',
          end: '2026-06-24T04:30:00.000Z',
          timeSlotIds: [],
          timeSlots: [],
          sourceType: 'RENTAL_BOOKING',
          sourceId: 'rental_booking_1',
          rentalBookingId: 'rental_booking_1',
          rentalBookingItemId: 'booking_item_1',
        },
      ],
      rentalSlots: [],
    });

    const events = await eventService.getEventsForFieldInRange(
      'field_1',
      '2026-06-24T00:00:00.000Z',
      '2026-06-25T00:00:00.000Z',
      { rentalOverlapOnly: true },
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/events/field/field_1?'),
    );
    expect(apiRequestMock.mock.calls[0]?.[0]).toContain('rentalOverlapOnly=1');
    expect(events[0]).toEqual(expect.objectContaining({
      sourceType: 'RENTAL_BOOKING',
      sourceId: 'rental_booking_1',
      rentalBookingId: 'rental_booking_1',
      rentalBookingItemId: 'booking_item_1',
    }));
  });

  it('deduplicates concurrent paginated event searches', async () => {
    let resolveRequest: ((value: { events?: any[] }) => void) | undefined;
    apiRequestMock.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = eventService.getEventsPaginated({
      dateFrom: '2026-05-19T07:00:00.000Z',
      userLocation: { lat: 45.5152, lng: -122.6784 },
    }, 18, 0);
    const second = eventService.getEventsPaginated({
      userLocation: { lng: -122.6784, lat: 45.5152 },
      dateFrom: '2026-05-19T07:00:00.000Z',
    }, 18, 0);

    await Promise.resolve();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    resolveRequest?.({ events: [{ ...baseEventRow }] });
    const [firstEvents, secondEvents] = await Promise.all([first, second]);

    expect(firstEvents.map((event) => event.$id)).toEqual(['evt_1']);
    expect(secondEvents.map((event) => event.$id)).toEqual(['evt_1']);

    apiRequestMock.mockResolvedValue({ events: [{ ...baseEventRow, $id: 'evt_2' }] });
    const cachedEvents = await eventService.getEventsPaginated({
      dateFrom: '2026-05-19T07:00:00.000Z',
      userLocation: { lat: 45.5152, lng: -122.6784 },
    }, 18, 0);
    expect(cachedEvents.map((event) => event.$id)).toEqual(['evt_1']);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    await eventService.getEventsPaginated({
      dateFrom: '2026-05-19T07:00:00.000Z',
      userLocation: { lat: 45.5152, lng: -122.6784 },
    }, 18, 18);

    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });

  it('returns pagination metadata for event search pages with legacy response fallback', async () => {
    apiRequestMock.mockResolvedValueOnce({
      events: [{ ...baseEventRow }],
      pagination: { hasMore: true, nextOffset: 1 },
    });

    const page = await eventService.getEventsPage({
      query: 'metadata-page',
    }, 18, 0);

    expect(page.events.map((event) => event.$id)).toEqual(['evt_1']);
    expect(page.pagination).toEqual({ hasMore: true, nextOffset: 1 });

    apiRequestMock.mockResolvedValueOnce({
      events: [
        { ...baseEventRow, $id: 'evt_2' },
        { ...baseEventRow, $id: 'evt_3', sport: undefined, sportId: undefined },
      ],
    });

    const legacyPage = await eventService.getEventsPage({
      query: 'legacy-page',
    }, 2, 4);

    expect(legacyPage.events.map((event) => event.$id)).toEqual(['evt_2', 'evt_3']);
    expect(legacyPage.pagination).toEqual({ hasMore: true, nextOffset: 6 });
    expect(legacyPage.events[1]?.sport).toEqual(expect.objectContaining({
      $id: 'other',
      name: 'Other',
    }));
  });

  it('uses the extended timeout when scheduling an event', async () => {
    apiRequestMock.mockResolvedValue({
      preview: false,
      event: { ...baseEventRow, id: 'evt_1' },
      matches: [],
    });

    await eventService.scheduleEvent(
      {
        $id: 'evt_1',
        name: 'Test Event',
        eventType: 'LEAGUE',
        divisions: [],
        fields: [],
        timeSlots: [],
      },
      { eventId: 'evt_1' },
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/events/evt_1/schedule',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 60_000,
      }),
    );
  });

  it('sends the no-placeholder scheduling option when requested', async () => {
    apiRequestMock.mockResolvedValue({
      preview: false,
      event: { ...baseEventRow, id: 'evt_1' },
      matches: [],
    });

    await eventService.scheduleEvent(
      {
        $id: 'evt_1',
        name: 'Test Event',
        eventType: 'LEAGUE',
        divisions: [],
        fields: [],
        timeSlots: [],
      },
      { eventId: 'evt_1', includePlaceholderTeams: false },
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/events/evt_1/schedule',
      expect.objectContaining({
        body: expect.objectContaining({
          includePlaceholderTeams: false,
        }),
      }),
    );
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
      cancellationRefundHours: null,
      registrationCutoffHours: 0,
      seedColor: 0,
      eventType: 'EVENT',
      sport: { $id: 'sport_1', name: 'Volleyball' },
      divisions: [],
    } as any);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' }));
    const createCall = apiRequestMock.mock.calls[0][1];
    expect(createCall?.body).toEqual(
      expect.objectContaining({
        id: 'evt_1',
        event: expect.any(Object),
      }),
    );
    expect(createCall?.body?.event?.fields).toBeUndefined();
    expect(createCall?.body?.newFields).toBeUndefined();
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
      organizationId: 'org_1',
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

  it('serializes a comprehensive event update without circular field references', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ ...baseEventRow })
      .mockResolvedValueOnce({
        ...baseEventRow,
        eventType: 'LEAGUE',
        leagueScoringConfigId: 'cfg_1',
      })
      .mockResolvedValueOnce({
        $id: 'cfg_1',
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
      });

    const field = {
      $id: 'field_1',
      name: 'Court 1',
      location: 'Denver',
      lat: 39.7392,
      long: -104.9903,
      heading: 90,
      inUse: true,
      divisions: [
        {
          id: 'evt_1__division__open',
          key: 'open',
          name: 'Open',
          fieldIds: ['field_1'],
        },
      ],
      rentalSlotIds: ['rental_1'],
    } as any;

    const match = {
      $id: 'match_1',
      eventId: 'evt_1',
      fieldId: 'field_1',
      team1Id: 'team_1',
      team2Id: 'team_2',
      startTime: '2025-01-01T00:00:00Z',
      endTime: '2025-01-01T01:00:00Z',
      field,
    } as any;

    field.matches = [match];

    const eventUpdate = {
      ...baseEventRow,
      name: 'Updated Event',
      description: 'Updated description',
      location: 'Aurora',
      address: '123 Main St',
      coordinates: [39.73, -104.99],
      price: 2500,
      minAge: 18,
      maxAge: 45,
      rating: 4.5,
      noFixedEndDateTime: false,
      maxParticipants: 16,
      teamSizeLimit: 6,
      restTimeMinutes: 15,
      teamSignup: true,
      singleDivision: false,
      waitListIds: ['user_wait_1'],
      freeAgentIds: ['user_free_1'],
      teamIds: ['team_1', 'team_2'],
      userIds: ['user_1', 'user_2'],
      timeSlotIds: ['slot_1'],
      officialIds: ['official_1'],
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'ref', name: 'Ref', count: 1, order: 0 },
      ],
      eventOfficials: [
        { id: 'assignment_1', userId: 'official_1', positionIds: ['ref'], fieldIds: ['field_1'], isActive: true },
      ],
      assistantHostIds: ['assistant_1'],
      cancellationRefundHours: 12,
      registrationCutoffHours: 24,
      seedColor: 7,
      eventType: 'LEAGUE',
      divisions: ['evt_1__division__open'],
      divisionDetails: [
        {
          id: 'evt_1__division__open',
          key: 'open',
          name: 'Open',
          price: 2500,
          maxParticipants: 16,
          playoffTeamCount: 8,
          gamesPerOpponent: 2,
          restTimeMinutes: 10,
          usesSets: true,
          setDurationMinutes: 25,
          setsPerMatch: 3,
          pointsToVictory: [21, 21, 15],
          playoffConfig: {
            doubleElimination: false,
            winnerSetCount: 1,
            loserSetCount: 1,
            winnerBracketPointsToVictory: [21],
            loserBracketPointsToVictory: [21],
            prize: '',
            fieldCount: 1,
            restTimeMinutes: 12,
          },
          allowPaymentPlans: true,
          installmentCount: 2,
          installmentAmounts: [1500, 1000],
          installmentDueDates: ['2025-01-02T00:00:00Z', '2025-01-09T00:00:00Z'],
          fieldIds: ['field_1'],
          teamIds: ['team_1', 'team_2'],
        },
      ],
      allowPaymentPlans: true,
      installmentCount: 2,
      installmentAmounts: [1500, 1000],
      installmentDueDates: ['2025-01-02T00:00:00Z', '2025-01-09T00:00:00Z'],
      allowTeamSplitDefault: true,
      registrationByDivisionType: false,
      splitLeaguePlayoffDivisions: false,
      gamesPerOpponent: 2,
      includePlayoffs: true,
      playoffTeamCount: 8,
      usesSets: true,
      matchDurationMinutes: 60,
      setDurationMinutes: 25,
      setsPerMatch: 3,
      doTeamsOfficiate: true,
      teamOfficialsMaySwap: true,
      pointsToVictory: [21, 21, 15],
      leagueScoringConfigId: 'cfg_1',
      leagueScoringConfig: {
        $id: 'cfg_1',
        pointsForWin: 3,
        pointsForDraw: 1,
        pointsForLoss: 0,
      },
      sport: { $id: 'sport_1', name: 'Volleyball' },
      fields: [field],
      matches: [match],
      timeSlots: [
        {
          $id: 'slot_1',
          dayOfWeek: 2,
          daysOfWeek: [2, 4],
          divisions: ['evt_1__division__open'],
          startTimeMinutes: 540,
          endTimeMinutes: 600,
          startDate: '2025-01-01',
          endDate: '2025-02-01',
          repeating: true,
          scheduledFieldId: 'field_1',
          scheduledFieldIds: ['field_1'],
          price: 0,
          requiredTemplateIds: ['template_1'],
          hostRequiredTemplateIds: ['template_host_1'],
          event: { $id: 'evt_1' },
        },
      ],
      requiredTemplateIds: ['template_event_1'],
      waitList: ['user_wait_legacy'],
      freeAgents: ['user_free_legacy'],
      attendees: 8,
      participantCount: 8,
      participantCapacity: 16,
      status: 'published',
      leagueConfig: { useHeadToHead: true },
      refType: 'legacy_ref',
      resolvedMatchRules: { scoringModel: 'POINTS' },
    } as any;

    await eventService.updateEvent('evt_1', eventUpdate, {
      fields: eventUpdate.fields,
      timeSlots: eventUpdate.timeSlots,
      leagueScoringConfig: eventUpdate.leagueScoringConfig,
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(3);

    const [, options] = apiRequestMock.mock.calls[0];
    expect(() => JSON.stringify(options?.body)).not.toThrow();
    expect(options?.method).toBe('PATCH');
    expect(options?.body).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          name: 'Updated Event',
          fields: [
            expect.objectContaining({
              $id: 'field_1',
              divisions: ['evt_1__division__open'],
              matchIds: ['match_1'],
            }),
          ],
          timeSlots: [
            expect.objectContaining({
              id: 'slot_1',
              dayOfWeek: 2,
              daysOfWeek: [2, 4],
              scheduledFieldId: 'field_1',
              scheduledFieldIds: ['field_1'],
            }),
          ],
          divisionDetails: [
            expect.objectContaining({
              id: 'evt_1__division__open',
              teamIds: ['team_1', 'team_2'],
              gamesPerOpponent: 2,
              restTimeMinutes: 10,
              usesSets: true,
              setDurationMinutes: 25,
              setsPerMatch: 3,
              pointsToVictory: [21, 21, 15],
              playoffConfig: expect.objectContaining({
                restTimeMinutes: 12,
              }),
            }),
          ],
          leagueScoringConfig: expect.objectContaining({
            pointsForWin: 3,
            pointsForDraw: 1,
            pointsForLoss: 0,
          }),
        }),
      }),
    );
    expect((options?.body as any)?.event?.fields?.[0]?.matches).toBeUndefined();
    expect((options?.body as any)?.event?.timeSlots?.[0]?.event).toBeUndefined();
    expect((options?.body as any)?.event?.waitList).toBeUndefined();
    expect((options?.body as any)?.event?.freeAgents).toBeUndefined();
    expect((options?.body as any)?.event?.attendees).toBeUndefined();
    expect((options?.body as any)?.event?.participantCount).toBeUndefined();
    expect((options?.body as any)?.event?.participantCapacity).toBeUndefined();
    expect((options?.body as any)?.event?.status).toBeUndefined();
    expect((options?.body as any)?.event?.leagueConfig).toBeUndefined();
    expect((options?.body as any)?.event?.divisionDetails?.[0]?.leagueConfig).toBeUndefined();
    expect((options?.body as any)?.event?.refType).toBeUndefined();
    expect((options?.body as any)?.event?.resolvedMatchRules).toBeUndefined();
    expect(apiRequestMock.mock.calls[1][0]).toBe('/api/events/evt_1');
    expect(apiRequestMock.mock.calls[2][0]).toBe('/api/league-scoring-configs/cfg_1');
  });

  it('strips event-level rental metadata while preserving rental timeslot metadata in event updates', async () => {
    apiRequestMock.mockResolvedValue({ ...baseEventRow });

    const rentalSlot = {
      $id: 'slot_rental_1',
      dayOfWeek: 2,
      daysOfWeek: [2],
      startTimeMinutes: 15 * 60,
      endTimeMinutes: 17 * 60,
      startDate: '2026-06-24T15:00:00.000Z',
      endDate: '2026-06-24T17:00:00.000Z',
      repeating: false,
      scheduledFieldId: 'field_regular_1',
      scheduledFieldIds: ['field_regular_1'],
      sourceType: 'RENTAL_BOOKING',
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'booking_item_1',
      rentalLocked: true,
    } as any;

    await eventService.updateEvent('evt_1', {
      ...baseEventRow,
      sourceType: 'RENTAL_BOOKING',
      sourceId: 'booking_1',
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'booking_item_1',
      timeSlots: [rentalSlot],
    } as any, {
      timeSlots: [rentalSlot],
    });

    const [, options] = apiRequestMock.mock.calls[0];
    const eventPayload = (options?.body as any)?.event;

    expect(eventPayload.sourceType).toBeUndefined();
    expect(eventPayload.sourceId).toBeUndefined();
    expect(eventPayload.rentalBookingId).toBeUndefined();
    expect(eventPayload.rentalBookingItemId).toBeUndefined();
    expect(eventPayload.timeSlots?.[0]).toEqual(expect.objectContaining({
      sourceType: 'RENTAL_BOOKING',
      rentalBookingId: 'booking_1',
      rentalBookingItemId: 'booking_item_1',
      rentalLocked: true,
    }));
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

  it('preserves private event state when mapping rows', async () => {
    const privateRow = {
      ...baseEventRow,
      state: 'PRIVATE',
    };

    const event = await eventService.mapRowFromDatabase(privateRow, false);

    expect(event.state).toBe('PRIVATE');
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

  it('preserves non-split league division playoff settings when mapping event rows', async () => {
    apiRequestMock.mockResolvedValue({
      ...baseEventRow,
      eventType: 'LEAGUE',
      splitLeaguePlayoffDivisions: false,
      divisionDetails: [
        {
          id: 'evt_1__division__open',
          name: 'Open',
          key: 'open',
          kind: 'LEAGUE',
          playoffTeamCount: 4,
          playoffConfig: {
            doubleElimination: false,
            winnerSetCount: 3,
            loserSetCount: 1,
            winnerBracketPointsToVictory: [25, 25, 15],
            loserBracketPointsToVictory: [25],
            prize: '',
            fieldCount: 1,
            restTimeMinutes: 18,
          },
        },
      ],
    });

    const event = await eventService.getEvent('evt_1');

    expect((event?.divisionDetails?.[0] as any)?.playoffConfig).toEqual(
      expect.objectContaining({
        winnerSetCount: 3,
        restTimeMinutes: 18,
      }),
    );
  });

  it('hydrates league playoff placement mappings from divisionDetails', async () => {
    apiRequestMock.mockResolvedValue({
      ...baseEventRow,
      eventType: 'LEAGUE',
      splitLeaguePlayoffDivisions: true,
      divisionDetails: [
        {
          id: 'evt_1__division__open',
          name: 'Open',
          key: 'open',
          kind: 'LEAGUE',
          playoffTeamCount: 4,
          playoffPlacementDivisionIds: [
            'evt_1__division__playoff_1',
            '',
            'evt_1__division__playoff_2',
            'evt_1__division__playoff_2',
          ],
        },
      ],
    });

    const event = await eventService.getEvent('evt_1');

    expect(event?.divisionDetails?.[0]).toEqual(
      expect.objectContaining({
        id: 'evt_1__division__open',
        kind: 'LEAGUE',
        playoffTeamCount: 4,
        playoffPlacementDivisionIds: [
          'evt_1__division__playoff_1',
          '',
          'evt_1__division__playoff_2',
          'evt_1__division__playoff_2',
        ],
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

  it('preserves persisted match rule settings when hydrating an event', async () => {
    const matchRulesOverride = {
      scoringModel: 'SETS',
      segmentCount: 3,
      supportsOvertime: true,
      supportedIncidentTypes: ['DISCIPLINE', 'NOTE', 'ADMIN'],
    };
    const resolvedMatchRules = {
      scoringModel: 'SETS',
      segmentCount: 3,
      segmentLabel: 'Set',
      supportsDraw: false,
      supportsOvertime: true,
      supportsShootout: false,
      canUseOvertime: true,
      canUseShootout: false,
      officialRoles: ['R1'],
      supportedIncidentTypes: ['DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'POINT',
      pointIncidentRequiresParticipant: true,
    };
    apiRequestMock.mockResolvedValue({
      ...baseEventRow,
      eventType: 'LEAGUE',
      matchRulesOverride,
      autoCreatePointMatchIncidents: true,
      resolvedMatchRules,
    });

    const event = await eventService.getEventWithRelations('evt_1');

    expect(event?.matchRulesOverride).toEqual(matchRulesOverride);
    expect(event?.autoCreatePointMatchIncidents).toBe(true);
    expect(event?.resolvedMatchRules).toEqual(resolvedMatchRules);
  });

  it('fetches event detail bootstrap with auto manage and hydrates relations from the payload', async () => {
    apiRequestMock.mockResolvedValue({
      event: {
        ...baseEventRow,
        fieldIds: ['field_1'],
        timeSlotIds: ['slot_1'],
        leagueScoringConfigId: 'league_config_1',
      },
      participantSnapshot: {
        participants: {
          teamIds: ['team_1'],
          userIds: ['user_1'],
          waitListIds: [],
          freeAgentIds: [],
          divisions: [],
        },
        teams: [{ id: 'team_1', name: 'River City FC' }],
        users: [{ id: 'user_1', firstName: 'Pat', lastName: 'Player' }],
        participantCount: 2,
        participantCapacity: 10,
        occurrence: null,
        divisionWarnings: [],
      },
      matches: [],
      fields: [{ id: 'field_1', name: 'Court 1' }],
      timeSlots: [{ id: 'slot_1', startDate: '2026-01-01T00:00:00.000Z' }],
      leagueScoringConfig: { id: 'league_config_1', pointsForWin: 3 },
      staffInvites: [{ id: 'invite_1' }],
      teamCompliance: null,
      userCompliance: { users: [{ userId: 'user_1', fullName: 'Pat Player' }] },
    });

    const bootstrap = await eventService.getEventDetailBootstrap(
      'evt_1',
      { slotId: 'slot_1', occurrenceDate: '2026-01-01' },
      { manage: 'auto' },
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/events/evt_1/detail?slotId=slot_1&occurrenceDate=2026-01-01&manage=auto',
    );
    expect(bootstrap?.event.$id).toBe('evt_1');
    expect(bootstrap?.event.fields?.[0]?.$id).toBe('field_1');
    expect(bootstrap?.event.timeSlots?.[0]?.$id).toBe('slot_1');
    expect(bootstrap?.participantSnapshot.participants.userIds).toEqual(['user_1']);
    expect(bootstrap?.participantSnapshot.teams[0]?.$id).toBe('team_1');
    expect(bootstrap?.participantSnapshot.users[0]?.$id).toBe('user_1');
    expect(bootstrap?.userCompliance?.users).toEqual([{ userId: 'user_1', fullName: 'Pat Player' }]);
  });

  it('skips field cleanup when deleting an unpublished organization event', async () => {
    apiRequestMock.mockResolvedValue({});

    await expect(
      eventService.deleteUnpublishedEvent({
        $id: 'evt_unpublished_org',
        organizationId: 'org_1',
        fields: [{ $id: 'field_org_1' }],
      } as any),
    ).resolves.toBeUndefined();

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/events/evt_unpublished_org', {
      method: 'DELETE',
      body: {
        event: expect.objectContaining({
          $id: 'evt_unpublished_org',
        }),
      },
    });
  });

  it('skips organization-owned fields during unpublished event cleanup', async () => {
    apiRequestMock.mockResolvedValue({});

    await expect(
      eventService.deleteUnpublishedEvent({
        $id: 'evt_unpublished_mixed_fields',
        fields: [
          { $id: 'field_org_ref', organization: 'org_1' },
          { $id: 'field_org_obj', organization: { $id: 'org_2' } },
          { $id: 'field_org_id', organizationId: 'org_3' },
          { $id: 'field_local' },
        ],
      } as any),
    ).resolves.toBeUndefined();

    const fieldDeleteCalls = apiRequestMock.mock.calls
      .filter(([path, options]) => path.startsWith('/api/fields/') && options?.method === 'DELETE')
      .map(([path]) => path);

    expect(fieldDeleteCalls).toEqual(['/api/fields/field_local']);
  });

  it('does not throw when local field cleanup fails for unpublished event deletion', async () => {
    apiRequestMock.mockImplementation((path: string) => {
      if (path === '/api/events/evt_unpublished_failure') {
        return Promise.resolve({});
      }
      if (path === '/api/fields/field_local') {
        return Promise.reject(new Error('Delete forbidden'));
      }
      return Promise.resolve({});
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      eventService.deleteUnpublishedEvent({
        $id: 'evt_unpublished_failure',
        fields: [{ $id: 'field_local' }],
      } as any),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to delete 1 field(s) for unpublished event evt_unpublished_failure.',
    );

    warnSpy.mockRestore();
  });

  it('preserves multi-position official assignments when mapping a match row', () => {
    const mapMatchRecord = (eventService as any).mapMatchRecord.bind(eventService);
    const match = mapMatchRecord(
      {
        $id: 'match_1',
        start: '2026-04-25T16:00:00.000Z',
        end: '2026-04-25T16:20:00.000Z',
        team1Points: [],
        team2Points: [],
        setResults: [],
        officialId: 'official_1',
        officialIds: [
          {
            positionId: 'r1',
            slotIndex: 0,
            holderType: 'OFFICIAL',
            userId: 'official_1',
            eventOfficialId: 'event_official_1',
          },
          {
            positionId: 'r2',
            slotIndex: 0,
            holderType: 'OFFICIAL',
            userId: 'official_2',
            eventOfficialId: 'event_official_2',
          },
          {
            positionId: 'scorekeeper',
            slotIndex: 0,
            holderType: 'OFFICIAL',
            userId: 'official_3',
            eventOfficialId: 'event_official_3',
          },
        ],
      },
      {
        teamsById: new Map(),
        fieldsById: new Map(),
        officialsById: new Map([
          ['official_1', { $id: 'official_1', firstName: 'One' }],
          ['official_2', { $id: 'official_2', firstName: 'Two' }],
          ['official_3', { $id: 'official_3', firstName: 'Three' }],
        ]),
      },
    );

    expect(Array.isArray(match.officialIds)).toBe(true);
    expect(match.officialIds).toHaveLength(3);
    expect(match.officialIds?.map((assignment: any) => assignment.positionId)).toEqual([
      'r1',
      'r2',
      'scorekeeper',
    ]);
  });
});
