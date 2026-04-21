/** @jest-environment node */

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  sports: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
  canonicalTeams: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  teamRegistrations: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
  products: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  matches: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const buildDivisionStandingsResponseMock = jest.fn();
const toLeagueEventMock = jest.fn();
const buildPublicBracketWidgetViewMock = jest.fn();
const loadEventWithRelationsMock = jest.fn();

jest.mock('@/app/api/events/[eventId]/standings/shared', () => ({
  buildDivisionStandingsResponse: (...args: unknown[]) => buildDivisionStandingsResponseMock(...args),
  toLeagueEvent: (...args: unknown[]) => toLeagueEventMock(...args),
}));

jest.mock('@/server/publicWidgetBracket', () => ({
  buildPublicBracketWidgetView: (...args: unknown[]) => buildPublicBracketWidgetViewMock(...args),
}));

jest.mock('@/server/repositories/events', () => ({
  loadEventWithRelations: (...args: unknown[]) => loadEventWithRelationsMock(...args),
}));

import {
  getPublicBracketWidgetPage,
  getPublicOrganizationBySlug,
  listPublicOrganizationRentals,
  listPublicOrganizationProducts,
  listPublicOrganizationEvents,
  listPublicOrganizationEventPage,
  getPublicStandingsWidgetPage,
  getPublicOrganizationTeamForRegistration,
  listPublicOrganizationTeams,
} from '@/server/publicOrganizationCatalog';

const publicOrganization = {
  id: 'org_1',
  slug: 'scsoccer',
  name: 'SCSoccer',
  description: null,
  location: null,
  website: null,
  logoUrl: '/logo.png',
  sports: [],
  brandPrimaryColor: '#0f766e',
  brandAccentColor: '#f59e0b',
  publicHeadline: 'Play',
  publicIntroText: 'Join',
  publicPageEnabled: true,
  publicWidgetsEnabled: true,
  publicCompletionRedirectUrl: null,
};

describe('publicOrganizationCatalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.organizations.findUnique.mockReset();
    prismaMock.events.findMany.mockReset();
    prismaMock.events.findUnique.mockReset();
    prismaMock.sports.findMany.mockReset();
    prismaMock.sports.findUnique.mockReset();
    prismaMock.divisions.findMany.mockReset();
    prismaMock.canonicalTeams.findMany.mockReset();
    prismaMock.canonicalTeams.findFirst.mockReset();
    prismaMock.teamRegistrations.findMany.mockReset();
    prismaMock.fields.findMany.mockReset();
    prismaMock.timeSlots.findMany.mockReset();
    prismaMock.products.findMany.mockReset();
    prismaMock.products.findFirst.mockReset();
    prismaMock.teams.findMany.mockReset();
    prismaMock.matches.findMany.mockReset();
    prismaMock.organizations.findUnique.mockResolvedValue(null);
    prismaMock.events.findUnique.mockResolvedValue(null);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.sports.findUnique.mockResolvedValue(null);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.matches.findMany.mockResolvedValue([]);
    buildDivisionStandingsResponseMock.mockReset();
    toLeagueEventMock.mockReset();
    buildPublicBracketWidgetViewMock.mockReset();
    loadEventWithRelationsMock.mockReset();
  });

  it('does not return page-disabled organizations for public pages', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'SCSoccer',
      publicSlug: 'scsoccer',
      publicPageEnabled: false,
      publicWidgetsEnabled: true,
      publicCompletionRedirectUrl: 'https://client.example.com/thanks',
    });

    await expect(getPublicOrganizationBySlug('scsoccer', { surface: 'page' })).resolves.toBeNull();
    await expect(getPublicOrganizationBySlug('scsoccer', { surface: 'widget' })).resolves.toEqual(expect.objectContaining({
      slug: 'scsoccer',
      publicWidgetsEnabled: true,
      publicCompletionRedirectUrl: 'https://client.example.com/thanks',
    }));
  });

  it('lists only public event cards for an organization', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        description: 'League play',
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'LEAGUE',
        sportId: 'soccer',
          price: 2500,
          imageId: 'file_1',
          divisions: ['open'],
      },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([{ id: 'soccer', name: 'Soccer' }]);
    prismaMock.divisions.findMany.mockResolvedValue([{ eventId: 'event_1', id: 'open', key: 'open', name: 'Open' }]);

    const events = await listPublicOrganizationEvents(publicOrganization);

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org_1',
        NOT: { state: 'TEMPLATE' },
      }),
    }));
    expect(events).toEqual([
      expect.objectContaining({
        id: 'event_1',
        name: 'Spring League',
        sportName: 'Soccer',
        eventTypeLabel: 'League',
        detailsUrl: '/o/scsoccer/events/event_1',
      }),
    ]);
  });

  it('applies locked event type and today rules to public event queries', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    try {
      await listPublicOrganizationEvents(
        publicOrganization,
        {
          eventTypes: ['league', 'TOURNAMENT', 'bad-type'],
          dateRule: 'today',
          includeChildWeeklyEvents: false,
          limit: 4,
        },
      );
    } finally {
      jest.useRealTimers();
    }

    const query = prismaMock.events.findMany.mock.calls[0]?.[0];
    expect(query).toEqual(expect.objectContaining({
      take: expect.any(Number),
      where: expect.objectContaining({
        eventType: { in: ['LEAGUE', 'TOURNAMENT'] },
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.any(Array),
          }),
          { eventType: { not: 'WEEKLY_EVENT' } },
        ]),
      }),
    }));
    expect(query.take).toBeGreaterThanOrEqual(4);
  });

  it('applies custom date ranges ahead of date presets', async () => {
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    await listPublicOrganizationEvents(
      {
        ...publicOrganization,
      },
      {
        dateRule: 'today',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-03',
      },
    );

    const query = prismaMock.events.findMany.mock.calls[0]?.[0];
    const dateClause = query.where.AND[0].OR[1];
    expect(dateClause.start.gte).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(dateClause.start.lt).toEqual(new Date(2026, 5, 4, 0, 0, 0, 0));
  });

  it('returns paginated event cards with next and previous state', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'First Event',
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'EVENT',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
      {
        id: 'event_2',
        name: 'Second Event',
        start: new Date('2026-05-02T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'EVENT',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
      {
        id: 'event_3',
        name: 'Third Event',
        start: new Date('2026-05-03T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'EVENT',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    const page = await listPublicOrganizationEventPage(publicOrganization, {
      limit: 1,
      page: 2,
    });

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: expect.any(Number),
    }));
    expect(prismaMock.events.findMany.mock.calls[0]?.[0].skip).toBeUndefined();
    expect(prismaMock.events.findMany.mock.calls[0]?.[0].take).toBeGreaterThanOrEqual(2);
    expect(page.events).toEqual([
      expect.objectContaining({ id: 'event_2' }),
    ]);
    expect(page.pageInfo).toEqual({
      limit: 1,
      page: 2,
      offset: 1,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it('keeps explicitly selected public events in the requested order and skips date filtering', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_old',
        name: 'Old League',
        start: new Date('2026-04-01T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'LEAGUE',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
      {
        id: 'event_new',
        name: 'New League',
        start: new Date('2026-06-01T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'LEAGUE',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    const page = await listPublicOrganizationEventPage(publicOrganization, {
      limit: 2,
      page: 1,
      dateRule: 'upcoming',
      eventIds: ['event_new', 'event_old'],
    });

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org_1',
        id: { in: ['event_new', 'event_old'] },
      }),
    }));
    expect(prismaMock.events.findMany.mock.calls[0]?.[0].where.AND).toBeUndefined();
    expect(page.events.map((event) => event.id)).toEqual(['event_new', 'event_old']);
  });

  it('loads a public standings widget page for the selected league event and division', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'SCSoccer',
      publicSlug: 'scsoccer',
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
      publicCompletionRedirectUrl: null,
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'league_1',
        name: 'Spring League',
        start: new Date('2026-05-01T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'LEAGUE',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'league_1',
      organizationId: 'org_1',
      state: 'PUBLISHED',
      eventType: 'LEAGUE',
    });
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    loadEventWithRelationsMock.mockResolvedValue({ id: 'league_1' });
    toLeagueEventMock.mockReturnValue({
      divisions: [{ id: 'open', name: 'Open Division' }],
      matches: {},
    });
    buildDivisionStandingsResponseMock.mockReturnValue({
      divisionName: 'Open Division',
      standings: [
        { position: 1, teamName: 'Aces', draws: 0, finalPoints: 9, pointsDelta: 0 },
      ],
    });

    const page = await getPublicStandingsWidgetPage('scsoccer', {
      page: 1,
      dateRule: 'upcoming',
      eventIds: ['league_1'],
      divisionId: 'open',
    });

    expect(prismaMock.events.findUnique).toHaveBeenCalledWith({
      where: { id: 'league_1' },
      select: {
        id: true,
        organizationId: true,
        state: true,
        eventType: true,
      },
    });
    expect(loadEventWithRelationsMock).toHaveBeenCalledWith('league_1');
    expect(toLeagueEventMock).toHaveBeenCalled();
    expect(buildDivisionStandingsResponseMock).toHaveBeenCalledWith(expect.any(Object), 'open');
    expect(page).toEqual(expect.objectContaining({
      currentEvent: expect.objectContaining({ id: 'league_1' }),
      selectedDivisionId: 'open',
      selectedDivisionName: 'Open Division',
      divisionOptions: [{ value: 'open', label: 'Open Division' }],
      division: expect.objectContaining({
        divisionName: 'Open Division',
      }),
    }));
  });

  it('loads a public bracket widget page for a public tournament event', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'SCSoccer',
      publicSlug: 'scsoccer',
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
      publicCompletionRedirectUrl: null,
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'tournament_1',
        name: 'Spring Finals',
        start: new Date('2026-05-10T17:00:00.000Z'),
        end: null,
        location: 'Main Field',
        eventType: 'TOURNAMENT',
        sportId: null,
        price: 0,
        imageId: null,
        divisions: [],
      },
    ]);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'tournament_1',
      organizationId: 'org_1',
      state: 'PUBLISHED',
      eventType: 'TOURNAMENT',
    });
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.matches.findMany.mockResolvedValue([]);
    loadEventWithRelationsMock.mockResolvedValue({ id: 'tournament_1' });
    buildPublicBracketWidgetViewMock.mockReturnValue({
      divisionOptions: [{ value: 'open', label: 'Open Division' }],
      selectedDivisionId: 'open',
      selectedDivisionName: 'Open Division',
      winnersColumns: [{ label: 'Round 1', matches: [] }],
      losersColumns: [],
      hasLosersBracket: false,
    });

    const page = await getPublicBracketWidgetPage('scsoccer', {
      page: 1,
      dateRule: 'upcoming',
      eventIds: ['tournament_1'],
      divisionId: 'open',
    });

    expect(prismaMock.matches.findMany).toHaveBeenCalled();
    expect(loadEventWithRelationsMock).toHaveBeenCalledWith('tournament_1');
    expect(buildPublicBracketWidgetViewMock).toHaveBeenCalledWith({ id: 'tournament_1' }, 'open');
    expect(page).toEqual(expect.objectContaining({
      currentEvent: expect.objectContaining({ id: 'tournament_1' }),
      selectedDivisionId: 'open',
      selectedDivisionName: 'Open Division',
      winnersColumns: [{ label: 'Round 1', matches: [] }],
      hasLosersBracket: false,
    }));
  });

  it('lists organization teams by canonical organizationId and sorts open registration first', async () => {
    prismaMock.canonicalTeams.findMany.mockResolvedValue([
      {
        id: 'team_open',
        name: 'Fusion Volleyball Club',
        division: 'CoEd Open',
        divisionTypeName: 'Open',
        sport: 'Indoor Volleyball',
        profileImageId: null,
        teamSize: 6,
        openRegistration: true,
        registrationPriceCents: 2500,
        organizationId: 'org_1',
      },
      {
        id: 'team_closed',
        name: 'Titan Volleyball Club',
        division: null,
        divisionTypeName: null,
        sport: 'Indoor Volleyball',
        profileImageId: null,
        teamSize: 8,
        openRegistration: false,
        registrationPriceCents: 0,
        organizationId: 'org_1',
      },
    ]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      { teamId: 'team_open' },
      { teamId: 'team_open' },
      { teamId: 'team_closed' },
    ]);

    const teams = await listPublicOrganizationTeams(publicOrganization, { limit: 6 });

    expect(prismaMock.canonicalTeams.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }],
      take: 6,
    });
    expect(prismaMock.teamRegistrations.findMany).toHaveBeenCalledWith({
      where: {
        teamId: { in: ['team_open', 'team_closed'] },
        OR: [
          { status: 'ACTIVE' },
          {
            status: 'STARTED',
            createdAt: { gte: expect.any(Date) },
          },
        ],
      },
      select: {
        teamId: true,
      },
    });
    expect(teams).toEqual([
      expect.objectContaining({
        id: 'team_open',
        name: 'Fusion Volleyball Club',
        sport: 'Indoor Volleyball',
        division: 'Open',
        currentSize: 2,
        teamSize: 6,
        isFull: false,
        openRegistration: true,
        registrationPriceCents: 2500,
        registrationUrl: '/o/scsoccer/teams/team_open',
      }),
      expect.objectContaining({
        id: 'team_closed',
        name: 'Titan Volleyball Club',
        sport: 'Indoor Volleyball',
        division: null,
        currentSize: 1,
        teamSize: 8,
        isFull: false,
        openRegistration: false,
        registrationPriceCents: 0,
        registrationUrl: null,
      }),
    ]);
  });

  it('can limit public teams to only open-registration teams', async () => {
    prismaMock.canonicalTeams.findMany.mockResolvedValue([
      {
        id: 'team_open',
        name: 'Fusion Volleyball Club',
        division: 'CoEd Open',
        divisionTypeName: 'Open',
        sport: 'Indoor Volleyball',
        profileImageId: null,
        teamSize: 6,
        openRegistration: true,
        registrationPriceCents: 2500,
        organizationId: 'org_1',
      },
    ]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      { teamId: 'team_open' },
    ]);

    const teams = await listPublicOrganizationTeams(publicOrganization, {
      limit: 6,
      openRegistrationOnly: true,
    });

    expect(prismaMock.canonicalTeams.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', openRegistration: true },
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }],
      take: 6,
    });
    expect(teams).toEqual([
      expect.objectContaining({
        id: 'team_open',
        currentSize: 1,
        teamSize: 6,
        isFull: false,
        openRegistration: true,
        registrationUrl: '/o/scsoccer/teams/team_open',
      }),
    ]);
  });

  it('removes the public registration link for full open-registration teams', async () => {
    prismaMock.canonicalTeams.findMany.mockResolvedValue([
      {
        id: 'team_full',
        name: 'Packed House',
        division: 'CoEd Open',
        divisionTypeName: 'Open',
        sport: 'Indoor Volleyball',
        profileImageId: null,
        teamSize: 2,
        openRegistration: true,
        registrationPriceCents: 2500,
        organizationId: 'org_1',
      },
    ]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      { teamId: 'team_full' },
      { teamId: 'team_full' },
    ]);

    const teams = await listPublicOrganizationTeams(publicOrganization, { limit: 6 });

    expect(teams).toEqual([
      expect.objectContaining({
        id: 'team_full',
        currentSize: 2,
        teamSize: 2,
        isFull: true,
        registrationUrl: null,
      }),
    ]);
  });

  it('ignores stale started team registrations in public fullness counts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-21T22:00:00.000Z'));
    prismaMock.canonicalTeams.findMany.mockResolvedValue([
      {
        id: 'team_open',
        name: 'Fusion Volleyball Club',
        division: 'CoEd Open',
        divisionTypeName: 'Open',
        sport: 'Indoor Volleyball',
        profileImageId: null,
        teamSize: 6,
        openRegistration: true,
        registrationPriceCents: 2500,
        organizationId: 'org_1',
      },
    ]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      { teamId: 'team_open' },
    ]);

    try {
      const teams = await listPublicOrganizationTeams(publicOrganization, { limit: 6 });

      expect(prismaMock.teamRegistrations.findMany).toHaveBeenCalledWith({
        where: {
          teamId: { in: ['team_open'] },
          OR: [
            { status: 'ACTIVE' },
            {
              status: 'STARTED',
              createdAt: { gte: new Date('2026-04-21T21:55:00.000Z') },
            },
          ],
        },
        select: {
          teamId: true,
        },
      });
      expect(teams).toEqual([
        expect.objectContaining({
          id: 'team_open',
          currentSize: 1,
          teamSize: 6,
          isFull: false,
          registrationUrl: '/o/scsoccer/teams/team_open',
        }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('expands public weekly parent events into upcoming occurrence cards for filtered widgets', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T12:00:00.000Z'));
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'weekly_parent',
        name: 'Weekly Pickup',
        start: new Date('2026-04-01T17:00:00.000Z'),
        end: new Date('2026-06-01T17:00:00.000Z'),
        location: 'Main Court',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        sportId: null,
        price: 1000,
        imageId: null,
        divisions: ['open'],
        timeSlotIds: ['slot_weekly'],
      },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_weekly',
        dayOfWeek: 2,
        daysOfWeek: [2],
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        endDate: new Date('2026-06-01T00:00:00.000Z'),
        startTimeMinutes: 17 * 60,
        endTimeMinutes: 18 * 60,
        repeating: true,
      },
    ]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);

    try {
      const page = await listPublicOrganizationEventPage(publicOrganization, {
        dateRule: 'week',
        eventTypes: ['WEEKLY_EVENT'],
        limit: 4,
        page: 1,
      });

      expect(page.events).toEqual([
        expect.objectContaining({
          id: 'weekly_parent:slot_weekly:2026-05-06',
          start: new Date(2026, 4, 6, 17, 0, 0, 0).toISOString(),
          detailsUrl: '/o/scsoccer/events/weekly_parent?slotId=slot_weekly&occurrenceDate=2026-05-06',
        }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('links public rental cards to the rental selection page', async () => {
    prismaMock.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        name: 'Main Field',
        fieldNumber: 1,
        location: 'Main Park',
        rentalSlotIds: ['slot_1'],
      },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_1',
        startDate: new Date('2026-05-01T17:00:00.000Z'),
        endDate: new Date('2026-05-01T19:00:00.000Z'),
        price: 5000,
      },
    ]);

    const rentals = await listPublicOrganizationRentals(publicOrganization);

    expect(rentals).toEqual([
      expect.objectContaining({
        id: 'slot_1',
        detailsUrl: '/o/scsoccer/rentals',
      }),
    ]);
  });

  it('links public product cards directly to checkout pages', async () => {
    prismaMock.products.findMany.mockResolvedValue([
      {
        id: 'product_1',
        name: 'Day Pass',
        description: 'Drop in once',
        priceCents: 1500,
        period: 'single',
      },
    ]);

    const products = await listPublicOrganizationProducts(publicOrganization);

    expect(products).toEqual([
      expect.objectContaining({
        id: 'product_1',
        period: 'single',
        detailsUrl: '/o/scsoccer/products/product_1',
      }),
    ]);
  });

  it('filters public products by single purchase or subscription mode', async () => {
    prismaMock.products.findMany.mockResolvedValue([]);

    await listPublicOrganizationProducts(publicOrganization, {
      limit: 6,
      purchaseMode: 'subscription',
    });

    expect(prismaMock.products.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org_1',
        OR: [{ isActive: true }, { isActive: null }],
        period: { in: ['WEEK', 'MONTH', 'YEAR'] },
      }),
      take: 6,
    }));
  });

  it('loads only open-registration public teams for registration pages', async () => {
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'SCSoccer',
      publicSlug: 'scsoccer',
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
      publicCompletionRedirectUrl: null,
    });
    prismaMock.canonicalTeams.findFirst.mockResolvedValue({
      id: 'team_open',
      name: 'Fusion Volleyball Club',
      divisionTypeName: 'Open',
      sport: 'Indoor Volleyball',
      profileImageId: null,
      teamSize: 10,
      openRegistration: true,
      registrationPriceCents: 2500,
      organizationId: 'org_1',
    });
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      { teamId: 'team_open' },
      { teamId: 'team_open' },
      { teamId: 'team_open' },
    ]);

    const result = await getPublicOrganizationTeamForRegistration('scsoccer', 'team_open');

    expect(prismaMock.canonicalTeams.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'team_open',
        organizationId: 'org_1',
        openRegistration: true,
      },
    });
    expect(result).toEqual({
      organization: expect.objectContaining({ slug: 'scsoccer' }),
      team: expect.objectContaining({
        id: 'team_open',
        name: 'Fusion Volleyball Club',
        division: 'Open',
        sport: 'Indoor Volleyball',
        currentSize: 3,
        teamSize: 10,
        isFull: false,
        registrationPriceCents: 2500,
      }),
    });
  });
});
