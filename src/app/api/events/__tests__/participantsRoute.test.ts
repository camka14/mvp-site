/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockStripeRefundCreate = jest.fn();
const mockStripePaymentIntentRetrieve = jest.fn();
const StripeMock = jest.fn().mockImplementation(() => ({
  paymentIntents: {
    retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
  },
  refunds: {
    create: (...args: unknown[]) => mockStripeRefundCreate(...args),
  },
}));

jest.mock('stripe', () => StripeMock);

const prismaMock = {
  $transaction: jest.fn(),
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findMany: jest.fn(),
  },
  parentChildLinks: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  timeSlots: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
  refundRequests: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invites: {
    deleteMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const getOptionalSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const dispatchRequiredEventDocumentsMock = jest.fn();
const buildEventParticipantSnapshotMock = jest.fn();
const findEventRegistrationMock = jest.fn();
const upsertEventRegistrationMock = jest.fn();
const deleteEventRegistrationMock = jest.fn();
const syncDivisionTeamMembershipFromRegistrationsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: any[]) => getOptionalSessionMock(...args),
  requireSession: requireSessionMock,
}));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));
jest.mock('@/lib/eventConsentDispatch', () => ({
  dispatchRequiredEventDocuments: (...args: any[]) => dispatchRequiredEventDocumentsMock(...args),
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  buildEventParticipantSnapshot: (...args: any[]) => buildEventParticipantSnapshotMock(...args),
  findEventRegistration: (...args: any[]) => findEventRegistrationMock(...args),
  upsertEventRegistration: (...args: any[]) => upsertEventRegistrationMock(...args),
  deleteEventRegistration: (...args: any[]) => deleteEventRegistrationMock(...args),
  syncDivisionTeamMembershipFromRegistrations: (...args: any[]) => syncDivisionTeamMembershipFromRegistrationsMock(...args),
}));

import { DELETE, GET, POST } from '@/app/api/events/[eventId]/participants/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const jsonDelete = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/events/[eventId]/participants', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getOptionalSessionMock.mockResolvedValue(null);
    canManageEventMock.mockResolvedValue(false);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      name: 'Public Event',
      state: 'PUBLISHED',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      teamSignup: false,
      singleDivision: true,
      maxParticipants: 10,
      eventType: 'EVENT',
      parentEvent: null,
      timeSlotIds: [],
      divisions: [],
    });
    buildEventParticipantSnapshotMock.mockResolvedValue({
      participants: { teamIds: [], userIds: ['user_1'], waitListIds: [], freeAgentIds: [], divisions: [] },
      teams: [],
      users: [{ id: 'user_1', firstName: 'Sam', lastName: 'Player' }],
      participantCount: 1,
      participantCapacity: 10,
      occurrence: null,
    });
  });

  it('allows guests to load participant snapshots for public events', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/participants'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      participantCount: 1,
      participantCapacity: 10,
      weeklySelectionRequired: false,
    }));
    expect(getOptionalSessionMock).toHaveBeenCalled();
    expect(canManageEventMock).not.toHaveBeenCalled();
    expect(buildEventParticipantSnapshotMock).toHaveBeenCalledWith(expect.objectContaining({
      includeRegistrations: false,
    }));
  });

  it('allows guests to load participant snapshots for private events by direct link', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      name: 'Private Event',
      state: 'PRIVATE',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      teamSignup: false,
      singleDivision: true,
      maxParticipants: 10,
      eventType: 'EVENT',
      parentEvent: null,
      timeSlotIds: [],
      divisions: [],
    });

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/participants'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(canManageEventMock).not.toHaveBeenCalled();
    expect(buildEventParticipantSnapshotMock).toHaveBeenCalledWith(expect.objectContaining({
      includeRegistrations: false,
    }));
  });

  it('still requires sign-in for management registration details', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/participants?manage=true'),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(buildEventParticipantSnapshotMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/events/[eventId]/participants', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    StripeMock.mockImplementation(() => ({
      paymentIntents: {
        retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
      },
      refunds: {
        create: (...args: unknown[]) => mockStripeRefundCreate(...args),
      },
    }));
    mockStripeRefundCreate.mockReset();
    mockStripePaymentIntentRetrieve.mockReset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    dispatchRequiredEventDocumentsMock.mockResolvedValue({
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      teamSignup: false,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
        teamIds: [],
        kind: 'LEAGUE',
      },
    ]);
    prismaMock.divisions.update.mockResolvedValue({});
    prismaMock.divisions.findFirst.mockResolvedValue(null);
    canManageEventMock.mockResolvedValue(false);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    });
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ parentId: 'parent_1' });
    prismaMock.timeSlots.findUnique.mockResolvedValue({
      id: 'slot_1',
      daysOfWeek: [2],
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      startTimeMinutes: 18 * 60,
      divisions: ['div_a'],
    });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.teams.findFirst.mockResolvedValue(null);
    prismaMock.teams.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.teams.update.mockResolvedValue({});
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.refundRequests.update.mockResolvedValue({ id: 'refund_1', status: 'APPROVED' });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.bills.findFirst.mockResolvedValue(null);
    prismaMock.bills.create.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'USER',
      ownerId: 'user_1',
      eventId: 'event_1',
      totalAmountCents: 5000,
      paidAmountCents: 0,
      status: 'OPEN',
      paymentPlanEnabled: true,
    });
    prismaMock.bills.update.mockResolvedValue({
      id: 'bill_1',
      ownerType: 'USER',
      ownerId: 'user_1',
      eventId: 'event_1',
      totalAmountCents: 5000,
      paidAmountCents: 0,
      status: 'OPEN',
      paymentPlanEnabled: true,
      nextPaymentDue: new Date('2026-07-07T18:00:00.000Z'),
      nextPaymentAmountCents: 2500,
    });
    prismaMock.billPayments.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findUnique.mockResolvedValue(null);
    prismaMock.billPayments.create.mockImplementation(async ({ data }: any) => ({
      id: data.id,
      billId: data.billId,
      sequence: data.sequence,
      dueDate: data.dueDate,
      amountCents: data.amountCents,
      status: data.status,
    }));
    prismaMock.billPayments.update.mockResolvedValue({ id: 'payment_1', refundedAmountCents: 5000 });
    prismaMock.invites.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z') });
    mockStripePaymentIntentRetrieve.mockResolvedValue({ id: 'pi_default', transfer_data: null });
    buildEventParticipantSnapshotMock.mockResolvedValue({
      participants: { teamIds: [], userIds: [], waitListIds: [], freeAgentIds: [], divisions: [] },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: null,
      occurrence: null,
    });
    findEventRegistrationMock.mockResolvedValue(null);
    upsertEventRegistrationMock.mockImplementation(async (params: Record<string, unknown>) => ({
      id: 'registration_1',
      ...params,
    }));
    deleteEventRegistrationMock.mockResolvedValue(undefined);
    syncDivisionTeamMembershipFromRegistrationsMock.mockResolvedValue(undefined);
  });

  it('rejects direct user participant joins for team-signup events', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Individual joins for team events must use the free-agent route.');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate team registration attempts', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_existing',
      status: 'ACTIVE',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Team is already registered for this event.');
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
  });

  it('forbids team registration when session user is not the team manager', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'captain_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1', 'user_2'],
      managerId: 'manager_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Only the team manager can register or withdraw this team.');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('requires session context when joining a parent weekly event from participants route', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'weekly_parent',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      state: 'PUBLISHED',
      teamSignup: false,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/weekly_parent/participants', {
        userId: 'user_1',
      }),
      { params: Promise.resolve({ eventId: 'weekly_parent' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('slotId and occurrenceDate are required for weekly event actions.');
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
  });

  it('blocks unverified users from joining paid events directly', async () => {
    prismaMock.authUser.findUnique.mockResolvedValueOnce({ emailVerifiedAt: null });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      sportId: 'volleyball',
      registrationByDivisionType: false,
      divisions: [],
      requiredTemplateIds: [],
      organizationId: null,
      price: 2500,
      teamSignup: false,
      eventType: 'EVENT',
      includePlayoffs: false,
      parentEvent: null,
      timeSlotIds: [],
      state: 'PUBLISHED',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      error: 'Verify your email before registering for paid events or teams.',
    }));
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('registers weekly parent joins against the selected occurrence', async () => {
    const parentEvent = {
      id: 'weekly_parent',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      state: 'PUBLISHED',
      timeSlotIds: ['slot_1'],
      teamSignup: false,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    };
    prismaMock.events.findUnique.mockResolvedValueOnce(parentEvent);
    canManageEventMock.mockResolvedValue(false);

    const response = await POST(
      jsonPost('http://localhost/api/events/weekly_parent/participants', {
        userId: 'user_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-07-08',
      }),
      { params: Promise.resolve({ eventId: 'weekly_parent' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'weekly_parent',
        registrantType: 'SELF',
        registrantId: 'user_1',
        occurrence: expect.objectContaining({
          slotId: 'slot_1',
          occurrenceDate: '2026-07-08',
        }),
      }),
      expect.anything(),
    );
    expect(payload.event.$id).toBe('weekly_parent');
  });

  it('creates the weekly payment-plan bill in the registration transaction', async () => {
    const parentEvent = {
      id: 'weekly_parent',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      state: 'PUBLISHED',
      timeSlotIds: ['slot_1'],
      teamSignup: false,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      price: 5000,
      allowPaymentPlans: true,
      installmentAmounts: [2500, 2500],
      installmentDueRelativeDays: [],
      allowTeamSplitDefault: false,
    };
    prismaMock.events.findUnique.mockResolvedValueOnce(parentEvent);
    const paidDivision = {
      id: 'div_a',
      price: 5000,
      allowPaymentPlans: true,
      installmentAmounts: [2500, 2500],
      installmentDueRelativeDays: [-1, 0],
    };
    prismaMock.divisions.findFirst
      .mockResolvedValueOnce(paidDivision)
      .mockResolvedValueOnce(paidDivision);
    prismaMock.bills.update.mockResolvedValueOnce({
      id: 'bill_weekly_1',
      ownerType: 'USER',
      ownerId: 'user_1',
      eventId: 'weekly_parent',
      slotId: 'slot_1',
      occurrenceDate: '2026-07-08',
      totalAmountCents: 5000,
      paidAmountCents: 0,
      status: 'OPEN',
      paymentPlanEnabled: true,
      nextPaymentDue: new Date('2026-07-07T18:00:00.000Z'),
      nextPaymentAmountCents: 2500,
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/weekly_parent/participants', {
        userId: 'user_1',
        divisionId: 'div_a',
        slotId: 'slot_1',
        occurrenceDate: '2026-07-08',
      }),
      { params: Promise.resolve({ eventId: 'weekly_parent' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.bills.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerType: 'USER',
        ownerId: 'user_1',
        eventId: 'weekly_parent',
        slotId: 'slot_1',
        occurrenceDate: '2026-07-08',
        organizationId: 'org_1',
        totalAmountCents: 5000,
        paymentPlanEnabled: true,
      }),
    }));
    expect(prismaMock.billPayments.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.billPayments.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        sequence: 1,
        amountCents: 2500,
        status: 'PENDING',
      }),
    }));
    expect(prismaMock.billPayments.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        sequence: 2,
        amountCents: 2500,
        status: 'PENDING',
      }),
    }));
    expect(payload.bill.$id).toBe('bill_weekly_1');
  });

  it('registers the canonical team without mutating legacy teamIds arrays', async () => {
    const eventRow = {
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['slot_1', 'slot_2'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      singleDivision: true,
      teamSizeLimit: 2,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(eventRow);

    const canonicalTeam = {
      id: 'team_1',
      name: 'Canonical Team',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    };
    prismaMock.teams.findUnique
      .mockResolvedValueOnce(canonicalTeam)
      .mockResolvedValueOnce(canonicalTeam);
    prismaMock.teams.findMany.mockResolvedValue([
      { id: 'slot_1', seed: 1, captainId: '', division: 'div_a', parentTeamId: null },
      { id: 'slot_2', seed: 2, captainId: '', division: 'div_a', parentTeamId: null },
    ]);
    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    const teamRegistrationCall = upsertEventRegistrationMock.mock.calls.find(
      ([params]) => (params as Record<string, unknown>).registrantType === 'TEAM',
    )?.[0] as Record<string, unknown> | undefined;
    expect(teamRegistrationCall).toEqual(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'slot_1',
      eventTeamId: 'slot_1',
      parentId: 'team_1',
      rosterRole: 'PARTICIPANT',
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
    }));
    expect(syncDivisionTeamMembershipFromRegistrationsMock).toHaveBeenCalled();
  });

  it('claims a tournament pool placeholder slot for free team registration', async () => {
    const eventRow = {
      id: 'event_1',
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['slot_pool_a_1', 'slot_pool_a_2'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['bracket_open'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      singleDivision: false,
      teamSizeLimit: 2,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(eventRow);

    const canonicalTeam = {
      id: 'team_1',
      name: 'Canonical Team',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    };
    prismaMock.teams.findUnique
      .mockResolvedValueOnce(canonicalTeam)
      .mockResolvedValueOnce(canonicalTeam);
    prismaMock.divisions.findMany
      .mockResolvedValueOnce([
        {
          id: 'bracket_open',
          key: 'c_skill_open',
          name: 'Open Bracket',
          sportId: 'volleyball',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: null,
          ageCutoffLabel: null,
          ageCutoffSource: null,
          kind: 'PLAYOFF',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'pool_a',
          key: 'c_skill_open_pool_a',
          name: 'Open Pool A',
          kind: 'LEAGUE',
          maxParticipants: 2,
          playoffTeamCount: 1,
          playoffPlacementDivisionIds: ['bracket_open'],
          teamIds: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'pool_a',
          key: 'c_skill_open_pool_a',
          name: 'Open Pool A',
          kind: 'LEAGUE',
          maxParticipants: 2,
          playoffTeamCount: 1,
          playoffPlacementDivisionIds: ['bracket_open'],
          teamIds: [],
        },
      ]);
    const placeholderTeam = {
      id: 'slot_pool_a_1',
      eventId: 'event_1',
      kind: 'PLACEHOLDER',
      parentTeamId: null,
      seed: 1,
      captainId: '',
      division: 'pool_a',
      divisionTypeId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    prismaMock.teams.findMany.mockImplementation(async ({ where }: any = {}) => {
      if (where?.eventId === 'event_1' && where?.kind === 'PLACEHOLDER') {
        return [placeholderTeam];
      }
      if (where?.eventId === 'event_1' && where?.kind === 'REGISTERED' && where?.parentTeamId === 'team_1') {
        return [];
      }
      return [];
    });
    prismaMock.teams.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    }));

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.teams.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot_pool_a_1' },
      data: expect.objectContaining({
        kind: 'REGISTERED',
        parentTeamId: 'team_1',
        division: 'pool_a',
      }),
    }));
    expect(prismaMock.divisions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pool_a' },
      data: expect.objectContaining({
        teamIds: ['slot_pool_a_1'],
      }),
    }));
    const teamRegistrationCall = upsertEventRegistrationMock.mock.calls.find(
      ([params]) => (params as Record<string, unknown>).registrantType === 'TEAM',
    )?.[0] as Record<string, unknown> | undefined;
    expect(teamRegistrationCall).toEqual(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'slot_pool_a_1',
      eventTeamId: 'slot_pool_a_1',
      parentId: 'team_1',
      divisionId: 'bracket_open',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
    }));
    expect(syncDivisionTeamMembershipFromRegistrationsMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate team registration attempts when the team already has an active registration', async () => {
    const eventRow = {
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['slot_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      singleDivision: true,
      teamSizeLimit: 2,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(eventRow);

    const canonicalTeam = {
      id: 'team_1',
      name: 'Canonical Team',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    };
    prismaMock.teams.findUnique
      .mockResolvedValueOnce(canonicalTeam)
      .mockResolvedValueOnce(canonicalTeam);
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_existing',
      status: 'ACTIVE',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Team is already registered for this event.');
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
  });

  it('allows team registration when team division type does not match selection', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Advanced',
      divisionTypeId: 'advanced',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    const teamRegistrationCall = upsertEventRegistrationMock.mock.calls.find(
      ([params]) => (params as Record<string, unknown>).registrantType === 'TEAM',
    )?.[0] as Record<string, unknown> | undefined;
    expect(teamRegistrationCall).toEqual(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'team_1',
      eventTeamId: 'team_1',
      parentId: 'team_1',
    }));
  });

  it('rejects unknown legacy checkout context fields on team join payloads', async () => {
    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        user: { $id: 'user_1', email: 'user@example.com' },
        event: { $id: 'event_1', name: 'Summer League' },
        team: { $id: 'team_1', name: 'Team One' },
        timeSlot: { $id: 'slot_1' },
        organization: { $id: 'org_1' },
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid input');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('allows event manager to move an already-registered team to a different division', async () => {
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      registrationByDivisionType: true,
      divisions: ['div_a', 'div_b'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: ['manager_1'],
      organizationId: null,
      singleDivision: false,
    });
    prismaMock.divisions.findMany
      .mockResolvedValueOnce([
        {
          id: 'div_a',
          key: 'c_skill_open',
          name: 'Open A',
          sportId: 'volleyball',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: null,
          ageCutoffLabel: null,
          ageCutoffSource: null,
          teamIds: ['team_1'],
          kind: 'LEAGUE',
        },
        {
          id: 'div_b',
          key: 'c_skill_advanced',
          name: 'Advanced',
          sportId: 'volleyball',
          divisionTypeId: 'advanced',
          divisionTypeName: 'Advanced',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: null,
          ageCutoffLabel: null,
          ageCutoffSource: null,
          teamIds: [],
          kind: 'LEAGUE',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'div_a', key: 'c_skill_open', teamIds: ['team_1'], kind: 'LEAGUE' },
        { id: 'div_b', key: 'c_skill_advanced', teamIds: [], kind: 'LEAGUE' },
      ]);
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValueOnce({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_advanced',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    const teamRegistrationCall = upsertEventRegistrationMock.mock.calls.find(
      ([params]) => (params as Record<string, unknown>).registrantType === 'TEAM',
    )?.[0] as Record<string, unknown> | undefined;
    expect(teamRegistrationCall).toEqual(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'team_1',
      eventTeamId: 'team_1',
      parentId: 'team_1',
      divisionId: 'div_b',
      divisionTypeId: 'advanced',
      divisionTypeKey: 'c_skill_advanced',
    }));
    expect(syncDivisionTeamMembershipFromRegistrationsMock).toHaveBeenCalled();
  });

  it('allows team registration when team has no resolvable division type', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: null,
      divisionTypeId: null,
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    const teamRegistrationCall = upsertEventRegistrationMock.mock.calls.find(
      ([params]) => (params as Record<string, unknown>).registrantType === 'TEAM',
    )?.[0] as Record<string, unknown> | undefined;
    expect(teamRegistrationCall).toEqual(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'team_1',
      eventTeamId: 'team_1',
      parentId: 'team_1',
    }));
  });

  it('rejects team registration when team sport does not match the event sport', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'soccer',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('does not match the event sport');
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
  });

  it('adds team and stores division registration metadata when division type matches', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    const teamRegistrationCall = upsertEventRegistrationMock.mock.calls.find(
      ([params]) => (params as Record<string, unknown>).registrantType === 'TEAM',
    )?.[0] as Record<string, unknown> | undefined;
    expect(teamRegistrationCall).toEqual(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'team_1',
      eventTeamId: 'team_1',
      parentId: 'team_1',
      divisionId: 'div_a',
      divisionTypeId: 'open',
      divisionTypeKey: 'c_skill_open',
    }));
  });

  it('allows team registration and returns warning for under-13 players missing email', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_req'],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.userData.findMany.mockResolvedValueOnce([
      {
        id: 'user_1',
        firstName: 'Adult',
        lastName: 'Player',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      },
      {
        id: 'user_2',
        firstName: 'Kid',
        lastName: 'Player',
        dateOfBirth: new Date('2015-05-20T00:00:00.000Z'),
      },
    ]);
    prismaMock.sensitiveUserData.findMany.mockResolvedValueOnce([
      { userId: 'user_1', email: 'adult@example.test' },
    ]);
    prismaMock.parentChildLinks.findMany.mockResolvedValueOnce([
      { childId: 'user_2' },
    ]);
    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    const teamRegistrationCall = upsertEventRegistrationMock.mock.calls.find(
      ([params]) => (params as Record<string, unknown>).registrantType === 'TEAM',
    )?.[0] as Record<string, unknown> | undefined;
    expect(teamRegistrationCall).toEqual(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'team_1',
      eventTeamId: 'team_1',
      parentId: 'team_1',
    }));
    expect(payload.warnings).toEqual([
      expect.stringContaining('Under-13 player Kid Player is missing an email'),
    ]);
  });

  it('creates a guardian approval request when a minor adds self as participant', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'child_1', isAdmin: false });
    prismaMock.userData.findUnique.mockResolvedValueOnce({
      dateOfBirth: new Date('2014-01-01T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ parentId: 'parent_1' });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requiresParentApproval).toBe(true);
    expect(payload.registration).toEqual(expect.objectContaining({
      registrantId: 'child_1',
      parentId: 'parent_1',
      status: 'STARTED',
      consentStatus: 'guardian_approval_required',
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'child_1',
      parentId: 'parent_1',
      status: 'STARTED',
      consentStatus: 'guardian_approval_required',
    }));
  });

  it('allows event managers to add an unrelated user participant', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      eventType: 'EVENT',
      teamSignup: false,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.userData.findUnique.mockResolvedValueOnce({
      dateOfBirth: new Date('1992-03-15T00:00:00.000Z'),
    });
    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'participant_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.parentChildLinks.findFirst).not.toHaveBeenCalled();
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event_1',
        registrantType: 'SELF',
        registrantId: 'participant_1',
        rosterRole: 'PARTICIPANT',
        createdBy: 'host_1',
      }),
      expect.anything(),
    );
  });
});

describe('DELETE /api/events/[eventId]/participants', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    StripeMock.mockImplementation(() => ({
      paymentIntents: {
        retrieve: (...args: unknown[]) => mockStripePaymentIntentRetrieve(...args),
      },
      refunds: {
        create: (...args: unknown[]) => mockStripeRefundCreate(...args),
      },
    }));
    mockStripeRefundCreate.mockReset();
    mockStripePaymentIntentRetrieve.mockReset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(false);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: [],
      userIds: ['user_1'],
      teamIds: [],
      waitListIds: ['user_1'],
      freeAgentIds: ['user_1'],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    });
    prismaMock.eventRegistrations.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.refundRequests.update.mockResolvedValue({ id: 'refund_1', status: 'APPROVED' });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findUnique.mockResolvedValue(null);
    prismaMock.billPayments.update.mockResolvedValue({ id: 'payment_1', refundedAmountCents: 5000 });
    mockStripePaymentIntentRetrieve.mockResolvedValue({ id: 'pi_default', transfer_data: null });
    prismaMock.eventRegistrations.findMany.mockResolvedValue([]);
    prismaMock.eventRegistrations.updateMany.mockResolvedValue({ count: 0 });
    findEventRegistrationMock.mockResolvedValue(null);
    upsertEventRegistrationMock.mockImplementation(async (params: Record<string, unknown>) => ({
      id: 'registration_1',
      ...params,
    }));
    deleteEventRegistrationMock.mockResolvedValue(undefined);
    syncDivisionTeamMembershipFromRegistrationsMock.mockResolvedValue(undefined);
  });

  it('resets only the slot child when removing a team in schedulable slot-provisioned events', async () => {
    const schedulableEvent = {
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1', 'slot_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      teamSizeLimit: 2,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    };
    const canonicalTeam = {
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      parentTeamId: null,
      teamSize: 2,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(schedulableEvent)
      .mockResolvedValueOnce(schedulableEvent);
    prismaMock.teams.findUnique.mockResolvedValue(canonicalTeam);
    prismaMock.teams.findMany.mockResolvedValueOnce([
      {
        id: 'slot_1',
        eventId: 'event_1',
        kind: 'REGISTERED',
        parentTeamId: 'team_1',
        captainId: 'user_1',
        division: 'div_a',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        teamSize: 2,
      },
    ]);
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_team_1',
      registrantId: 'slot_1',
      eventTeamId: 'slot_1',
      divisionId: 'div_a',
      divisionTypeId: 'open',
      status: 'ACTIVE',
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      teamIds: ['team_1', 'slot_1'],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(deleteEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'slot_1',
    }), expect.anything());
    expect(prismaMock.teams.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot_1' },
      data: expect.objectContaining({
        kind: 'PLACEHOLDER',
        parentTeamId: null,
        playerIds: [],
        captainId: '',
        managerId: '',
        name: 'Place Holder 2',
      }),
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'slot_1',
      eventTeamId: 'slot_1',
      parentId: null,
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      divisionId: 'div_a',
      divisionTypeId: 'open',
    }), expect.anything());
    expect(syncDivisionTeamMembershipFromRegistrationsMock).toHaveBeenCalled();
  });

  it('resets an event-team id removal back to a placeholder for schedulable events', async () => {
    const schedulableEvent = {
      id: 'event_1',
      eventType: 'TOURNAMENT',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['slot_1', 'slot_2'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      teamSizeLimit: 2,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    };
    prismaMock.events.findUnique.mockResolvedValueOnce(schedulableEvent);
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      eventId: 'event_1',
      kind: 'REGISTERED',
      parentTeamId: 'team_1',
      name: 'Team One',
      division: 'div_a',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    });
    prismaMock.teams.findMany.mockResolvedValueOnce([]);
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_slot_1',
      registrantId: 'slot_1',
      eventTeamId: 'slot_1',
      divisionId: 'div_a',
      divisionTypeId: 'open',
      status: 'ACTIVE',
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      teamIds: ['slot_1', 'slot_2'],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'slot_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.teams.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot_1' },
      data: expect.objectContaining({
        kind: 'PLACEHOLDER',
        parentTeamId: null,
        playerIds: [],
        name: 'Place Holder 1',
        captainId: '',
        managerId: '',
      }),
    }));
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'TEAM',
      registrantId: 'slot_1',
      eventTeamId: 'slot_1',
      parentId: null,
      status: 'ACTIVE',
    }), expect.anything());
  });

  it('uses division slot order and avoids duplicate names when placeholder ids are not on the event row', async () => {
    const schedulableEvent = {
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      singleDivision: false,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      teamSizeLimit: 2,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    };
    prismaMock.events.findUnique.mockResolvedValueOnce(schedulableEvent);
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      eventId: 'event_1',
      kind: 'REGISTERED',
      parentTeamId: 'team_1',
      name: 'Team One',
      division: 'div_a',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    });
    prismaMock.teams.findMany.mockImplementation(async ({ where }: any = {}) => {
      if (where?.kind === 'PLACEHOLDER') {
        return [
          {
            id: 'slot_2',
            name: 'Place Holder 1',
          },
        ];
      }
      return [];
    });
    prismaMock.divisions.findMany.mockResolvedValueOnce([
      {
        id: 'div_a',
        teamIds: ['slot_1', 'slot_2'],
      },
    ]);
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_slot_1',
      registrantId: 'slot_1',
      eventTeamId: 'slot_1',
      divisionId: 'div_a',
      divisionTypeId: 'open',
      status: 'ACTIVE',
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'slot_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.teams.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot_1' },
      data: expect.objectContaining({
        kind: 'PLACEHOLDER',
        name: 'Place Holder 2',
      }),
    }));
  });

  it('auto refunds the removed slot team when refund mode is auto and the event is inside the refund window', async () => {
    const schedulableEvent = {
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1', 'slot_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date(Date.now() + 72 * 60 * 60 * 1000),
      cancellationRefundHours: 24,
      minAge: null,
      maxAge: null,
      teamSizeLimit: 2,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
    };
    const canonicalTeam = {
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      parentTeamId: null,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(schedulableEvent)
      .mockResolvedValueOnce(schedulableEvent);
    prismaMock.teams.findUnique.mockResolvedValue(canonicalTeam);
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_team_1',
      status: 'ACTIVE',
    });
    prismaMock.bills.findMany
      .mockResolvedValueOnce([{ id: 'team_bill_1' }])
      .mockResolvedValueOnce([{ id: 'split_bill_1' }])
      .mockResolvedValueOnce([{ id: 'direct_bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'payment_team_1',
        billId: 'team_bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_team_1',
      },
      {
        id: 'payment_direct_1',
        billId: 'direct_bill_1',
        amountCents: 2500,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_direct_1',
      },
    ]);
    mockStripeRefundCreate
      .mockResolvedValueOnce({ id: 're_team_1' })
      .mockResolvedValueOnce({ id: 're_direct_1' });
    prismaMock.billPayments.findUnique
      .mockResolvedValueOnce({
        id: 'payment_team_1',
        amountCents: 5000,
        refundedAmountCents: 0,
      })
      .mockResolvedValueOnce({
        id: 'payment_direct_1',
        amountCents: 2500,
        refundedAmountCents: 0,
      });
    prismaMock.billPayments.update
      .mockResolvedValueOnce({ id: 'payment_team_1', refundedAmountCents: 5000 })
      .mockResolvedValueOnce({ id: 'payment_direct_1', refundedAmountCents: 2500 });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      teamIds: ['team_1', 'slot_1'],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
        refundMode: 'auto',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(mockStripeRefundCreate).toHaveBeenCalledTimes(2);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_1',
          teamId: 'team_1',
          userId: 'user_1',
          hostId: 'host_1',
          organizationId: 'org_1',
          status: 'APPROVED',
        }),
      }),
    );
    expect(prismaMock.billPayments.update).toHaveBeenCalledTimes(2);
  });

  it('auto refunds a future weekly session even when the parent event start has passed', async () => {
    const futureOccurrence = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const occurrenceDate = futureOccurrence.toISOString().slice(0, 10);
    const occurrenceDay = (futureOccurrence.getUTCDay() + 6) % 7;
    const weeklyEvent = {
      id: 'weekly_parent',
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      timeSlotIds: ['slot_1'],
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1', 'slot_team_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      cancellationRefundHours: 24,
      minAge: null,
      maxAge: null,
      teamSizeLimit: 2,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
    };
    const canonicalTeam = {
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      parentTeamId: null,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(weeklyEvent)
      .mockResolvedValueOnce(weeklyEvent);
    prismaMock.timeSlots.findUnique.mockResolvedValueOnce({
      id: 'slot_1',
      startTimeMinutes: 12 * 60,
      daysOfWeek: [occurrenceDay],
      startDate: occurrenceDate,
      endDate: occurrenceDate,
      divisions: ['div_a'],
    });
    prismaMock.teams.findUnique.mockResolvedValue(canonicalTeam);
    findEventRegistrationMock.mockResolvedValueOnce({
      id: `registration_team_1_slot_1_${occurrenceDate}`,
      status: 'ACTIVE',
      eventTeamId: 'slot_team_1',
      registrantId: 'slot_team_1',
    });
    prismaMock.bills.findMany
      .mockResolvedValueOnce([{ id: 'team_bill_1' }])
      .mockResolvedValueOnce([{ id: 'split_bill_1' }])
      .mockResolvedValueOnce([{ id: 'direct_bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      {
        id: 'payment_team_1',
        billId: 'team_bill_1',
        amountCents: 5000,
        refundedAmountCents: 0,
        paymentIntentId: 'pi_team_1',
      },
    ]);
    mockStripeRefundCreate.mockResolvedValueOnce({ id: 're_team_1' });
    prismaMock.billPayments.findUnique.mockResolvedValueOnce({
      id: 'payment_team_1',
      amountCents: 5000,
      refundedAmountCents: 0,
    });
    prismaMock.billPayments.update.mockResolvedValueOnce({
      id: 'payment_team_1',
      refundedAmountCents: 5000,
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'weekly_parent',
      teamIds: ['team_1', 'slot_team_1'],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/weekly_parent/participants', {
        teamId: 'team_1',
        refundMode: 'auto',
        slotId: 'slot_1',
        occurrenceDate,
      }),
      { params: Promise.resolve({ eventId: 'weekly_parent' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.bills.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'weekly_parent',
        ownerType: 'TEAM',
        slotId: 'slot_1',
        occurrenceDate,
      }),
    }));
    expect(mockStripeRefundCreate).toHaveBeenCalledTimes(1);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'weekly_parent',
          teamId: 'team_1',
          status: 'APPROVED',
        }),
      }),
    );
  });

  it('allows a parent to remove a linked child participant', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      requiredTemplateIds: [],
      userIds: ['child_1'],
      teamIds: [],
      waitListIds: ['child_1'],
      freeAgentIds: ['child_1'],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.parentChildLinks.findFirst).toHaveBeenCalledWith({
      where: {
        parentId: 'parent_1',
        childId: 'child_1',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(prismaMock.eventRegistrations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_1',
          registrantId: 'child_1',
          registrantType: { in: ['SELF', 'CHILD'] },
          status: { not: 'CANCELLED' },
        }),
        data: expect.objectContaining({
          status: 'CANCELLED',
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.deleteMany).not.toHaveBeenCalled();
  });

  it('forbids removing an unrelated participant', async () => {
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce(null);

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('forbids removing a team when session user is not the team manager', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'captain_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      eventType: 'EVENT',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1'],
      managerId: 'manager_1',
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Only the team manager can register or withdraw this team.');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('allows event managers to unregister a team and creates a refund request when payments exist', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      eventType: 'EVENT',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: [],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1'],
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      parentTeamId: null,
    });
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_team_1',
      status: 'ACTIVE',
    });
    prismaMock.bills.findMany.mockResolvedValueOnce([{ id: 'bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      { amountCents: 5000, refundedAmountCents: 0 },
    ]);
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_1',
          teamId: 'team_1',
          userId: 'host_1',
          reason: 'team_unregistered_by_host',
          status: 'WAITING',
        }),
      }),
    );
  });

  it('creates a refund request for split team bills under the canonical team id', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['slot_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: [],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1'],
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      parentTeamId: null,
    });
    prismaMock.teams.findMany.mockResolvedValueOnce([
      {
        id: 'slot_1',
        eventId: 'event_1',
        kind: 'REGISTERED',
        parentTeamId: 'team_1',
        captainId: 'captain_1',
        managerId: 'manager_1',
      },
    ]);
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_slot_1',
      registrantId: 'slot_1',
      eventTeamId: 'slot_1',
      status: 'ACTIVE',
    });
    prismaMock.bills.findMany
      .mockResolvedValueOnce([{ id: 'team_bill_1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'split_bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      { amountCents: 5000, refundedAmountCents: 0, status: 'PAID' },
    ]);
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_1',
          teamId: 'team_1',
          userId: 'host_1',
          reason: 'team_unregistered_by_host',
          status: 'WAITING',
        }),
      }),
    );
    expect(prismaMock.bills.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
      where: expect.objectContaining({
        ownerType: 'USER',
        parentBillId: { in: ['team_bill_1'] },
      }),
    }));
  });

  it('allows event managers to unregister a team without creating a refund request when no payments exist', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      eventType: 'EVENT',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: [],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1'],
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      parentTeamId: null,
    });
    findEventRegistrationMock.mockResolvedValueOnce({
      id: 'registration_team_1',
      status: 'ACTIVE',
    });
    prismaMock.bills.findMany.mockResolvedValueOnce([]);
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
  });

  it('allows event managers to remove an unrelated user participant', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      eventType: 'EVENT',
      teamSignup: false,
      requiredTemplateIds: [],
      userIds: ['participant_1'],
      teamIds: [],
      waitListIds: ['participant_1'],
      freeAgentIds: ['participant_1'],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { userId: 'participant_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.parentChildLinks.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({
          updatedAt: expect.any(Date),
        }),
      }),
    );
  });
});
