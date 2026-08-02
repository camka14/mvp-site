/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  canonicalTeams: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  sports: {
    findMany: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
};

const withEventAttendeeCountsMock = jest.fn(async (events: any[]) => events);
const withDerivedEventParticipantIdsMock = jest.fn(async (events: any[]) => events);
const getEventOfficialIdsByEventIdsMock = jest.fn(async () => new Map<string, string[]>());
const getTokenFromRequestMock = jest.fn(() => null);

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/authServer', () => ({
  getTokenFromRequest: (...args: any[]) => getTokenFromRequestMock(...args),
  verifySessionToken: jest.fn(),
}));
jest.mock('@/server/authState', () => ({ isAuthUserSuspended: jest.fn(() => false) }));
jest.mock('@/server/authSessions', () => ({ isSessionTokenCurrent: jest.fn(() => true) }));
jest.mock('@/app/api/events/participantCounts', () => ({
  withEventAttendeeCounts: (...args: any[]) => withEventAttendeeCountsMock(...args),
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  withDerivedEventParticipantIds: (...args: any[]) => withDerivedEventParticipantIdsMock(...args),
}));
jest.mock('@/server/officials/eventOfficials', () => ({
  getEventOfficialIdsByEventIds: (...args: any[]) => getEventOfficialIdsByEventIdsMock(...args),
}));

import { POST as searchEvents } from '@/app/api/events/search/route';

const eventRow = (id: string, name = 'Unrelated event') => ({
  id,
  name,
  description: null,
  location: 'Court 1',
  start: new Date('2026-06-01T18:00:00.000Z'),
  end: new Date('2026-06-01T20:00:00.000Z'),
  coordinates: [-122.6784, 45.5152],
  state: 'PUBLISHED',
  eventType: 'EVENT',
  parentEvent: null,
  divisions: [],
  teamSignup: true,
  userIds: [],
  teamIds: [],
});

describe('POST /api/events/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.fields.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.events.count.mockResolvedValue(0);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.timeSlots.findMany.mockResolvedValue([]);
  });

  it('expands event search queries across listed organizations without searching teams', async () => {
    prismaMock.organizations.findMany.mockResolvedValue([{ id: 'org_venue' }]);
    prismaMock.fields.findMany.mockResolvedValue([{ id: 'field_venue' }]);
    prismaMock.timeSlots.findMany.mockResolvedValue([{ id: 'slot_venue' }]);
    prismaMock.teams.findMany
      .mockResolvedValueOnce([{ eventId: 'event_team' }])
      .mockResolvedValueOnce([{ eventId: 'event_canonical' }]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([{ id: 'canonical_team' }]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([{ eventId: 'event_registered_canonical' }]);
    prismaMock.events.findMany.mockResolvedValue([
      eventRow('event_team'),
      eventRow('event_canonical'),
      eventRow('event_registered_canonical'),
    ]);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { query: 'Aces' },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    const searchWhere = prismaMock.events.findMany.mock.calls[0][0].where;
    expect(searchWhere.OR).toEqual(expect.arrayContaining([
      { name: { contains: 'Aces', mode: 'insensitive' } },
      { description: { contains: 'Aces', mode: 'insensitive' } },
      { location: { contains: 'Aces', mode: 'insensitive' } },
      { organizationId: { in: ['org_venue'] } },
    ]));
    expect(searchWhere.OR).not.toEqual(expect.arrayContaining([
      { fieldIds: { hasSome: ['field_venue'] } },
      { timeSlotIds: { hasSome: ['slot_venue'] } },
      { id: { in: ['event_team', 'event_canonical', 'event_registered_canonical'] } },
    ]));
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
    expect(prismaMock.timeSlots.findMany).not.toHaveBeenCalled();
    expect(prismaMock.teams.findMany).not.toHaveBeenCalled();
    expect(prismaMock.canonicalTeams.findMany).not.toHaveBeenCalled();
    expect(prismaMock.eventRegistrations.findMany).not.toHaveBeenCalled();
    expect(json.events.map((event: any) => event.id)).toEqual([
      'event_team',
      'event_canonical',
      'event_registered_canonical',
    ]);
  });

  it('includes real affiliate events in discover search results', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        ...eventRow('event_troutdale_basketball', "Men's Basketball League"),
        eventType: 'LEAGUE',
        affiliateUrl: 'https://www.troutdaleindoorsports.com/baksetball',
        sourceType: 'AFFILIATE_IMPORT',
        sourceId: 'candidate_troutdale',
        sourceUrl: 'https://www.troutdaleindoorsports.com/baksetball',
        organizerName: 'Troutdale Indoor Sports',
        scheduleText: 'Games are listed Friday and Sunday.',
        priceText: '$850 flat fee listed for 7-week sessions.',
        statusText: 'Confirm current session with Troutdale Indoor Sports',
        sportId: 'sport_basketball',
      },
    ]);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { query: 'Troutdale' },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    const searchWhere = prismaMock.events.findMany.mock.calls[0][0].where;
    expect(searchWhere.OR).toEqual(expect.arrayContaining([
      { organizerName: { contains: 'Troutdale', mode: 'insensitive' } },
      { sourceUrl: { contains: 'Troutdale', mode: 'insensitive' } },
      { scheduleText: { contains: 'Troutdale', mode: 'insensitive' } },
    ]));
    expect(json.events).toEqual([
      expect.objectContaining({
        id: 'event_troutdale_basketball',
        name: "Men's Basketball League",
        eventType: 'LEAGUE',
        affiliateUrl: expect.stringMatching(/^https:\/\/bracket-iq\.com\/out\/event\/event_troutdale_basketball\//),
        sourceType: 'AFFILIATE_IMPORT',
        sourceId: 'candidate_troutdale',
        sourceUrl: null,
      }),
    ]);
  });

  it('excludes no-fixed-date affiliate programs when explicit date filters are applied', async () => {
    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { dateFrom: '2026-07-01T00:00:00.000Z' },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    const searchWhere = prismaMock.events.findMany.mock.calls[0][0].where;
    expect(searchWhere.AND).toEqual(expect.arrayContaining([
      {
        OR: [
          { dateDisplayMode: null },
          { dateDisplayMode: 'SCHEDULED' },
        ],
      },
    ]));
  });

  it('applies the start-date lower bound to weekly events', async () => {
    const dateFrom = '2026-07-16T07:00:00.000Z';
    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { dateFrom },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    const searchWhere = prismaMock.events.findMany.mock.calls[0][0].where;
    expect(searchWhere.AND).toEqual(expect.arrayContaining([
      { start: { gte: new Date(dateFrom) } },
    ]));
  });

  it('filters external-registration events by their behavioral type', async () => {
    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { eventTypes: ['LEAGUE'] },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    const searchWhere = prismaMock.events.findMany.mock.calls[0][0].where;
    expect(searchWhere.eventType).toEqual({ in: ['LEAGUE'] });
  });

  it('returns pagination metadata without enriching rows past the requested page', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      eventRow('event_1'),
      eventRow('event_2'),
      eventRow('event_3'),
    ]);
    prismaMock.events.count.mockResolvedValue(42);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {},
        limit: 2,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: undefined,
      skip: 0,
    }));
    expect(prismaMock.events.count).toHaveBeenCalledWith({
      where: prismaMock.events.findMany.mock.calls[0][0].where,
    });
    expect(withEventAttendeeCountsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'event_1' }),
      expect.objectContaining({ id: 'event_2' }),
    ]);
    expect(json.events.map((event: any) => event.id)).toEqual(['event_1', 'event_2']);
    expect(json.pagination).toEqual({ hasMore: true, nextOffset: 2, totalCount: 42 });

    jest.clearAllMocks();
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.fields.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.sports.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.timeSlots.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([
      eventRow('event_1'),
      eventRow('event_2'),
    ]);
    prismaMock.events.count.mockResolvedValue(2);

    const endResponse = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {},
        limit: 2,
        offset: 2,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const endJson = await endResponse.json();

    expect(endResponse.status).toBe(200);
    expect(endJson.events).toEqual([]);
    expect(endJson.pagination).toEqual({ hasMore: false, nextOffset: 2, totalCount: 2 });
  });

  it('counts distance-filtered results after applying the radius filter', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      { ...eventRow('near'), coordinates: [-122.6784, 45.5152] },
      { ...eventRow('far'), coordinates: [-74.006, 40.7128] },
      { ...eventRow('placeholder'), coordinates: [0, 0] },
    ]);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {
          userLocation: { lat: 45.5152, lng: -122.6784 },
          maxDistance: 10,
        },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.count).not.toHaveBeenCalled();
    expect(json.events.map((event: any) => event.id)).toEqual(['near']);
    expect(json.pagination).toEqual({ hasMore: false, nextOffset: 1, totalCount: 1 });
  });

  it('sorts distance-filtered results from nearest to farthest', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        ...eventRow('farther', 'Earlier but farther'),
        start: new Date('2026-08-03T18:00:00.000Z'),
        coordinates: [-122.85, 45.5152],
      },
      {
        ...eventRow('nearest', 'Later but nearest'),
        start: new Date('2026-10-03T18:00:00.000Z'),
        coordinates: [-122.68, 45.5152],
      },
    ]);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {
          userLocation: { lat: 45.5152, lng: -122.6784 },
          maxDistance: 80.467,
        },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events.map((event: any) => event.id)).toEqual(['nearest', 'farther']);
  });

  it('sorts all-distance location results from nearest to farthest', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        ...eventRow('farther', 'Earlier but farther'),
        start: new Date('2026-08-03T18:00:00.000Z'),
        coordinates: [-122.85, 45.5152],
      },
      {
        ...eventRow('nearest', 'Later but nearest'),
        start: new Date('2026-10-03T18:00:00.000Z'),
        coordinates: [-122.68, 45.5152],
      },
    ]);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { userLocation: { lat: 45.5152, lng: -122.6784 } },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.count).not.toHaveBeenCalled();
    expect(json.events.map((event: any) => event.id)).toEqual(['nearest', 'farther']);
    expect(json.pagination.totalCount).toBe(2);
  });

  it('uses claimed status and organization diversity in the default recommended order', async () => {
    prismaMock.organizations.findMany.mockResolvedValue([
      {
        id: 'recs',
        name: 'RECS',
        ownershipStatus: 'UNCLAIMED',
        claimVerificationLevel: 'NONE',
      },
      {
        id: 'claimed-org',
        name: 'Claimed Club',
        ownershipStatus: 'CLAIMED',
        claimVerificationLevel: 'AFFILIATION',
      },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, index) => ({
        ...eventRow(`recs-${index + 1}`, 'Round Robin'),
        organizationId: 'recs',
        sourceType: 'AFFILIATE_IMPORT',
      })),
      {
        ...eventRow('claimed-event', 'Claimed Event'),
        organizationId: 'claimed-org',
        sourceType: 'AFFILIATE_IMPORT',
      },
      {
        ...eventRow('native-event', 'BracketIQ Event'),
        organizationId: null,
        sourceType: null,
      },
    ]);
    prismaMock.events.count.mockResolvedValue(8);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {},
        limit: 4,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events.map((event: any) => event.id)).toEqual(expect.arrayContaining([
      'native-event',
      'claimed-event',
    ]));
    expect(json.events.filter((event: any) => event.organizationId === 'recs')).toHaveLength(2);
    expect(json.pagination).toEqual({ hasMore: true, nextOffset: 4, totalCount: 8 });

    const secondResponse = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {},
        limit: 4,
        offset: 4,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const secondJson = await secondResponse.json();
    const firstIds = json.events.map((event: any) => event.id);
    const secondIds = secondJson.events.map((event: any) => event.id);

    expect(secondResponse.status).toBe(200);
    expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
    expect([...firstIds, ...secondIds].sort()).toEqual([
      'claimed-event',
      'native-event',
      'recs-1',
      'recs-2',
      'recs-3',
      'recs-4',
      'recs-5',
      'recs-6',
    ]);
    expect(secondJson.pagination).toEqual({ hasMore: false, nextOffset: 8, totalCount: 8 });
  });

  it('honors an explicit nearest order without recommendation boosts', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      {
        ...eventRow('far-native', 'Far native event'),
        coordinates: [-123.2, 45.5152],
        sourceType: null,
      },
      {
        ...eventRow('near-affiliate', 'Near affiliate event'),
        coordinates: [-122.68, 45.5152],
        sourceType: 'AFFILIATE_IMPORT',
      },
    ]);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { userLocation: { lat: 45.5152, lng: -122.6784 } },
        sort: 'NEAREST',
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events.map((event: any) => event.id)).toEqual(['near-affiliate', 'far-native']);
  });

  it('returns a nearby sport-filtered event without requiring an event division row', async () => {
    prismaMock.sports.findMany.mockResolvedValue([{ id: 'Tennis' }]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        ...eventRow('tennis-event', 'Ladder Tournament 2026'),
        sportId: 'Tennis',
        coordinates: [-73.9757856, 40.6896125],
      },
    ]);
    prismaMock.events.count.mockResolvedValue(1);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {
          sports: ['Tennis'],
          userLocation: { lat: 40.7127753, lng: -74.0059728 },
          maxDistance: 80.467,
        },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.divisions.findMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sportId: { in: ['Tennis'] } }),
    }));
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sportId: { in: ['Tennis'] } }),
    }));
    expect(json.events.map((event: any) => event.id)).toEqual(['tennis-event']);
  });

  it('keeps events with placeholder coordinates when no distance filter is requested', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      { ...eventRow('bad'), coordinates: [0, 0] },
      { ...eventRow('good'), coordinates: [-122.6784, 45.5152] },
    ]);
    prismaMock.events.count.mockResolvedValue(2);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {},
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events.map((event: any) => event.id)).toEqual(['bad', 'good']);
  });

  it('preserves a null end for open-ended events', async () => {
    const start = new Date('2026-08-01T18:00:00.000Z');
    prismaMock.events.findMany.mockResolvedValue([
      {
        ...eventRow('evergreen'),
        start,
        end: null,
        noFixedEndDateTime: true,
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'No fixed start date',
      },
    ]);
    prismaMock.events.count.mockResolvedValue(1);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {},
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events[0]).toEqual(expect.objectContaining({
      id: 'evergreen',
      end: null,
      noFixedEndDateTime: true,
    }));
  });

  it('keeps all events when the provided user location is a placeholder coordinate', async () => {
    prismaMock.events.findMany.mockResolvedValue([
      { ...eventRow('good'), coordinates: [-122.6784, 45.5152] },
      { ...eventRow('bad'), coordinates: [0, 0] },
    ]);
    prismaMock.events.count.mockResolvedValue(2);

    const response = await searchEvents(new NextRequest('http://localhost/api/events/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: {
          userLocation: { lat: 0, lng: 0 },
          maxDistance: 10,
        },
        limit: 10,
        offset: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events.map((event: any) => event.id)).toEqual(['bad', 'good']);
    expect(json.pagination).toEqual({ hasMore: false, nextOffset: 2, totalCount: 2 });
  });
});
