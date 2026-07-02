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
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
}));

import { POST as searchEvents } from '@/app/api/events/search/route';

const eventRow = (id: string, name = 'Unrelated event') => ({
  id,
  name,
  description: null,
  location: 'Court 1',
  start: new Date('2026-06-01T18:00:00.000Z'),
  end: new Date('2026-06-01T20:00:00.000Z'),
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
    expect(json.events.map((event: any) => event.$id)).toEqual([
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
        $id: 'event_troutdale_basketball',
        name: "Men's Basketball League",
        eventType: 'LEAGUE',
        affiliateUrl: 'https://www.troutdaleindoorsports.com/baksetball',
        sourceType: 'AFFILIATE_IMPORT',
        sourceId: 'candidate_troutdale',
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
      take: 3,
      skip: 0,
    }));
    expect(prismaMock.events.count).toHaveBeenCalledWith({
      where: prismaMock.events.findMany.mock.calls[0][0].where,
    });
    expect(withEventAttendeeCountsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'event_1' }),
      expect.objectContaining({ id: 'event_2' }),
    ]);
    expect(json.events.map((event: any) => event.$id)).toEqual(['event_1', 'event_2']);
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
    expect(json.events.map((event: any) => event.$id)).toEqual(['near']);
    expect(json.pagination).toEqual({ hasMore: false, nextOffset: 1, totalCount: 1 });
  });
});
