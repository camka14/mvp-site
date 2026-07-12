/** @jest-environment node */

import { NextRequest } from 'next/server';

jest.mock('@/lib/permissions', () => ({ requireSession: jest.fn() }));
jest.mock('@/server/registrationQuestionAccess', () => ({ canManageRegistrationQuestionScope: jest.fn() }));
jest.mock('@/server/registrationQuestions', () => ({
  getRegistrationQuestionResponseBySubject: jest.fn(),
  listRegistrationQuestionResponsesForSubjects: jest.fn(),
  normalizeRegistrationQuestionScopeType: jest.fn((value: unknown) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized === 'TEAM' || normalized === 'EVENT' ? normalized : null;
  }),
}));

import { GET } from '@/app/api/registration-question-responses/route';

const requireSessionMock = jest.requireMock('@/lib/permissions').requireSession as jest.Mock;
const canManageRegistrationQuestionScopeMock = jest.requireMock('@/server/registrationQuestionAccess')
  .canManageRegistrationQuestionScope as jest.Mock;
const registrationQuestionsMock = jest.requireMock('@/server/registrationQuestions') as {
  getRegistrationQuestionResponseBySubject: jest.Mock;
  listRegistrationQuestionResponsesForSubjects: jest.Mock;
};

const requestFor = (query: string) =>
  new NextRequest(`http://localhost/api/registration-question-responses?${query}`);

describe('GET /api/registration-question-responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
  });

  it('denies a mixed batch when any returned response belongs to an unmanaged scope', async () => {
    registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects.mockResolvedValueOnce([
      { subjectId: 'managed_registration', scopeType: 'EVENT', scopeId: 'event_managed' },
      { subjectId: 'other_registration', scopeType: 'EVENT', scopeId: 'event_other' },
    ]);
    canManageRegistrationQuestionScopeMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const response = await GET(requestFor('subjectType=EVENT_REGISTRATION&subjectIds=managed_registration,other_registration'));

    expect(response.status).toBe(403);
    expect(canManageRegistrationQuestionScopeMock).toHaveBeenCalledWith({
      session: { userId: 'manager_1', isAdmin: false },
      scopeType: 'EVENT',
      scopeId: 'event_managed',
    });
    expect(canManageRegistrationQuestionScopeMock).toHaveBeenCalledWith({
      session: { userId: 'manager_1', isAdmin: false },
      scopeType: 'EVENT',
      scopeId: 'event_other',
    });
  });

  it('denies a mixed batch regardless of the database row order', async () => {
    registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects.mockResolvedValueOnce([
      { subjectId: 'other_registration', scopeType: 'EVENT', scopeId: 'event_other' },
      { subjectId: 'managed_registration', scopeType: 'EVENT', scopeId: 'event_managed' },
    ]);
    canManageRegistrationQuestionScopeMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const response = await GET(requestFor('subjectType=EVENT_REGISTRATION&subjectIds=managed_registration,other_registration'));

    expect(response.status).toBe(403);
    expect(canManageRegistrationQuestionScopeMock).toHaveBeenCalledTimes(2);
  });

  it('returns a batch only after every distinct scope is authorized', async () => {
    const responses = [
      { subjectId: 'registration_a', scopeType: 'EVENT', scopeId: 'event_a' },
      { subjectId: 'registration_b', scopeType: 'EVENT', scopeId: 'event_a' },
      { subjectId: 'registration_c', scopeType: 'TEAM', scopeId: 'team_b' },
    ];
    registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects.mockResolvedValueOnce(responses);
    canManageRegistrationQuestionScopeMock.mockResolvedValue(true);

    const response = await GET(requestFor('subjectType=EVENT_REGISTRATION&subjectIds=registration_a,registration_b,registration_c'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ responses });
    expect(canManageRegistrationQuestionScopeMock).toHaveBeenCalledTimes(2);
  });

  it('denies batches without a durable authorization scope', async () => {
    registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects.mockResolvedValueOnce([
      { subjectId: 'registration_a', scopeType: null, scopeId: null },
    ]);

    const response = await GET(requestFor('subjectType=EVENT_REGISTRATION&subjectIds=registration_a'));

    expect(response.status).toBe(403);
    expect(canManageRegistrationQuestionScopeMock).not.toHaveBeenCalled();
  });

  it('returns an empty batch without exposing an authorization decision for a missing response', async () => {
    registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects.mockResolvedValueOnce([]);

    const response = await GET(requestFor('subjectType=EVENT_REGISTRATION&subjectIds=missing_registration'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ responses: [] });
    expect(canManageRegistrationQuestionScopeMock).not.toHaveBeenCalled();
  });

  it('deduplicates and bounds batch subject IDs before querying response rows', async () => {
    registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects.mockResolvedValueOnce([]);

    const duplicateResponse = await GET(requestFor(
      'subjectType=EVENT_REGISTRATION&subjectIds=registration_a,registration_a,registration_b',
    ));
    expect(duplicateResponse.status).toBe(200);
    expect(registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects).toHaveBeenCalledWith({
      subjectType: 'EVENT_REGISTRATION',
      subjectIds: ['registration_a', 'registration_b'],
    });

    const overflowResponse = await GET(requestFor(
      `subjectType=EVENT_REGISTRATION&subjectIds=${Array.from({ length: 101 }, (_, index) => `registration_${index}`).join(',')}`,
    ));
    expect(overflowResponse.status).toBe(400);
    expect(registrationQuestionsMock.listRegistrationQuestionResponsesForSubjects).toHaveBeenCalledTimes(1);
  });

  it('keeps the single-subject response check scoped to its persisted row', async () => {
    registrationQuestionsMock.getRegistrationQuestionResponseBySubject.mockResolvedValueOnce({
      subjectId: 'registration_a',
      scopeType: 'EVENT',
      scopeId: 'event_a',
    });
    canManageRegistrationQuestionScopeMock.mockResolvedValueOnce(true);

    const response = await GET(requestFor('subjectType=EVENT_REGISTRATION&subjectId=registration_a'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      response: { subjectId: 'registration_a', scopeType: 'EVENT', scopeId: 'event_a' },
    });
  });
});
