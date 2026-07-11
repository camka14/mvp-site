/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const requireManagedBroadcastEventMock = jest.fn();
const requireBroadcastOverlayForEventMock = jest.fn();
const findOverlayStateMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    broadcastOverlayStates: {
      findUnique: (...args: unknown[]) => findOverlayStateMock(...args),
    },
  },
}));

jest.mock('@/server/broadcast/access', () => {
  const actual = jest.requireActual('@/server/broadcast/access');
  return {
    ...actual,
    requireManagedBroadcastEvent: (...args: unknown[]) => requireManagedBroadcastEventMock(...args),
    requireBroadcastOverlayForEvent: (...args: unknown[]) => requireBroadcastOverlayForEventMock(...args),
  };
});

jest.mock('@/server/broadcast/overlayService', () => ({
  archiveBroadcastOverlay: jest.fn(),
  updateBroadcastOverlayDraft: jest.fn(),
}));

import {
  BroadcastOverlayForbiddenError,
  BroadcastOverlayNotFoundError,
} from '@/server/broadcast/access';
import { GET } from '@/app/api/events/[eventId]/broadcast-overlays/[overlayId]/route';

const params = (eventId = 'event_1', overlayId = 'overlay_1') => ({
  params: Promise.resolve({ eventId, overlayId }),
});

describe('GET /api/events/[eventId]/broadcast-overlays/[overlayId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    requireManagedBroadcastEventMock.mockResolvedValue({
      id: 'event_1',
      organizationId: 'organization_1',
    });
    requireBroadcastOverlayForEventMock.mockResolvedValue({ id: 'overlay_1', eventId: 'event_1' });
    findOverlayStateMock.mockResolvedValue({ id: 'state_1', overlayId: 'overlay_1', revision: 4 });
  });

  it('rejects a user who cannot manage the event before querying its overlay', async () => {
    requireManagedBroadcastEventMock.mockRejectedValueOnce(new BroadcastOverlayForbiddenError());

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/broadcast-overlays/overlay_1'),
      params(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(requireManagedBroadcastEventMock).toHaveBeenCalledWith({
      eventId: 'event_1',
      session: { userId: 'manager_1', isAdmin: false },
    });
    expect(requireBroadcastOverlayForEventMock).not.toHaveBeenCalled();
    expect(findOverlayStateMock).not.toHaveBeenCalled();
  });

  it('does not expose an overlay through a different event path', async () => {
    requireBroadcastOverlayForEventMock.mockRejectedValueOnce(new BroadcastOverlayNotFoundError());

    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/broadcast-overlays/overlay_from_event_2'),
      params('event_1', 'overlay_from_event_2'),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(requireBroadcastOverlayForEventMock).toHaveBeenCalledWith({
      eventId: 'event_1',
      overlayId: 'overlay_from_event_2',
    });
    expect(findOverlayStateMock).not.toHaveBeenCalled();
  });

  it('loads state only after both event authorization and exact overlay ownership succeed', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/events/event_1/broadcast-overlays/overlay_1'),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      overlay: { id: 'overlay_1', eventId: 'event_1' },
      state: { id: 'state_1', overlayId: 'overlay_1', revision: 4 },
    });
    expect(findOverlayStateMock).toHaveBeenCalledWith({ where: { overlayId: 'overlay_1' } });
  });
});
