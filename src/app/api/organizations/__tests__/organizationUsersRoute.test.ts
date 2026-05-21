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
  canonicalTeams: {
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
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
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
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_org_1',
        registrantId: 'player_1',
        registrantType: 'SELF',
        status: 'ACTIVE',
      },
    ]);
    prismaMock.eventOfficials.findMany.mockResolvedValue([]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValue([]);
    prismaMock.divisions.findMany.mockResolvedValue([]);
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
  });

  it('returns 403 for users who are not part of the organization', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
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
    prismaMock.bills.findMany.mockResolvedValueOnce([
      {
        id: 'bill_user_event_1',
        ownerType: 'USER',
        ownerId: 'player_1',
        eventId: 'event_1',
        parentBillId: null,
        totalAmountCents: 4500,
        paidAmountCents: 0,
        status: 'OPEN',
        allowSplit: false,
        paymentPlanEnabled: false,
        lineItems: null,
        createdAt: new Date('2026-01-10T18:10:00.000Z'),
        updatedAt: new Date('2026-01-10T18:10:00.000Z'),
      },
    ]);
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        id: 'payment_user_event_1',
        billId: 'bill_user_event_1',
        sequence: 1,
        dueDate: new Date('2026-01-10T18:10:00.000Z'),
        amountCents: 4500,
        status: 'PENDING',
        paidAt: null,
        paymentIntentId: null,
        payerUserId: null,
        refundedAmountCents: 0,
        createdAt: new Date('2026-01-10T18:10:00.000Z'),
        updatedAt: new Date('2026-01-10T18:10:00.000Z'),
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
    expect(payload.users[0].bills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        billId: 'bill_user_event_1',
        ownerType: 'USER',
        ownerId: 'player_1',
        eventName: 'League Night',
        totalAmountCents: 4500,
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

  it('returns canonical team customers with event team registrations and bills', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        start: new Date('2026-04-01T18:00:00.000Z'),
        end: new Date('2026-04-01T20:00:00.000Z'),
        organizationId: 'org_1',
        userIds: [],
        teamIds: ['event_team_1'],
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_1',
        registrantId: 'event_team_1',
        parentId: 'canonical_team_1',
        registrantType: 'TEAM',
        eventTeamId: 'event_team_1',
        status: 'ACTIVE',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValue([
      {
        id: 'event_team_1',
        name: 'Aces - Spring League',
        kind: 'REGISTERED',
        division: 'event_1__DIVISION__OPEN',
        divisionTypeId: 'open',
        sport: 'Volleyball',
        profileImageId: null,
        teamSize: 6,
        playerIds: ['player_1'],
        captainId: 'player_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        parentTeamId: 'canonical_team_1',
      },
    ]);
    prismaMock.canonicalTeams.findMany.mockResolvedValue([
      {
        id: 'canonical_team_1',
        name: 'Aces',
        division: 'event_1__DIVISION__OPEN',
        divisionTypeId: 'open',
        sport: 'Volleyball',
        profileImageId: null,
        teamSize: 6,
      },
    ]);
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'event_1__division__open',
        key: 'open',
        name: 'Open Division',
        divisionTypeId: 'open',
      },
    ]);
    prismaMock.teamRegistrations.findMany.mockResolvedValue([
      {
        teamId: 'canonical_team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        rosterRole: 'PARTICIPANT',
        jerseyNumber: '12',
        position: 'Setter',
        isCaptain: true,
      },
      {
        teamId: 'canonical_team_1',
        userId: 'manager_1',
        status: 'ACTIVE',
        rosterRole: 'PARTICIPANT',
        jerseyNumber: null,
        position: null,
        isCaptain: false,
      },
    ]);
    prismaMock.teamStaffAssignments.findMany.mockResolvedValue([
      {
        teamId: 'canonical_team_1',
        userId: 'manager_1',
        role: 'MANAGER',
        status: 'ACTIVE',
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([
      { id: 'player_1', firstName: 'Alex', lastName: 'Brown', userName: 'abrown' },
      { id: 'manager_1', firstName: 'Morgan', lastName: 'Diaz', userName: 'mdiaz' },
    ]);
    prismaMock.templateDocuments.findMany.mockResolvedValue([]);
    prismaMock.signedDocuments.findMany.mockResolvedValue([]);
    prismaMock.bills.findMany
      .mockResolvedValueOnce([
        {
          id: 'bill_team_1',
          ownerType: 'TEAM',
          ownerId: 'canonical_team_1',
          eventId: 'event_1',
          parentBillId: null,
          totalAmountCents: 12000,
          paidAmountCents: 0,
          status: 'OPEN',
          allowSplit: true,
          paymentPlanEnabled: false,
          lineItems: null,
          createdAt: new Date('2026-04-01T18:05:00.000Z'),
          updatedAt: new Date('2026-04-01T18:05:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'bill_user_1',
          ownerType: 'USER',
          ownerId: 'player_1',
          eventId: 'event_1',
          parentBillId: 'bill_team_1',
          totalAmountCents: 6000,
          paidAmountCents: 0,
          status: 'OPEN',
          allowSplit: false,
          paymentPlanEnabled: false,
          lineItems: null,
          createdAt: new Date('2026-04-01T18:06:00.000Z'),
          updatedAt: new Date('2026-04-01T18:06:00.000Z'),
        },
      ]);
    prismaMock.billPayments.findMany.mockResolvedValue([
      {
        id: 'payment_team_1',
        billId: 'bill_team_1',
        sequence: 1,
        dueDate: new Date('2026-04-01T18:05:00.000Z'),
        amountCents: 12000,
        status: 'PAID',
        paidAt: new Date('2026-04-01T18:07:00.000Z'),
        paymentIntentId: 'pi_team_1',
        payerUserId: 'manager_1',
        refundedAmountCents: 2000,
        createdAt: new Date('2026-04-01T18:05:00.000Z'),
        updatedAt: new Date('2026-04-01T18:07:00.000Z'),
      },
      {
        id: 'payment_user_1',
        billId: 'bill_user_1',
        sequence: 1,
        dueDate: new Date('2026-04-01T18:06:00.000Z'),
        amountCents: 6000,
        status: 'PENDING',
        paidAt: null,
        paymentIntentId: null,
        payerUserId: null,
        refundedAmountCents: 0,
        createdAt: new Date('2026-04-01T18:06:00.000Z'),
        updatedAt: new Date('2026-04-01T18:06:00.000Z'),
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/organizations/org_1/users'),
      { params: Promise.resolve({ id: 'org_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.canonicalTeams.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['canonical_team_1'] } },
    }));
    expect(payload.teams).toHaveLength(1);
    expect(payload.teams[0]).toEqual(expect.objectContaining({
      canonicalTeamId: 'canonical_team_1',
      name: 'Aces',
      division: 'Open Division',
      memberCount: 2,
    }));
    expect(payload.teams[0].registrations).toEqual([
      expect.objectContaining({
        eventId: 'event_1',
        eventTeamId: 'event_team_1',
        eventTeamName: 'Aces - Spring League',
        division: 'Open Division',
        status: 'ACTIVE',
        billIds: ['bill_team_1', 'bill_user_1'],
        totalAmountCents: 18000,
        paidAmountCents: 12000,
      }),
    ]);
    expect(payload.teams[0].bills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        billId: 'bill_team_1',
        ownerType: 'TEAM',
        ownerId: 'canonical_team_1',
        paidAmountCents: 12000,
        refundedAmountCents: 2000,
      }),
      expect.objectContaining({
        billId: 'bill_user_1',
        ownerType: 'USER',
        ownerId: 'player_1',
      }),
    ]));
    expect(payload.teams[0].manager).toEqual(expect.objectContaining({
      userId: 'manager_1',
      fullName: 'Morgan Diaz',
      role: 'MANAGER',
    }));
    expect(payload.teams[0].members).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: 'player_1',
        fullName: 'Alex Brown',
        isCaptain: true,
        jerseyNumber: '12',
        position: 'Setter',
        bills: expect.arrayContaining([
          expect.objectContaining({ billId: 'bill_user_1' }),
        ]),
      }),
    ]));
    expect(payload.users.find((row: { userId: string }) => row.userId === 'player_1')?.teams).toEqual([
      expect.objectContaining({
        teamId: 'canonical_team_1',
        teamName: 'Aces',
        isCaptain: true,
      }),
    ]);
    expect(payload.users.find((row: { userId: string }) => row.userId === 'manager_1')?.bills).toEqual([
      expect.objectContaining({
        billId: 'bill_team_1',
        ownerType: 'TEAM',
        ownerId: 'canonical_team_1',
        paidAmountCents: 12000,
      }),
    ]);
  });

  it('excludes placeholder event teams from organization customers', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.authUser.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.events.findMany.mockResolvedValue([
      {
        id: 'event_1',
        name: 'Spring League',
        start: new Date('2026-04-01T18:00:00.000Z'),
        end: new Date('2026-04-01T20:00:00.000Z'),
        organizationId: 'org_1',
        userIds: [],
        teamIds: ['placeholder_team_1'],
      },
    ]);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_1',
        registrantId: 'placeholder_team_1',
        parentId: 'canonical_team_1',
        registrantType: 'TEAM',
        eventTeamId: 'placeholder_team_1',
        status: 'ACTIVE',
      },
    ]);
    prismaMock.teams.findMany.mockResolvedValue([
      {
        id: 'placeholder_team_1',
        name: 'Open Slot',
        kind: 'PLACEHOLDER',
        division: 'event_1__DIVISION__OPEN',
        divisionTypeId: 'open',
        sport: 'Volleyball',
        profileImageId: null,
        teamSize: 6,
        playerIds: ['placeholder_player_1'],
        captainId: 'placeholder_player_1',
        managerId: 'manager_1',
        headCoachId: null,
        coachIds: [],
        parentTeamId: 'canonical_team_1',
      },
    ]);
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
    expect(payload.teams).toEqual([]);
    expect(prismaMock.canonicalTeams.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org_1' },
    }));
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
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_ext_1',
        registrantId: 'player_1',
        registrantType: 'SELF',
        status: 'ACTIVE',
      },
    ]);
    prismaMock.eventOfficials.findMany.mockResolvedValue([
      {
        eventId: 'event_ext_1',
        userId: 'official_1',
      },
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
    prismaMock.eventRegistrations.findMany.mockResolvedValue([
      {
        eventId: 'event_org_1',
        registrantId: 'player_1',
        registrantType: 'SELF',
        status: 'ACTIVE',
      },
    ]);
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
