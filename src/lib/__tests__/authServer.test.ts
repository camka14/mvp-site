/** @jest-environment node */

import jwt, { JwtPayload } from 'jsonwebtoken';
import {
  WATCH_SETUP_TOKEN_TTL_SECONDS,
  signSessionToken,
  signWatchSetupToken,
  verifyWatchSetupToken,
} from '@/lib/authServer';

describe('authServer token helpers', () => {
  const originalAuthSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (originalAuthSecret == null) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it('signs persistent session tokens without a fixed exp claim', () => {
    const token = signSessionToken({
      userId: 'user_1',
      isAdmin: false,
      sessionVersion: 0,
      device: 'mobile',
    });

    const decoded = jwt.decode(token) as JwtPayload;

    expect(decoded.userId).toBe('user_1');
    expect(decoded.device).toBe('mobile');
    expect(decoded.iat).toEqual(expect.any(Number));
    expect(decoded.exp).toBeUndefined();
  });

  it('signs short-lived watch setup tokens that cannot be verified as another purpose', () => {
    const token = signWatchSetupToken({
      userId: 'user_1',
      sessionVersion: 0,
    });

    const decoded = jwt.decode(token) as JwtPayload;
    const verified = verifyWatchSetupToken(token);
    const sessionToken = signSessionToken({
      userId: 'user_1',
      isAdmin: false,
      sessionVersion: 0,
    });

    expect(decoded.purpose).toBe('watch_setup');
    expect(decoded.exp - decoded.iat).toBe(WATCH_SETUP_TOKEN_TTL_SECONDS);
    expect(verified).toEqual({
      userId: 'user_1',
      sessionVersion: 0,
      purpose: 'watch_setup',
      issuedAtSeconds: decoded.iat,
    });
    expect(verifyWatchSetupToken(sessionToken)).toBeNull();
  });
});
