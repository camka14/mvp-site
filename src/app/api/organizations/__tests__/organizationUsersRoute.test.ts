/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  eventOfficials: {
    findMany: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
  },
  staffMembers: {
    findUnique: jest.fn(),
  },
  invites: {
    findMany: jest.fn(),
  },
  templateDocuments: {
    findMany: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET } from '@/app/api/organizations/[id]/users/route';

describe('GET /api/organizations/[id]/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
    prismaMock.fields.findMany.mockResolvedValue([]);
    prismaMock.eventOfficials.findMany.mockResolvedValue([]);
  });

  it('returns 403 for users who are not part of the organization', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      officialIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'League Night',
        start: new Date('2026-01-10T18:00:00.000Z'),
        end: new Date('2026-01-10T20:00:00.000Z'),
        organizationId: 'org_1',
        userIds: ['player_1'],
      },
    ]);
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.userData.findMany).not.toHaveBeenCalled();
  });

  it('returns aggregated users with events and signed documents', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'player_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'player@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      officialIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'League Night',
        start: new Date('2026-01-10T18:00:00.000Z'),
        end: new Date('2026-01-10T20:00:00.000Z'),
        organizationId: 'org_1',
        userIds: ['player_1'],
      },
      {
        id: 'event_2',
        name: 'Weekend Ladder',
        start: new Date('2026-02-14T16:00:00.000Z'),
        end: new Date('2026-02-14T19:00:00.000Z'),
        organizationId: 'org_1',
        userIds: [],
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_1',
        registrantId: 'player_1',
        registrantType: 'SELF',
        status: 'ACTIVE',
      },
      {
        eventId: 'event_2',
        registrantId: 'player_1',
        registrantType: 'SELF',
        status: 'STARTED',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([
      {
        id: 'player_1',
        firstName: 'Pat',
        lastName: 'Lee',
        userName: 'plee',
      },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([
      {
        id: 'tmpl_pdf',
        title: 'Liability Waiver',
        type: 'PDF',
        content: null,
      },
      {
        id: 'tmpl_text',
        title: 'Code of Conduct',
        type: 'TEXT',
        content: 'I agree to follow the code of conduct.',
      },
    ]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([
      {
        id: 'signed_pdf_1',
        signedDocumentId: 'doc_pdf_1',
        templateId: 'tmpl_pdf',
        userId: 'player_1',
        documentName: 'Signed Document',
        eventId: 'event_1',
        status: 'SIGNED',
        signedAt: '2026-01-10T19:00:00.000Z',
        createdAt: new Date('2026-01-10T19:00:00.000Z'),
      },
      {
        id: 'signed_text_1',
        signedDocumentId: 'doc_text_1',
        templateId: 'tmpl_text',
        userId: 'player_1',
        documentName: 'Text Waiver',
        eventId: 'event_2',
        status: 'SIGNED',
        signedAt: '2026-02-14T18:30:00.000Z',
        createdAt: new Date('2026-02-14T18:30:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(1);
    expect(payload.users[0]).toEqual(expect.objectContaining({
      userId: 'player_1',
      fullName: 'Pat Lee',
      userName: 'plee',
    }));
    expect(payload.users[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: 'event_1', eventName: 'League Night', status: 'ACTIVE' }),
      expect.objectContaining({ eventId: 'event_2', eventName: 'Weekend Ladder', status: 'STARTED' }),
    ]));
    expect(payload.users[0].documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signedDocumentRecordId: 'signed_pdf_1',
        type: 'PDF',
        viewUrl: '/api/documents/signed/signed_pdf_1/file',
      }),
      expect.objectContaining({
        signedDocumentRecordId: 'signed_text_1',
        type: 'TEXT',
        content: 'I agree to follow the code of conduct.',
      }),
    ]));
  });

  it('includes users from teams registered for organization events', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      officialIds: [],
      hostIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Test League',
        start: new Date('2026-03-01T18:00:00.000Z'),
        end: new Date('2026-03-01T20:00:00.000Z'),
        organizationId: 'org_1',
        userIds: [],
        teamIds: ['team_slot_1'],
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_1',
        registrantId: 'team_slot_1',
        registrantType: 'TEAM',
        status: 'ACTIVE',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValue([
      {
        id: 'team_slot_1',
        playerIds: ['player_1', 'player_2'],
        captainId: 'captain_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'player_1', firstName: 'Alex', lastName: 'Brown', userName: 'abrown' },
      { id: 'player_2', firstName: 'Sam', lastName: 'Fox', userName: 'sfox' },
      { id: 'captain_1', firstName: 'Casey', lastName: 'Ng', userName: 'cng' },
      { id: 'manager_1', firstName: 'Morgan', lastName: 'Diaz', userName: 'mdiaz' },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(4);
    expect(payload.users.map((row: { userId: string }) => row.userId)).toEqual(expect.arrayContaining([
      'captain_1',
      'manager_1',
      'player_1',
      'player_2',
    ]));
    payload.users.forEach((row: { events: Array<{ eventId: string; status?: string }> }) => {
      expect(row.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          eventId: 'event_1',
          status: 'ACTIVE',
        }),
      ]));
    });
  });

  it('includes host and staff users from external events that use organization fields', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      officialIds: [],
      hostIds: [],
    });
    prismaMock.fields.findMany.mockResolvedValue([
      { id: 'field_org_1' },
    ]);
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_ext_1',
        name: 'Rental Event',
        start: new Date('2026-03-15T18:00:00.000Z'),
        end: new Date('2026-03-15T20:00:00.000Z'),
        organizationId: 'external_org_1',
        userIds: ['player_1'],
        teamIds: [],
        hostId: 'host_1',
        assistantHostIds: ['assistant_host_1'],
        officialIds: ['official_1'],
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.eventOfficials.findMany.mockResolvedValue([
      {
        eventId: 'event_ext_1',
        userId: 'event_official_1',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'player_1', firstName: 'Pat', lastName: 'Lee', userName: 'plee' },
      { id: 'host_1', firstName: 'Host', lastName: 'One', userName: 'hostone' },
      { id: 'assistant_host_1', firstName: 'Assist', lastName: 'One', userName: 'assistone' },
      { id: 'official_1', firstName: 'Official', lastName: 'One', userName: 'officialone' },
      { id: 'event_official_1', firstName: 'Crew', lastName: 'One', userName: 'crewone' },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { organizationId: 'org_1' },
          { fieldIds: { hasSome: ['field_org_1'] } },
        ],
      },
    }));
    expect(payload.users.map((row: { userId: string }) => row.userId)).toEqual(expect.arrayContaining([
      'assistant_host_1',
      'event_official_1',
      'host_1',
      'official_1',
      'player_1',
    ]));
    payload.users.forEach((row: { events: Array<{ eventId: string }> }) => {
      expect(row.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ eventId: 'event_ext_1' }),
      ]));
    });
  });

  it('does not include host and staff users from organization-owned events', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      officialIds: [],
      hostIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_org_1',
        name: 'Organization Event',
        start: new Date('2026-03-20T18:00:00.000Z'),
        end: new Date('2026-03-20T20:00:00.000Z'),
        organizationId: 'org_1',
        userIds: ['player_1'],
        teamIds: [],
        hostId: 'host_1',
        assistantHostIds: ['assistant_host_1'],
        officialIds: ['official_1'],
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'player_1', firstName: 'Pat', lastName: 'Lee', userName: 'plee' },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.eventOfficials.findMany).not.toHaveBeenCalled();
    expect(payload.users.map((row: { userId: string }) => row.userId)).toEqual(['player_1']);
    expect(payload.users[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: 'event_org_1' }),
    ]));
  });

  it('allows verified razumly admins even when they are not org members', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'raz_admin_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'admin@razumly.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
      officialIds: [],
      hostIds: [],
    });
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users).toEqual([]);
  });
});
