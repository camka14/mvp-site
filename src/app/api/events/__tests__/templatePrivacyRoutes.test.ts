/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  matches: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
  fields: {
    findFirst: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  staffMembers: {
    findUnique: jest.fn(),
  },
  invites: {
    findMany: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const getTokenFromRequestMock = jest.fn();
const verifySessionTokenMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/authServer', () => ({
  getTokenFromRequest: (...args: any[]) => getTokenFromRequestMock(...args),
  verifySessionToken: (...args: any[]) => verifySessionTokenMock(...args),
}));
jest.mock('@/server/repositories/events', () => ({ upsertEventFromPayload: jest.fn() }));
jest.mock('@/server/eventCreationNotifications', () => ({ notifySocialAudienceOfEventCreation: jest.fn() }));

import { GET as eventsGet } from '@/app/api/events/route';
import { GET as eventGet } from '@/app/api/events/[eventId]/route';
import { POST as searchPost } from '@/app/api/events/search/route';
import { GET as eventsByFieldGet } from '@/app/api/events/field/[fieldId]/route';
import { GET as matchesByFieldGet } from '@/app/api/fields/[id]/matches/route';

const jsonPost = (url: string, body: any) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event template privacy routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.events.findMany.mockReset();
    prismaMock.events.findUnique.mockReset();
    prismaMock.teams.findMany.mockReset();
    prismaMock.matches.findMany.mockReset();
    prismaMock.timeSlots.findMany.mockReset();
    prismaMock.fields.findFirst.mockReset();
    prismaMock.organizations.findUnique.mockReset();
    prismaMock.staffMembers.findUnique.mockReset();
    prismaMock.invites.findMany.mockReset();
    prismaMock.divisions.findMany.mockReset();
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
    prismaMock.fields.findFirst.mockResolvedValue(null);
    getTokenFromRequestMock.mockReturnValue(null);
    verifySessionTokenMock.mockReturnValue(null);
  });

  it('excludes templates from GET /api/events when no state filter is provided', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);
    const res = await eventsGet(new NextRequest('http://localhost/api/events'));

    expect(res.status).toBe(200);
    const findManyCalls = prismaMock.events.findMany.mock.calls;
    const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
    expect(callArgs?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ NOT: { state: 'TEMPLATE' } }),
        expect.objectContaining({
          OR: expect.arrayContaining([
            { state: 'PUBLISHED' },
            { state: null },
          ]),
        }),
      ]),
    );
  });

  it('requires session and scopes host when listing templates via GET /api/events?state=TEMPLATE', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsGet(new NextRequest('http://localhost/api/events?state=TEMPLATE'));

    expect(res.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalled();
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: 'TEMPLATE',
          hostId: 'host_1',
          organizationId: null,
        }),
      }),
    );
  });

  it('forbids non-admin template listing when hostId param does not match session', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventsGet(new NextRequest('http://localhost/api/events?state=TEMPLATE&hostId=host_2'));

    expect(res.status).toBe(403);
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('allows org managers to list org event templates without host scoping', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.staffMembers.findUnique.mockResolvedValueOnce({
      organizationId: 'org_1',
      userId: 'host_1',
      types: ['HOST'],
    });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsGet(
      new NextRequest('http://localhost/api/events?state=TEMPLATE&organizationId=org_1'),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.organizations.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
      }),
    );
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: 'TEMPLATE',
          organizationId: 'org_1',
        }),
      }),
    );
    expect(prismaMock.events.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hostId: 'host_1',
        }),
      }),
    );
  });

  it('forbids non-managers from listing org event templates', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_2', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1' });

    const res = await eventsGet(
      new NextRequest('http://localhost/api/events?state=TEMPLATE&organizationId=org_1'),
    );

    expect(res.status).toBe(403);
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('forbids reading a template event when requester is not host', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', state: 'TEMPLATE', hostId: 'host_1' });
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_2', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(403);
    expect(requireSessionMock).toHaveBeenCalled();
  });

  it('forbids reading a private event when requester is not a manager', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', state: 'PRIVATE', hostId: 'host_1' });
    requireSessionMock.mockResolvedValueOnce({ userId: 'user_2', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(403);
    expect(requireSessionMock).toHaveBeenCalled();
  });

  it('allows reading a private event when requester is host', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', state: 'PRIVATE', hostId: 'host_1' });
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
  });

  it('allows reading a template event when requester is host', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({ id: 'event_1', state: 'TEMPLATE', hostId: 'host_1' });
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
  });

  it('allows reading an org template when requester manages the org and template host is blank', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      state: 'TEMPLATE',
      hostId: '',
      organizationId: 'org_1',
    });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.staffMembers.findUnique.mockResolvedValueOnce({
      organizationId: 'org_1',
      userId: 'host_1',
      types: ['HOST'],
    });
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });

    const res = await eventGet(
      new NextRequest('http://localhost/api/events/event_1'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(res.status).toBe(200);
  });

  it('excludes templates from POST /api/events/search results', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

    expect(res.status).toBe(200);
    const findManyCalls = prismaMock.events.findMany.mock.calls;
    const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
    expect(callArgs?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ NOT: { state: 'TEMPLATE' } }),
        expect.objectContaining({
          OR: expect.arrayContaining([
            { state: 'PUBLISHED' },
            { state: null },
          ]),
        }),
      ]),
    );
  });

  it('applies organizationId filter in POST /api/events/search', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await searchPost(
      jsonPost('http://localhost/api/events/search', { filters: { organizationId: ' org_1 ' } }),
    );

    expect(res.status).toBe(200);
    const findManyCalls = prismaMock.events.findMany.mock.calls;
    const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
    expect(callArgs?.where?.organizationId).toBe('org_1');
  });

  it('includes user-owned unpublished events in GET /api/events list visibility', async () => {
    getTokenFromRequestMock.mockReturnValueOnce('token_1');
    verifySessionTokenMock.mockReturnValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsGet(new NextRequest('http://localhost/api/events'));

    expect(res.status).toBe(200);
    const findManyCalls = prismaMock.events.findMany.mock.calls;
    const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
    expect(callArgs?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              state: { in: ['UNPUBLISHED', 'PRIVATE'] },
              OR: expect.arrayContaining([
                { hostId: 'host_1' },
                { assistantHostIds: { has: 'host_1' } },
              ]),
            }),
          ]),
        }),
      ]),
    );
  });

  it('includes organization unpublished events when requester can manage the organization', async () => {
    getTokenFromRequestMock.mockReturnValueOnce('token_1');
    verifySessionTokenMock.mockReturnValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValueOnce({ id: 'org_1', ownerId: 'owner_1' });
    prismaMock.staffMembers.findUnique.mockResolvedValueOnce({
      organizationId: 'org_1',
      userId: 'host_1',
      types: ['HOST'],
    });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsGet(new NextRequest('http://localhost/api/events?organizationId=org_1'));

    expect(res.status).toBe(200);
    const findManyCalls = prismaMock.events.findMany.mock.calls;
    const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
    expect(callArgs?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { state: { in: ['UNPUBLISHED', 'PRIVATE'] } },
          ]),
        }),
      ]),
    );
  });

  it('includes user-owned unpublished events in POST /api/events/search visibility', async () => {
    getTokenFromRequestMock.mockReturnValueOnce('token_1');
    verifySessionTokenMock.mockReturnValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await searchPost(
      new NextRequest('http://localhost/api/events/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token_1' },
        body: JSON.stringify({ filters: {} }),
      }),
    );

    expect(res.status).toBe(200);
    const findManyCalls = prismaMock.events.findMany.mock.calls;
    const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
    expect(callArgs?.where?.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              state: { in: ['UNPUBLISHED', 'PRIVATE'] },
              OR: expect.arrayContaining([
                { hostId: 'host_1' },
                { assistantHostIds: { has: 'host_1' } },
              ]),
            }),
          ]),
        }),
      ]),
    );
  });

  it('includes divisionDetails in GET /api/events list responses', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_1',
        name: 'Split Division Event',
        divisions: ['event_1__division__open', 'event_1__division__advanced'],
        sportId: 'sport_1',
        userIds: [],
      },
    ]);
    prismaMock.divisions.findMany.mockResolvedValueOnce([
      {
        eventId: 'event_1',
        id: 'event_1__division__open',
        key: 'open',
        name: 'Open',
        price: 3500,
        maxParticipants: 8,
        sportId: 'sport_1',
      },
      {
        eventId: 'event_1',
        id: 'event_1__division__advanced',
        key: 'advanced',
        name: 'Advanced',
        price: 5000,
        maxParticipants: 10,
        sportId: 'sport_1',
      },
    ]);

    const res = await eventsGet(new NextRequest('http://localhost/api/events'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].divisionDetails).toEqual([
      expect.objectContaining({ id: 'event_1__division__open', price: 3500, maxParticipants: 8 }),
      expect.objectContaining({ id: 'event_1__division__advanced', price: 5000, maxParticipants: 10 }),
    ]);
    expect(prismaMock.divisions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: { in: ['event_1'] },
        }),
      }),
    );
  });

  it('returns attendee counts that exclude placeholder teams in GET /api/events', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_1',
        name: 'League Event',
        eventType: 'LEAGUE',
        teamSignup: true,
        teamIds: ['slot_1', 'slot_2', 'slot_3'],
        userIds: [],
        divisions: [],
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValueOnce([
      { id: 'slot_1', parentTeamId: 'team_a', name: 'Alpha Team' },
      { id: 'slot_2', parentTeamId: null, name: 'Place Holder 2' },
      { id: 'slot_3', parentTeamId: 'team_b', name: 'Bravo Team' },
    ]);

    const res = await eventsGet(new NextRequest('http://localhost/api/events'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].attendees).toBe(2);
  });

  it('includes divisionDetails in POST /api/events/search responses', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_2',
        name: 'Search Split Division Event',
        divisions: ['event_2__division__open', 'event_2__division__advanced'],
        sportId: 'sport_1',
      },
    ]);
    prismaMock.divisions.findMany.mockResolvedValueOnce([
      {
        eventId: 'event_2',
        id: 'event_2__division__open',
        key: 'open',
        name: 'Open',
        price: 2500,
        maxParticipants: 6,
        sportId: 'sport_1',
      },
      {
        eventId: 'event_2',
        id: 'event_2__division__advanced',
        key: 'advanced',
        name: 'Advanced',
        price: 4500,
        maxParticipants: 8,
        sportId: 'sport_1',
      },
    ]);

    const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].divisionDetails).toEqual([
      expect.objectContaining({ id: 'event_2__division__open', price: 2500, maxParticipants: 6 }),
      expect.objectContaining({ id: 'event_2__division__advanced', price: 4500, maxParticipants: 8 }),
    ]);
    expect(prismaMock.divisions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: { in: ['event_2'] },
        }),
      }),
    );
  });

  it('allows hosts to explicitly query private events via GET /api/events', async () => {
    getTokenFromRequestMock.mockReturnValueOnce('token_1');
    verifySessionTokenMock.mockReturnValueOnce({ userId: 'host_1', isAdmin: false });
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsGet(new NextRequest('http://localhost/api/events?state=PRIVATE'));

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: 'PRIVATE',
          OR: [
            { hostId: 'host_1' },
            { assistantHostIds: { has: 'host_1' } },
          ],
        }),
      }),
    );
  });

  it('returns events from POST /api/events/search even when division enrichment fails', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_2',
        name: 'Search Split Division Event',
        divisions: ['event_2__division__open'],
        sportId: 'sport_1',
      },
    ]);
    prismaMock.divisions.findMany.mockRejectedValueOnce(new Error('divisions table unavailable'));

    const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].id).toBe('event_2');
    expect(json.events[0].divisionDetails).toEqual([]);
  });

  it('returns attendee counts that exclude placeholder teams in POST /api/events/search', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_2',
        name: 'Search League Event',
        eventType: 'LEAGUE',
        teamSignup: true,
        teamIds: ['slot_1', 'slot_2', 'slot_3'],
        userIds: [],
        divisions: [],
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValueOnce([
      { id: 'slot_1', parentTeamId: 'team_a', name: 'Alpha Team' },
      { id: 'slot_2', parentTeamId: null, name: 'Place Holder 2' },
      { id: 'slot_3', parentTeamId: 'team_b', name: 'Bravo Team' },
    ]);

    const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].attendees).toBe(2);
  });

  it('returns events from POST /api/events/search even when attendee enrichment fails', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_2',
        name: 'Search League Event',
        eventType: 'LEAGUE',
        teamSignup: true,
        teamIds: ['slot_1', 'slot_2'],
        userIds: [],
        divisions: [],
      },
    ]);
    prismaMock.teams.findMany.mockRejectedValueOnce(new Error('teams table unavailable'));

    const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].attendees).toBe(2);
  });

  it('defaults POST /api/events/search to today-and-later results', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-19T15:45:00.000Z'));
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    try {
      const res = await searchPost(jsonPost('http://localhost/api/events/search', { filters: {} }));

      expect(res.status).toBe(200);

      const findManyCalls = prismaMock.events.findMany.mock.calls;
      const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
      const andClauses = Array.isArray(callArgs?.where?.AND) ? callArgs.where.AND : [];
      const dateFloorClause = andClauses.find((clause: any) =>
        Array.isArray(clause?.OR)
        && clause.OR.some((entry: any) => entry?.start?.gte instanceof Date),
      );
      const startGte = dateFloorClause?.OR?.find((entry: any) => entry?.eventType?.not === 'WEEKLY_EVENT')?.start?.gte as Date | undefined;
      const expectedStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate(),
        0,
        0,
        0,
        0,
      );
      expect(startGte?.toISOString()).toBe(expectedStart.toISOString());
    } finally {
      jest.useRealTimers();
    }
  });

  it('treats query search as a separate mode without default date floor and returns relevance-ranked names', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      { id: 'event_4', name: 'The Indoor Finals', location: '', description: '', state: 'PUBLISHED' },
      { id: 'event_3', name: 'Playindoor Open', location: '', description: '', state: 'PUBLISHED' },
      { id: 'event_2', name: 'Indoor Soccer Arena League', location: '', description: '', state: 'PUBLISHED' },
      { id: 'event_1', name: 'Indoor', location: '', description: '', state: 'PUBLISHED' },
    ]);

    const res = await searchPost(jsonPost('http://localhost/api/events/search', {
      filters: { query: 'indoor' },
      limit: 4,
      offset: 0,
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
        take: 50,
        skip: 0,
      }),
    );

    const findManyCalls = prismaMock.events.findMany.mock.calls;
    const callArgs = findManyCalls.length > 0 ? findManyCalls[findManyCalls.length - 1]?.[0] : undefined;
    expect(callArgs?.where?.start).toBeUndefined();
    expect(json.events.map((event: any) => event.name)).toEqual([
      'Indoor',
      'Indoor Soccer Arena League',
      'The Indoor Finals',
      'Playindoor Open',
    ]);
  });

  it('excludes templates from GET /api/events/field/:fieldId results', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsByFieldGet(
      new NextRequest('http://localhost/api/events/field/field_1'),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { state: 'TEMPLATE' } }),
      }),
    );
  });

  it('returns events from GET /api/events even when division enrichment fails', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_1',
        name: 'Split Division Event',
        divisions: ['event_1__division__open'],
        sportId: 'sport_1',
      },
    ]);
    prismaMock.divisions.findMany.mockRejectedValueOnce(new Error('divisions table unavailable'));

    const res = await eventsGet(new NextRequest('http://localhost/api/events'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events[0].id).toBe('event_1');
    expect(json.events[0].divisionDetails).toEqual([]);
  });

  it('uses overlap filtering for GET /api/events/field/:fieldId range queries', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);
    const startIso = '2026-02-01T00:00:00.000Z';
    const endIso = '2026-02-07T23:59:59.999Z';

    const res = await eventsByFieldGet(
      new NextRequest(`http://localhost/api/events/field/field_1?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          start: { lte: new Date(endIso) },
          OR: [
            { end: null },
            { end: { gte: new Date(startIso) } },
          ],
        }),
      }),
    );
  });

  it('uses lightweight event selection for GET /api/events/field/:fieldId overlap-only rental queries', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([]);

    const res = await eventsByFieldGet(
      new NextRequest('http://localhost/api/events/field/field_1?rentalOverlapOnly=1'),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          eventType: true,
          parentEvent: true,
          start: true,
          end: true,
          timeSlotIds: true,
        }),
      }),
    );
  });

  it('filters overlap-only field events to rental slot windows', async () => {
    prismaMock.events.findMany.mockResolvedValueOnce([
      {
        id: 'event_outside_slot',
        eventType: 'EVENT',
        parentEvent: null,
        start: new Date('2026-04-01T18:00:00.000Z'),
        end: new Date('2026-04-01T19:00:00.000Z'),
        timeSlotIds: [],
      },
    ]);
    prismaMock.fields.findFirst.mockResolvedValueOnce({ rentalSlotIds: ['slot_1'] });
    prismaMock.timeSlots.findMany.mockResolvedValueOnce([
      {
        id: 'slot_1',
        dayOfWeek: 2,
        daysOfWeek: [2],
        repeating: true,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.000Z'),
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 11 * 60,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
      },
    ]);

    const res = await eventsByFieldGet(
      new NextRequest('http://localhost/api/events/field/field_1?start=2026-03-29T07:00:00.000Z&end=2026-04-05T06:59:59.000Z&rentalOverlapOnly=1'),
      { params: Promise.resolve({ fieldId: 'field_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.events)).toBe(true);
    expect(json.events).toHaveLength(0);
  });

  it('excludes template matches from GET /api/fields/:id/matches results', async () => {
    prismaMock.matches.findMany.mockResolvedValueOnce([
      { id: 'match_published', eventId: 'event_published', fieldId: 'field_1' },
      { id: 'match_template', eventId: 'event_template', fieldId: 'field_1' },
    ]);
    prismaMock.events.findMany.mockResolvedValueOnce([{ id: 'event_published' }]);

    const res = await matchesByFieldGet(
      new NextRequest('http://localhost/api/fields/field_1/matches'),
      { params: Promise.resolve({ id: 'field_1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { state: 'TEMPLATE' },
        }),
      }),
    );

    const matchIds = (json.matches as Array<{ id?: string; $id?: string }>)
      .map((row) => row.id ?? row.$id)
      .filter((id): id is string => Boolean(id));
    expect(matchIds).toEqual(['match_published']);
  });

  it('uses overlap filtering for GET /api/fields/:id/matches range queries', async () => {
    prismaMock.matches.findMany.mockResolvedValueOnce([]);
    const startIso = '2026-02-01T00:00:00.000Z';
    const endIso = '2026-02-07T23:59:59.999Z';

    const res = await matchesByFieldGet(
      new NextRequest(`http://localhost/api/fields/field_1/matches?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`),
      { params: Promise.resolve({ id: 'field_1' }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { start: { lte: new Date(endIso) } },
            {
              OR: [
                { end: null },
                { end: { gte: new Date(startIso) } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('uses lightweight match selection for GET /api/fields/:id/matches overlap-only rental queries', async () => {
    prismaMock.matches.findMany.mockResolvedValueOnce([]);

    const res = await matchesByFieldGet(
      new NextRequest('http://localhost/api/fields/field_1/matches?rentalOverlapOnly=true'),
      { params: Promise.resolve({ id: 'field_1' }) },
    );

    expect(res.status).toBe(200);
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          start: true,
          end: true,
          eventId: true,
          fieldId: true,
        }),
      }),
    );
  });
});
