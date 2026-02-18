/** @jest-environment node */

import { evaluateRazumlyAdminAccess } from '@/server/razumlyAdmin';

const makeClient = (row: { email: string; emailVerifiedAt: Date | null } | null) => ({
  authUser: {
    findUnique: jest.fn().mockResolvedValue(row),
  },
});

describe('evaluateRazumlyAdminAccess', () => {
  const originalAllowList = process.env.RAZUMLY_ADMIN_EMAILS;
  const originalDomain = process.env.RAZUMLY_ADMIN_DOMAIN;

  afterEach(() => {
    process.env.RAZUMLY_ADMIN_EMAILS = originalAllowList;
    process.env.RAZUMLY_ADMIN_DOMAIN = originalDomain;
  });

  it('rejects when user record is missing', async () => {
    const status = await evaluateRazumlyAdminAccess('user_1', makeClient(null) as any);
    expect(status.allowed).toBe(false);
    expect(status.reason).toBe('missing_user');
  });

  it('rejects unverified email accounts', async () => {
    const status = await evaluateRazumlyAdminAccess(
      'user_1',
      makeClient({ email: 'admin@razumly.com', emailVerifiedAt: null }) as any,
    );
    expect(status.allowed).toBe(false);
    expect(status.reason).toBe('unverified_email');
  });

  it('rejects non-razumly domains', async () => {
    const status = await evaluateRazumlyAdminAccess(
      'user_1',
      makeClient({ email: 'admin@example.com', emailVerifiedAt: new Date() }) as any,
    );
    expect(status.allowed).toBe(false);
    expect(status.reason).toBe('invalid_domain');
  });

  it('allows verified razumly emails', async () => {
    const status = await evaluateRazumlyAdminAccess(
      'user_1',
      makeClient({ email: 'admin@razumly.com', emailVerifiedAt: new Date() }) as any,
    );
    expect(status.allowed).toBe(true);
    expect(status.email).toBe('admin@razumly.com');
  });

  it('enforces optional email allow list', async () => {
    process.env.RAZUMLY_ADMIN_EMAILS = 'allowed@razumly.com';
    const denied = await evaluateRazumlyAdminAccess(
      'user_1',
      makeClient({ email: 'other@razumly.com', emailVerifiedAt: new Date() }) as any,
    );
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('not_allow_listed');

    const allowed = await evaluateRazumlyAdminAccess(
      'user_1',
      makeClient({ email: 'allowed@razumly.com', emailVerifiedAt: new Date() }) as any,
    );
    expect(allowed.allowed).toBe(true);
  });
});
