/** @jest-environment node */

import { NextRequest } from 'next/server';

const findOverlayStateMock = jest.fn();
const validateBroadcastOverlayAccessTokenMock = jest.fn();
const parseBroadcastOverlayConfigMock = jest.fn((value: unknown) => value);
const parseMatchPresentationStateMock = jest.fn((value: unknown) => value);
const buildMatchPresentationStateMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    broadcastOverlayStates: {
      findUnique: (...args: unknown[]) => findOverlayStateMock(...args),
    },
  },
}));

jest.mock('@/server/broadcast/tokens', () => {
  const actual = jest.requireActual('@/server/broadcast/tokens');
  return {
    ...actual,
    validateBroadcastOverlayAccessToken: (...args: unknown[]) => validateBroadcastOverlayAccessTokenMock(...args),
  };
});

jest.mock('@/server/broadcast/schemas', () => {
  const actual = jest.requireActual('@/server/broadcast/schemas');
  return {
    ...actual,
    parseBroadcastOverlayConfig: (...args: unknown[]) => parseBroadcastOverlayConfigMock(...args),
    parseMatchPresentationState: (...args: unknown[]) => parseMatchPresentationStateMock(...args),
  };
});

jest.mock('@/server/broadcast/presentation', () => ({
  buildMatchPresentationState: (...args: unknown[]) => buildMatchPresentationStateMock(...args),
}));

import { GET } from '@/app/api/public/broadcast-overlays/[overlayId]/snapshot/route';
import { BroadcastOverlayCapabilityError } from '@/server/broadcast/tokens';

const params = { params: Promise.resolve({ overlayId: 'overlay_1' }) };

const expectCapabilityHeaders = (response: Response) => {
  expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
  expect(response.headers.get('Pragma')).toBe('no-cache');
  expect(response.headers.get('Expires')).toBe('0');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
};

describe('GET /api/public/broadcast-overlays/[overlayId]/snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateBroadcastOverlayAccessTokenMock.mockResolvedValue({
      overlay: {
        id: 'overlay_1',
        publishedConfig: { version: 1, displayName: 'published-scorebug' },
      },
      tokenRow: {
        id: 'token_row_1',
        overlayId: 'overlay_1',
        tokenHash: 'never-public',
      },
    });
    findOverlayStateMock.mockResolvedValue({
      overlayId: 'overlay_1',
      presentationState: { revision: 7, publicScore: '21-19' },
    });
  });

  it('requires the bearer capability and prevents a state lookup when it is absent', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/public/broadcast-overlays/overlay_1/snapshot'),
      params,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expectCapabilityHeaders(response);
    expect(validateBroadcastOverlayAccessTokenMock).not.toHaveBeenCalled();
    expect(findOverlayStateMock).not.toHaveBeenCalled();
  });

  it('uses the capability only server-side and returns the sanitized snapshot with no-cache headers', async () => {
    const rawCapability = 'a'.repeat(43);
    const response = await GET(
      new NextRequest('http://localhost/api/public/broadcast-overlays/overlay_1/snapshot', {
        headers: { Authorization: `Bearer ${rawCapability}` },
      }),
      params,
    );

    expect(response.status).toBe(200);
    expectCapabilityHeaders(response);
    expect(validateBroadcastOverlayAccessTokenMock).toHaveBeenCalledWith({
      overlayId: 'overlay_1',
      token: rawCapability,
    });
    expect(findOverlayStateMock).toHaveBeenCalledWith({ where: { overlayId: 'overlay_1' } });
    expect(parseBroadcastOverlayConfigMock).toHaveBeenCalledWith({
      version: 1,
      displayName: 'published-scorebug',
    });
    expect(parseMatchPresentationStateMock).toHaveBeenCalledWith({ revision: 7, publicScore: '21-19' });

    const body = await response.json();
    expect(body).toEqual({
      config: { version: 1, displayName: 'published-scorebug' },
      state: { revision: 7, publicScore: '21-19' },
    });
    expect(JSON.stringify(body)).not.toContain(rawCapability);
    expect(JSON.stringify(body)).not.toContain('tokenHash');
  });

  it('rebuilds automatic snapshots from the current selected-match projection', async () => {
    const automaticState = {
      version: 1,
      revision: 8,
      scoringMode: 'AUTOMATIC',
      score: { points: [0, 0] },
    };
    findOverlayStateMock.mockResolvedValue({
      overlayId: 'overlay_1',
      activeMatchId: 'match_1',
      presentationState: automaticState,
    });
    validateBroadcastOverlayAccessTokenMock.mockResolvedValue({
      overlay: {
        id: 'overlay_1',
        eventId: 'event_1',
        publishedConfig: { version: 1, displayName: 'published-scorebug' },
      },
    });
    buildMatchPresentationStateMock.mockResolvedValue({
      ...automaticState,
      score: { points: [3, 4] },
    });

    const response = await GET(
      new NextRequest('http://localhost/api/public/broadcast-overlays/overlay_1/snapshot', {
        headers: { Authorization: `Bearer ${'a'.repeat(43)}` },
      }),
      params,
    );

    expect(buildMatchPresentationStateMock).toHaveBeenCalledWith({
      overlay: expect.objectContaining({ id: 'overlay_1', eventId: 'event_1' }),
      state: expect.objectContaining({ activeMatchId: 'match_1' }),
      eventId: 'event_1',
      matchId: 'match_1',
    });
    await expect(response.json()).resolves.toMatchObject({ state: { score: { points: [3, 4] } } });
  });

  it('keeps no-store capability headers when a supplied token is invalid or revoked', async () => {
    validateBroadcastOverlayAccessTokenMock.mockRejectedValue(new BroadcastOverlayCapabilityError());

    const response = await GET(
      new NextRequest('http://localhost/api/public/broadcast-overlays/overlay_1/snapshot', {
        headers: { Authorization: 'Bearer invalid-capability-value' },
      }),
      params,
    );

    expect(response.status).toBe(401);
    expectCapabilityHeaders(response);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
