import { verifySessionToken } from '@/lib/authServer';
import { resolveLandingRedirectPathFromToken } from '../landingRedirect';

jest.mock('@/lib/authServer', () => ({
  verifySessionToken: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    authUser: {
      findUnique: jest.fn(),
    },
    userData: {
      findUnique: jest.fn(),
    },
  },
}));

const verifySessionTokenMock = verifySessionToken as jest.MockedFunction<typeof verifySessionToken>;

const buildClient = () => ({
  authUser: {
    findUnique: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
  },
});

describe('resolveLandingRedirectPathFromToken', () => {
  beforeEach(() => {
    verifySessionTokenMock.mockReset();
  });

  it('returns null when there is no token', async () => {
    const client = buildClient();

    await expect(resolveLandingRedirectPathFromToken(null, client)).resolves.toBeNull();

    expect(verifySessionTokenMock).not.toHaveBeenCalled();
    expect(client.authUser.findUnique).not.toHaveBeenCalled();
    expect(client.userData.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when the token is invalid', async () => {
    const client = buildClient();
    verifySessionTokenMock.mockReturnValue(null);

    await expect(resolveLandingRedirectPathFromToken('bad-token', client)).resolves.toBeNull();

    expect(client.authUser.findUnique).not.toHaveBeenCalled();
    expect(client.userData.findUnique).not.toHaveBeenCalled();
  });

  it('routes unverified authenticated users normally', async () => {
    const client = buildClient();
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0, issuedAtSeconds: 1 });
    client.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: null, sessionVersion: 0 });
    client.userData.findUnique.mockResolvedValue({ homePageOrganizationId: null, onboardingIntent: 'DISCOVER_EVENTS' });

    await expect(resolveLandingRedirectPathFromToken('auth-token', client)).resolves.toBe('/discover');

    expect(client.userData.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { homePageOrganizationId: true, onboardingIntent: true },
    });
  });

  it('falls back to discover when the user profile is missing', async () => {
    const client = buildClient();
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0, issuedAtSeconds: 1 });
    client.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'), sessionVersion: 0 });
    client.userData.findUnique.mockResolvedValue(null);

    await expect(resolveLandingRedirectPathFromToken('auth-token', client)).resolves.toBe('/discover');
  });

  it('routes verified users with no saved onboarding intent to onboarding', async () => {
    const client = buildClient();
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0, issuedAtSeconds: 1 });
    client.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'), sessionVersion: 0 });
    client.userData.findUnique.mockResolvedValue({ homePageOrganizationId: null, onboardingIntent: null });

    await expect(resolveLandingRedirectPathFromToken('auth-token', client)).resolves.toBe('/onboarding');
  });

  it('falls back to discover after onboarding is complete and no saved home page exists', async () => {
    const client = buildClient();
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0, issuedAtSeconds: 1 });
    client.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'), sessionVersion: 0 });
    client.userData.findUnique.mockResolvedValue({ homePageOrganizationId: null, onboardingIntent: 'DISCOVER_EVENTS' });

    await expect(resolveLandingRedirectPathFromToken('auth-token', client)).resolves.toBe('/discover');
  });

  it('returns the configured organization home path for verified users', async () => {
    const client = buildClient();
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 0, issuedAtSeconds: 1 });
    client.authUser.findUnique.mockResolvedValue({ emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'), sessionVersion: 0 });
    client.userData.findUnique.mockResolvedValue({ homePageOrganizationId: 'org_42', onboardingIntent: 'ORGANIZATION' });

    await expect(resolveLandingRedirectPathFromToken('auth-token', client)).resolves.toBe('/organizations/org_42');
  });
});
