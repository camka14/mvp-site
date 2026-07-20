import {
  buildTeamInviteShareUrl,
  verifyTeamInviteShareLink,
} from '@/server/teamInviteLinks';

describe('team invite share links', () => {
  const originalSecret = process.env.AUTH_SECRET;

  beforeEach(() => { process.env.AUTH_SECRET = 'team-invite-test-secret'; });
  afterAll(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  it('signs and verifies the invite id, version, and expiration', () => {
    const invite = { id: 'invite_1', linkVersion: 2, linkExpiresAt: new Date('2030-01-02T00:00:00.000Z') };
    const url = new URL(buildTeamInviteShareUrl(invite, 'https://bracket-iq.com'));

    expect(verifyTeamInviteShareLink(invite, {
      version: url.searchParams.get('v'),
      expiresAt: url.searchParams.get('e'),
      signature: url.searchParams.get('s'),
    }, new Date('2030-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('rejects a changed invite version or an expired link', () => {
    const invite = { id: 'invite_1', linkVersion: 1, linkExpiresAt: new Date('2030-01-02T00:00:00.000Z') };
    const url = new URL(buildTeamInviteShareUrl(invite, 'https://bracket-iq.com'));
    const input = {
      version: url.searchParams.get('v'),
      expiresAt: url.searchParams.get('e'),
      signature: url.searchParams.get('s'),
    };

    expect(verifyTeamInviteShareLink({ ...invite, linkVersion: 2 }, input, new Date('2030-01-01T00:00:00.000Z'))).toBe(false);
    expect(verifyTeamInviteShareLink(invite, input, new Date('2030-01-03T00:00:00.000Z'))).toBe(false);
  });
});
