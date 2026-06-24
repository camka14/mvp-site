/** @jest-environment node */

import jwt, { JwtPayload } from 'jsonwebtoken';
import {
  WATCH_SETUP_TOKEN_TTL_SECONDS,
  shouldUseSecureAuthCookie,
  signSessionToken,
  signWatchSetupToken,
  verifyWatchSetupToken,
} from '@/lib/authServer';

describe('authServer token helpers', () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalAuthCookieSecure = process.env.AUTH_COOKIE_SECURE;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret';
    delete process.env.AUTH_COOKIE_SECURE;
  });

  afterAll(() => {
    if (originalAuthSecret == null) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
    if (originalAuthCookieSecure == null) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = originalAuthCookieSecure;
    }
    process.env.NODE_ENV = originalNodeEnv;
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

  it('uses secure auth cookies in production by default', () => {
    process.env.NODE_ENV = 'production';

    expect(shouldUseSecureAuthCookie()).toBe(true);
  });

  it('allows local production smoke tests to disable secure auth cookies explicitly', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_SECURE = 'false';

    expect(shouldUseSecureAuthCookie()).toBe(false);
  });
});
