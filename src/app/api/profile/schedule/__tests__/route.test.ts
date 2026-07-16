/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  userData: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  matches: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  teamRegistrations: {
    findMany: jest.fn(),
  },
  teamStaffAssignments: {
    findMany: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET } from '@/app/api/profile/schedule/route';

describe('GET /api/profile/schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockReset();
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);
  });

  it('returns batched participant schedule payload', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: ['team_1'],
    });
    prismaMock.teamRegistrations.findMany.mockResolvedValue([{ userId: 'user_1', teamId: 'team_1' }]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Test Event',
        hostId: 'user_1',
        state: 'PUBLISHED',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T12:00:00Z'),
        fieldIds: ['field_1'],
      },
    ]);
    prismaMock.eventRegistrations.findMany
      .mockResolvedValueOnce([{ eventId: 'event_1' }])
      .mockResolvedValueOnce([{
        id: 'registration_1',
        eventId: 'event_1',
        registrantId: 'team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      }]);
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_1',
        eventId: 'event_1',
        fieldId: 'field_1',
        team1Id: 'team_1',
        team2Id: 'team_2',
        teamOfficialId: null,
        officialId: 'user_1',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T11:00:00Z'),
      },
    ]);
    prismaMock.fields.findMany.mockResolvedValue([
      { id: 'field_1', name: 'Field 1' },
    ]);
    prismaMock.divisions.findMany.mockResolvedValue([
      { eventId: 'event_1', id: 'event_1__division__open' },
    ]);
    prismaMock.teams.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.parentTeamId) {
        return [{ id: 'team_2' }];
      }
      if (args?.where?.id) {
        return [
        { id: 'team_1', name: 'Team One' },
        { id: 'team_2', name: 'Team Two' },
        ];
      }
      return [];
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/profile/schedule?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z&limit=50',
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.events[0].divisions).toEqual(['event_1__division__open']);
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0]).toEqual(expect.objectContaining({
      start: '2026-03-01T10:00:00.000Z',
      end: '2026-03-01T11:00:00.000Z',
    }));
    expect(json.fields).toHaveLength(1);
    expect(json.teams).toHaveLength(2);
    expect(json.pagination).toEqual({
      limit: 50,
      hasMore: false,
      nextCursor: null,
      isComplete: true,
      windowFrom: '2026-03-01T00:00:00.000Z',
      windowTo: '2026-03-31T23:59:59.000Z',
    });

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { state: 'TEMPLATE' },
          OR: expect.arrayContaining([
            { hostId: 'user_1' },
            { id: { in: ['event_1'] } },
          ]),
          AND: expect.any(Array),
        }),
        take: 51,
        orderBy: [{ start: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: { in: ['event_1'] },
          OR: expect.arrayContaining([
            { officialId: 'user_1' },
            { eventId: { in: ['event_1'] } },
            { team1Id: { in: ['team_1', 'team_2'] } },
            { team2Id: { in: ['team_1', 'team_2'] } },
            { teamOfficialId: { in: ['team_1', 'team_2'] } },
          ]),
          AND: expect.any(Array),
        }),
        take: 5001,
        orderBy: [{ start: 'asc' }, { matchId: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('keeps open-ended events in the bounded window and time-bounds their matches', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_open',
        name: 'Ongoing League',
        state: 'PUBLISHED',
        start: new Date('2025-01-01T10:00:00Z'),
        end: new Date('2025-02-01T10:00:00Z'),
        noFixedEndDateTime: true,
        fieldIds: [],
        teamIds: [],
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([
      {
        id: 'match_current',
        eventId: 'event_open',
        matchId: 7,
        officialId: 'user_1',
        start: new Date('2026-07-13T12:00:00Z'),
        end: new Date('2026-07-13T13:00:00Z'),
        fieldId: null,
        team1Id: null,
        team2Id: null,
        teamOfficialId: null,
      },
    ]);

    const response = await GET(new NextRequest(
      'http://localhost/api/profile/schedule?from=2026-07-01T00:00:00Z&to=2026-07-31T23:59:59Z',
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events.map((event: { id: string }) => event.id)).toEqual(['event_open']);
    expect(json.matches.map((match: { id: string }) => match.id)).toEqual(['match_current']);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          {
            OR: [
              { noFixedEndDateTime: true },
              { end: null },
              { end: { gte: new Date('2026-07-01T00:00:00Z') } },
            ],
          },
        ]),
      }),
    }));
    expect(prismaMock.matches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: { in: ['event_open'] },
        AND: [
          {
            OR: [
              {
                start: { lte: new Date('2026-07-31T23:59:59Z') },
                AND: [
                  {
                    OR: [
                      { end: { gte: new Date('2026-07-01T00:00:00Z') } },
                      { end: null, start: { gte: new Date('2026-07-01T00:00:00Z') } },
                    ],
                  },
                ],
              },
              {
                start: null,
                actualStart: {
                  gte: new Date('2026-07-01T00:00:00Z'),
                  lte: new Date('2026-07-31T23:59:59Z'),
                },
              },
            ],
          },
        ],
      }),
      take: 5001,
      orderBy: [{ start: 'asc' }, { matchId: 'asc' }, { id: 'asc' }],
    }));
  });

  it('fails closed when one event page exceeds the bounded match result limit', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Large Event',
        state: 'PUBLISHED',
        start: new Date('2026-07-01T10:00:00Z'),
        end: new Date('2026-07-31T10:00:00Z'),
        fieldIds: [],
        teamIds: [],
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue(
      Array.from({ length: 5001 }, (_, index) => ({
        id: `match_${index}`,
        eventId: 'event_1',
        matchId: index,
      })),
    );

    const response = await GET(new NextRequest(
      'http://localhost/api/profile/schedule?from=2026-07-01T00:00:00Z&to=2026-07-31T23:59:59Z',
    ));
    const json = await response.json();

    expect(response.status).toBe(413);
    expect(json.code).toBe('SCHEDULE_MATCH_WINDOW_TOO_LARGE');
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the user record does not exist', async () => {
    prismaMock.userData.findUnique.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule'));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('User not found');
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('does not query matches, fields, or teams when no events are found', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toEqual([]);
    expect(json.matches).toEqual([]);
    expect(prismaMock.matches.findMany).not.toHaveBeenCalled();
    expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
    expect(prismaMock.teams.findMany).not.toHaveBeenCalled();
  });

  it('includes events where the user is the host even without participant involvement', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'hosted_event_1',
        name: 'Test map',
        state: 'PUBLISHED',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T12:00:00Z'),
        fieldIds: [],
        teamIds: [],
        hostId: 'user_1',
        userIds: [],
        freeAgentIds: [],
        waitListIds: [],
        officialIds: [],
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/profile/schedule?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z&limit=50',
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.events[0].id).toBe('hosted_event_1');
    expect(json.events[0].name).toBe('Test map');

    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { state: 'TEMPLATE' },
          OR: expect.arrayContaining([
            { hostId: 'user_1' },
          ]),
          AND: expect.any(Array),
        }),
        take: 51,
      }),
    );
  });

  it('returns a deterministic cursor and continues after the last event in the page', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({ id: 'user_1' });
    prismaMock.matches.findMany.mockResolvedValue([]);
    prismaMock.events.findMany
      .mockResolvedValueOnce([
        {
          id: 'event_a',
          name: 'First Event',
          state: 'PUBLISHED',
          start: new Date('2026-03-01T10:00:00Z'),
          end: new Date('2026-03-01T11:00:00Z'),
          fieldIds: [],
          teamIds: [],
        },
        {
          id: 'event_b',
          name: 'Second Event',
          state: 'PUBLISHED',
          start: new Date('2026-03-01T10:00:00Z'),
          end: new Date('2026-03-01T11:00:00Z'),
          fieldIds: [],
          teamIds: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'event_b',
          name: 'Second Event',
          state: 'PUBLISHED',
          start: new Date('2026-03-01T10:00:00Z'),
          end: new Date('2026-03-01T11:00:00Z'),
          fieldIds: [],
          teamIds: [],
        },
      ]);

    const firstResponse = await GET(
      new NextRequest('http://localhost/api/profile/schedule?limit=1'),
    );
    const firstJson = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstJson.events.map((event: { id: string }) => event.id)).toEqual(['event_a']);
    expect(firstJson.pagination).toEqual(expect.objectContaining({
      limit: 1,
      hasMore: true,
      nextCursor: expect.any(String),
      isComplete: false,
      windowFrom: expect.any(String),
      windowTo: expect.any(String),
    }));
    expect(prismaMock.events.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      take: 2,
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
    }));

    const secondResponse = await GET(
      new NextRequest(
        `http://localhost/api/profile/schedule?limit=1&cursor=${encodeURIComponent(firstJson.pagination.nextCursor)}`,
      ),
    );
    const secondJson = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondJson.events.map((event: { id: string }) => event.id)).toEqual(['event_b']);
    expect(secondJson.pagination).toEqual(expect.objectContaining({
      limit: 1,
      hasMore: false,
      nextCursor: null,
      isComplete: true,
      windowFrom: firstJson.pagination.windowFrom,
      windowTo: firstJson.pagination.windowTo,
    }));
    expect(prismaMock.events.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          {
            OR: [
              { start: { gt: new Date('2026-03-01T10:00:00Z') } },
              {
                start: new Date('2026-03-01T10:00:00Z'),
                id: { gt: 'event_a' },
              },
            ],
          },
        ]),
      }),
      take: 2,
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
    }));
  });

  it('rejects an invalid cursor instead of silently replaying the first page', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/profile/schedule?cursor=not-a-valid-cursor'),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid schedule cursor');
    expect(prismaMock.userData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('rejects reversed or unbounded date windows before querying schedule data', async () => {
    const reversedResponse = await GET(
      new NextRequest(
        'http://localhost/api/profile/schedule?from=2026-04-01T00:00:00Z&to=2026-03-01T00:00:00Z',
      ),
    );
    const oversizedResponse = await GET(
      new NextRequest(
        'http://localhost/api/profile/schedule?from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z',
      ),
    );

    expect(reversedResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(400);
    expect(prismaMock.userData.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.events.findMany).not.toHaveBeenCalled();
  });

  it('includes events discovered through registration rows even when legacy participant arrays are empty', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: [],
    });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      { eventId: 'event_1' },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Registered Event',
        state: 'PUBLISHED',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T12:00:00Z'),
        fieldIds: ['field_1'],
        teamIds: [],
        hostId: 'host_1',
        userIds: [],
        freeAgentIds: [],
        waitListIds: [],
        officialIds: [],
      },
    ]);
    prismaMock.matches.findMany.mockResolvedValue([]);
    prismaMock.fields.findMany.mockResolvedValue([
      { id: 'field_1', name: 'Field 1' },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.events[0].id).toBe('event_1');
    expect(prismaMock.eventRegistrations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['ACTIVE', 'PENDING', 'STARTED', 'BLOCKED'] },
          OR: [
            {
              registrantId: 'user_1',
              registrantType: { in: ['SELF', 'CHILD'] },
            },
          ],
        },
        select: { eventId: true },
      }),
    );
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { id: { in: ['event_1'] } },
          ]),
        }),
      }),
    );
  });

  it('hydrates event-team rows through the generated teams delegate', async () => {
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      teamIds: ['team_1'],
    });
    prismaMock.teamRegistrations.findMany.mockResolvedValue([{ userId: 'user_1', teamId: 'team_1' }]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        start: new Date('2026-03-01T10:00:00Z'),
        end: new Date('2026-03-01T12:00:00Z'),
        fieldIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findMany
      .mockResolvedValueOnce([{ eventId: 'event_1' }])
      .mockResolvedValueOnce([{
        id: 'registration_1',
        eventId: 'event_1',
        registrantId: 'team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      }]);
    prismaMock.matches.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([{ id: 'team_1', name: 'Event Team' }]);

    const response = await GET(new NextRequest('http://localhost/api/profile/schedule'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.teams).toHaveLength(1);
    expect(prismaMock.teams.findMany).toHaveBeenCalled();
  });
});
