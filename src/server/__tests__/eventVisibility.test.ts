/** @jest-environment node */

import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/permissions', () => ({ getOptionalSession: jest.fn() }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: jest.fn() }));

import {
  assertCanViewEventSchedule,
  getVisibleEventIds,
  isPublicEventState,
  type EventVisibilityRow,
} from '@/server/eventVisibility';

const getOptionalSessionMock = jest.requireMock('@/lib/permissions').getOptionalSession as jest.Mock;
const canManageEventMock = jest.requireMock('@/server/accessControl').canManageEvent as jest.Mock;

const request = () => new NextRequest('http://localhost/api/matches');
const event = (overrides: Partial<EventVisibilityRow>): EventVisibilityRow => ({
  id: 'event_1',
  state: 'PUBLISHED',
  hostId: 'host_1',
  assistantHostIds: [],
  organizationId: null,
  ...overrides,
});

describe('event schedule visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOptionalSessionMock.mockResolvedValue(null);
  });

  it('treats only published and legacy null-state events as public', () => {
    expect(isPublicEventState('PUBLISHED')).toBe(true);
    expect(isPublicEventState(null)).toBe(true);
    expect(isPublicEventState(undefined)).toBe(true);
    expect(isPublicEventState('PRIVATE')).toBe(false);
    expect(isPublicEventState('UNPUBLISHED')).toBe(false);
    expect(isPublicEventState('TEMPLATE')).toBe(false);
  });

  it('keeps private and archived events out of anonymous mixed-event results', async () => {
    const visible = await getVisibleEventIds(request(), [
      event({ id: 'published', state: 'PUBLISHED' }),
      event({ id: 'legacy', state: null }),
      event({ id: 'private', state: 'PRIVATE' }),
      event({ id: 'archived', state: 'PUBLISHED', archivedAt: new Date() }),
    ]);

    expect(Array.from(visible).sort()).toEqual(['legacy', 'published']);
    expect(canManageEventMock).not.toHaveBeenCalled();
  });

  it('adds a restricted event only when the optional session can manage it', async () => {
    getOptionalSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);

    const visible = await getVisibleEventIds(request(), [event({ state: 'PRIVATE' })]);

    expect(Array.from(visible)).toEqual(['event_1']);
    expect(canManageEventMock).toHaveBeenCalledWith(
      { userId: 'host_1', isAdmin: false },
      expect.objectContaining({ id: 'event_1', state: 'PRIVATE' }),
      expect.anything(),
    );
  });

  it('fails closed when a direct private schedule request has no manager authority', async () => {
    await expect(assertCanViewEventSchedule(request(), event({ state: 'PRIVATE' })))
      .rejects.toMatchObject({ status: 403 });
  });

  it('allows a manager to view a direct private schedule request', async () => {
    getOptionalSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);

    await expect(assertCanViewEventSchedule(request(), event({ state: 'PRIVATE' }))).resolves.toBeUndefined();
  });
});
