/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
  },
  parentChildLinks: {
    findFirst: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const dispatchRequiredEventDocumentsMock = jest.fn();
const upsertEventRegistrationMock = jest.fn();
const deleteEventRegistrationMock = jest.fn();
const buildEventParticipantSnapshotMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/lib/eventConsentDispatch', () => ({
  dispatchRequiredEventDocuments: (...args: any[]) => dispatchRequiredEventDocumentsMock(...args),
}));
jest.mock('@/server/events/eventRegistrations', () => ({
  buildEventParticipantSnapshot: (...args: unknown[]) => buildEventParticipantSnapshotMock(...args),
  upsertEventRegistration: (...args: unknown[]) => upsertEventRegistrationMock(...args),
  deleteEventRegistration: (...args: unknown[]) => deleteEventRegistrationMock(...args),
}));

import { DELETE, POST } from '@/app/api/events/[eventId]/free-agents/route';

const jsonRequest = (method: 'POST' | 'DELETE', url: string, body: unknown) =>
  new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('event free-agent route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    dispatchRequiredEventDocumentsMock.mockResolvedValue({
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      teamSignup: true,
      userIds: [],
      waitListIds: [],
      freeAgentIds: [],
      requiredTemplateIds: [],
      organizationId: null,
      start: new Date('2026-03-01T00:00:00.000Z'),
    });
    prismaMock.userData.findUnique.mockResolvedValue({
      id: 'user_1',
      dateOfBirth: new Date('1995-01-01T00:00:00.000Z'),
    });
    upsertEventRegistrationMock.mockResolvedValue({ id: 'registration_1' });
    deleteEventRegistrationMock.mockResolvedValue(undefined);
    buildEventParticipantSnapshotMock.mockResolvedValue({
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: ['user_1'],
        divisions: [],
      },
    });
  });

  it('adds the current user as a free agent', async () => {
    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_1',
      parentId: null,
      rosterRole: 'FREE_AGENT',
      status: 'ACTIVE',
      createdBy: 'user_1',
    }));
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('moves user from participants and waitlist when adding as free agent', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      userIds: ['user_1'],
      waitListIds: ['user_1'],
      freeAgentIds: [],
      requiredTemplateIds: [],
      organizationId: null,
      start: new Date('2026-03-01T00:00:00.000Z'),
    });
    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_1',
      rosterRole: 'FREE_AGENT',
    }));
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('idempotently upserts duplicate free-agent joins', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      userIds: [],
      waitListIds: [],
      freeAgentIds: ['user_1'],
      requiredTemplateIds: [],
      organizationId: null,
      start: new Date('2026-03-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantId: 'user_1',
      rosterRole: 'FREE_AGENT',
    }));
  });

  it('rejects free-agent add for non-team events', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: false,
      freeAgentIds: [],
      requiredTemplateIds: [],
      organizationId: null,
      start: new Date('2026-03-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Free-agent signup is only available for team registration events.');
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
  });

  it('removes the current user from free agents', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      freeAgentIds: ['user_1'],
    });
    buildEventParticipantSnapshotMock.mockResolvedValueOnce({
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
    });

    const response = await DELETE(
      jsonRequest('DELETE', 'http://localhost/api/events/event_1/free-agents', { userId: 'user_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(deleteEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_1',
    }));
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('allows a parent to add a linked child as a free agent', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.userData.findUnique.mockResolvedValueOnce({
      id: 'child_1',
      firstName: 'Child',
      lastName: 'One',
      dateOfBirth: new Date('2014-01-01T00:00:00.000Z'),
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      freeAgentIds: ['child_1'],
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'child_1' }),
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
    expect(upsertEventRegistrationMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1',
      registrantType: 'CHILD',
      registrantId: 'child_1',
      parentId: 'parent_1',
      rosterRole: 'FREE_AGENT',
      createdBy: 'parent_1',
    }));
  });

  it('requires parent approval when a child account tries to self-add as free agent', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'child_1', isAdmin: false });
    prismaMock.userData.findUnique.mockResolvedValueOnce({
      id: 'child_1',
      dateOfBirth: new Date('2014-01-01T00:00:00.000Z'),
    });

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('A parent/guardian must approve free-agent registration for child accounts.');
    expect(payload.requiresParentApproval).toBe(true);
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
  });

  it('forbids adding an unrelated user as free agent', async () => {
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce(null);

    const response = await POST(
      jsonRequest('POST', 'http://localhost/api/events/event_1/free-agents', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(upsertEventRegistrationMock).not.toHaveBeenCalled();
    expect(prismaMock.events.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userData.findUnique).not.toHaveBeenCalled();
  });
});
