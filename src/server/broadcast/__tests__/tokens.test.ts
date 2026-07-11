jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  BROADCAST_OVERLAY_SOCKET_AUDIENCE,
  BROADCAST_OVERLAY_SOCKET_SCOPE,
  BROADCAST_OVERLAY_SOCKET_TOKEN_TYPE,
  createBroadcastOverlaySocketTicket,
  verifyBroadcastOverlaySocketTicket,
} from '../tokens';

describe('broadcast overlay socket tickets', () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = 'broadcast-overlay-test-secret';
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it('issues a short-lived, scoped ticket that does not contain the opaque capability', () => {
    const ticket = createBroadcastOverlaySocketTicket({ overlayId: 'overlay_1', accessTokenId: 'token_1' });
    const verified = verifyBroadcastOverlaySocketTicket(ticket);

    expect(verified).toEqual({
      overlayId: 'overlay_1',
      accessTokenId: 'token_1',
      scope: BROADCAST_OVERLAY_SOCKET_SCOPE,
    });
    expect(ticket).not.toContain('opaque-program-capability');
  });

  it('rejects a token with the wrong token type or audience', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const wrongType = jwt.sign({
      overlayId: 'overlay_1',
      accessTokenId: 'token_1',
      scope: BROADCAST_OVERLAY_SOCKET_SCOPE,
      tokenType: 'session',
    }, process.env.AUTH_SECRET!, {
      algorithm: 'HS256',
      issuer: 'bracket-iq',
      audience: BROADCAST_OVERLAY_SOCKET_AUDIENCE,
    });
    const wrongAudience = jwt.sign({
      overlayId: 'overlay_1',
      accessTokenId: 'token_1',
      scope: BROADCAST_OVERLAY_SOCKET_SCOPE,
      tokenType: BROADCAST_OVERLAY_SOCKET_TOKEN_TYPE,
    }, process.env.AUTH_SECRET!, {
      algorithm: 'HS256',
      issuer: 'bracket-iq',
      audience: 'other-audience',
    });

    expect(verifyBroadcastOverlaySocketTicket(wrongType)).toBeNull();
    expect(verifyBroadcastOverlaySocketTicket(wrongAudience)).toBeNull();
  });
});

