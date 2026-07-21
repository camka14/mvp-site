/** @jest-environment node */

import { NextRequest } from 'next/server';

const findManyMock = jest.fn();
const createMock = jest.fn();
const canonicalTeamsFindManyMock = jest.fn();
const teamRegistrationsFindManyMock = jest.fn();
const teamStaffAssignmentsFindManyMock = jest.fn();
const organizationFindUniqueMock = jest.fn();

const prismaMock: any = {
  teams: {
    findMany: (...args: any[]) => findManyMock(...args),
    create: (...args: any[]) => createMock(...args),
  },
  organizations: {
    findUnique: (...args: any[]) => organizationFindUniqueMock(...args),
  },
};

const requireSessionMock = jest.fn();
const getOptionalSessionMock = jest.fn();
const syncTeamChatByTeamIdMock = jest.fn();
const hasOrgPermissionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: any[]) => getOptionalSessionMock(...args),
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));
jest.mock('@/server/teamChatSync', () => ({
  syncTeamChatByTeamId: (...args: any[]) => syncTeamChatByTeamIdMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: (...args: any[]) => hasOrgPermissionMock(...args),
}));

import { GET, POST } from '@/app/api/teams/route';

const postJson = (body: unknown) => new NextRequest('http://localhost/api/teams', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/teams route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete prismaMock.canonicalTeams;
    delete prismaMock.teamRegistrations;
    delete prismaMock.teamStaffAssignments;
    getOptionalSessionMock.mockResolvedValue(null);
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    syncTeamChatByTeamIdMock.mockResolvedValue(undefined);
    hasOrgPermissionMock.mockResolvedValue(false);
    organizationFindUniqueMock.mockResolvedValue(null);
  });

  it('filters by player OR manager when both query params are supplied', async () => {
    findManyMock.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/teams?playerId=user_1&managerId=user_1&limit=25'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toEqual([]);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          {
            OR: [
              { playerIds: { has: 'user_1' } },
              { managerId: 'user_1' },
            ],
          },
          { archivedAt: null },
        ],
      },
      take: 26,
      skip: 0,
      orderBy: { name: 'asc' },
    }));
  });

  it('can include child teams when explicitly requested', async () => {
    findManyMock.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost/api/teams?playerId=user_1&managerId=user_1&includeChildTeams=true&limit=25'),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toEqual([]);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          {
            OR: [
              { playerIds: { has: 'user_1' } },
              { managerId: 'user_1' },
            ],
          },
          { archivedAt: null },
        ],
      },
      take: 26,
      skip: 0,
      orderBy: { name: 'asc' },
    }));
  });

  it('replaces affiliate destinations in public team lists', async () => {
    findManyMock.mockResolvedValue([{
      id: 'team_affiliate',
      name: 'Partner Academy',
      playerIds: [],
      pending: [],
      teamSize: 12,
      affiliateUrl: 'https://partner.example.com/register',
    }]);

    const response = await GET(new NextRequest('http://localhost/api/teams?limit=25'));
    const payload = await response.json();

    expect(payload.teams[0].affiliateUrl).toMatch(/^https:\/\/bracket-iq\.com\/out\/team\/team_affiliate\//);
    expect(JSON.stringify(payload)).not.toContain('partner.example.com');
  });

  it('includes admin-only organization teams for users who can manage that organization', async () => {
    const session = { userId: 'owner_1', isAdmin: false };
    const organization = {
      id: 'org_1',
      ownerId: 'owner_1',
    };
    getOptionalSessionMock.mockResolvedValue(session);
    organizationFindUniqueMock.mockResolvedValue(organization);
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.canonicalTeams = {
      findMany: (...args: any[]) => canonicalTeamsFindManyMock(...args),
    };
    prismaMock.teamRegistrations = {
      findMany: (...args: any[]) => teamRegistrationsFindManyMock(...args),
    };
    prismaMock.teamStaffAssignments = {
      findMany: (...args: any[]) => teamStaffAssignmentsFindManyMock(...args),
    };
    canonicalTeamsFindManyMock.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/teams?organizationId=org_1&limit=200'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toEqual([]);
    expect(organizationFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { id: true, ownerId: true },
    });
    expect(hasOrgPermissionMock).toHaveBeenCalledWith(session, organization, 'teams.manage');
    expect(canonicalTeamsFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org_1', archivedAt: null },
      take: 201,
      skip: 0,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    }));
  });

  it('keeps admin-only organization teams hidden from users who cannot manage that organization', async () => {
    const session = { userId: 'user_2', isAdmin: false };
    const organization = {
      id: 'org_1',
      ownerId: 'owner_1',
    };
    getOptionalSessionMock.mockResolvedValue(session);
    organizationFindUniqueMock.mockResolvedValue(organization);
    hasOrgPermissionMock.mockResolvedValue(false);
    prismaMock.canonicalTeams = {
      findMany: (...args: any[]) => canonicalTeamsFindManyMock(...args),
    };
    prismaMock.teamRegistrations = {
      findMany: (...args: any[]) => teamRegistrationsFindManyMock(...args),
    };
    prismaMock.teamStaffAssignments = {
      findMany: (...args: any[]) => teamStaffAssignmentsFindManyMock(...args),
    };
    canonicalTeamsFindManyMock.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/teams?organizationId=org_1&limit=200'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toEqual([]);
    expect(canonicalTeamsFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        visibility: 'PUBLIC',
        organizationId: 'org_1',
        archivedAt: null,
      },
      take: 201,
      skip: 0,
      orderBy: [{ openRegistration: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    }));
  });

  it('returns the event-scoped team when an id also exists as a canonical team', async () => {
    prismaMock.canonicalTeams = {
      findMany: (...args: any[]) => canonicalTeamsFindManyMock(...args),
    };
    prismaMock.teamRegistrations = {
      findMany: (...args: any[]) => teamRegistrationsFindManyMock(...args),
    };
    prismaMock.teamStaffAssignments = {
      findMany: (...args: any[]) => teamStaffAssignmentsFindManyMock(...args),
    };
    findManyMock.mockResolvedValue([
      {
        id: 'shared_id',
        name: 'Sea Glass Smash',
        eventId: 'event_1',
        kind: 'REGISTERED',
        playerIds: ['player_1'],
        playerRegistrationIds: [],
        division: 'mens',
        divisionTypeId: 'mens',
        wins: 0,
        losses: 0,
        captainId: 'player_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        staffAssignmentIds: [],
        parentTeamId: 'sea_glass_canonical',
        pending: [],
        teamSize: 2,
        profileImageId: null,
        sport: 'Beach Volleyball',
      },
    ]);
    canonicalTeamsFindManyMock.mockResolvedValue([
      {
        id: 'sea_glass_canonical',
        openRegistration: true,
        registrationPriceCents: 2500,
        requiredTemplateIds: ['waiver_1'],
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/teams?ids=shared_id&eventId=event_1&limit=200'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toEqual([
      expect.objectContaining({
        id: 'shared_id',
        id: 'shared_id',
        name: 'Sea Glass Smash',
        eventId: 'event_1',
        parentTeamId: 'sea_glass_canonical',
        openRegistration: true,
        registrationPriceCents: 2500,
        requiredTemplateIds: ['waiver_1'],
      }),
    ]);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ['shared_id'] },
        eventId: 'event_1',
      },
    });
    expect(canonicalTeamsFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ['sea_glass_canonical'] } },
      select: {
        id: true,
        joinPolicy: true,
        openRegistration: true,
        registrationPriceCents: true,
        requiredTemplateIds: true,
      },
    });
    expect(teamRegistrationsFindManyMock).not.toHaveBeenCalled();
    expect(teamStaffAssignmentsFindManyMock).not.toHaveBeenCalled();
  });

  it('creates a manager-only team when addSelfAsPlayer is false', async () => {
    createMock.mockResolvedValue({
      id: 'team_1',
      name: 'Managed Team',
      division: 'Open',
      sport: 'Indoor Volleyball',
      playerIds: ['user_2'],
      captainId: '',
      managerId: 'user_1',
      coachIds: [],
      pending: [],
      teamSize: 6,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(postJson({
      id: 'team_1',
      name: 'Managed Team',
      addSelfAsPlayer: false,
      playerIds: ['user_2'],
      teamSize: 6,
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.captainId).toBe('');
    expect(payload.managerId).toBe('user_1');

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'team_1',
        name: 'Managed Team',
        captainId: '',
        managerId: 'user_1',
        playerIds: ['user_2'],
      }),
    }));
  });

  it('keeps the creator as a player without making them captain and supports a creator coaching role', async () => {
    createMock.mockResolvedValue({
      id: 'team_creator_roles',
      name: 'Creator Roles',
      playerIds: ['user_1'],
      captainId: '',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: ['user_1'],
      pending: [],
      teamSize: 6,
    });

    const response = await POST(postJson({
      id: 'team_creator_roles',
      name: 'Creator Roles',
      addSelfAsPlayer: true,
      creatorIsCaptain: false,
      creatorCoachRole: 'ASSISTANT_COACH',
      teamSize: 6,
    }));

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        playerIds: ['user_1'],
        captainId: '',
        managerId: 'user_1',
        coachIds: ['user_1'],
      }),
    }));
  });

  it('fails closed when legacy team storage rejects a requested field', async () => {
    createMock.mockRejectedValueOnce(
      new Error('Unknown argument `joinPolicy` for type VolleyBallTeamsCreateInput.'),
    );

    const response = await POST(postJson({
      id: 'team_1',
      name: 'Schema Contract Team',
      teamSize: 6,
      openRegistration: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ joinPolicy: 'OPEN_REGISTRATION' }),
    }));
    expect(syncTeamChatByTeamIdMock).not.toHaveBeenCalled();
    expect(payload).toEqual(expect.objectContaining({
      code: 'PRISMA_SCHEMA_CONTRACT_MISMATCH',
      field: 'joinPolicy',
    }));
  });

  it('coerces numeric team size input before creating a team', async () => {
    createMock.mockResolvedValue({
      id: 'team_size_string',
      name: 'Team Size String',
      division: 'Open',
      sport: 'Indoor Volleyball',
      playerIds: ['user_1'],
      captainId: 'user_1',
      managerId: 'user_1',
      coachIds: [],
      pending: [],
      teamSize: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(postJson({
      id: 'team_size_string',
      name: 'Team Size String',
      teamSize: '2',
    }));

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'team_size_string',
        teamSize: 2,
      }),
    }));
  });

  it('accepts mobile player registration metadata during team creation', async () => {
    createMock.mockResolvedValue({
      id: 'team_mobile_registration_metadata',
      name: 'Mobile Metadata',
      division: 'Open',
      sport: 'Indoor Volleyball',
      playerIds: ['user_1'],
      captainId: 'user_1',
      managerId: 'user_1',
      coachIds: [],
      pending: [],
      teamSize: 6,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(postJson({
      id: 'team_mobile_registration_metadata',
      name: 'Mobile Metadata',
      teamSize: 6,
      playerRegistrations: [
        {
          id: '',
          userId: 'user_1',
          registrantId: 'user_1',
          registrantType: 'SELF',
          rosterRole: null,
          status: 'ACTIVE',
          jerseyNumber: null,
          position: null,
          isCaptain: true,
          consentDocumentId: null,
          consentStatus: null,
          createdBy: 'user_1',
        },
      ],
    }));

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'team_mobile_registration_metadata',
        name: 'Mobile Metadata',
      }),
    }));
  });

  it('rejects team sizes below two with a specific message', async () => {
    const response = await POST(postJson({
      id: 'team_too_small',
      name: 'Too Small',
      teamSize: 1,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Team size must be 2 or above.');
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,external-registration',
    'https://user:password@partner.example.com/register',
  ])('rejects unsafe affiliate registration URL %s before creating a team', async (affiliateUrl) => {
    const response = await POST(postJson({
      id: 'team_unsafe_affiliate_url',
      name: 'Unsafe External Registration',
      affiliateUrl,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Enter a valid external registration link.');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('canonicalizes a safe affiliate registration URL before persisting it', async () => {
    createMock.mockResolvedValue({
      id: 'team_safe_affiliate_url',
      name: 'Safe External Registration',
      division: 'Open',
      sport: 'Indoor Volleyball',
      playerIds: ['user_1'],
      captainId: 'user_1',
      managerId: 'user_1',
      coachIds: [],
      pending: [],
      teamSize: 6,
      affiliateUrl: 'https://partner.example.com/register',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(postJson({
      id: 'team_safe_affiliate_url',
      name: 'Safe External Registration',
      affiliateUrl: ' HTTPS://Partner.Example.com/register ',
    }));

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ affiliateUrl: 'https://partner.example.com/register' }),
    }));
  });

  it('rejects requests with blank team names', async () => {
    const response = await POST(postJson({
      id: 'team_2',
      name: '   ',
      teamSize: 6,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Team name is required.');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects requests without team names', async () => {
    const response = await POST(postJson({
      id: 'team_3',
      teamSize: 6,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid input: expected string, received undefined');
    expect(createMock).not.toHaveBeenCalled();
  });
});

