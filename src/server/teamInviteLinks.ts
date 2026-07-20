import crypto from 'crypto';

const INVITE_LINK_PURPOSE = 'bracketiq:team-invite:v1';
export const TEAM_INVITE_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type LinkFields = {
  id: string;
  linkVersion?: number | null;
  linkExpiresAt?: Date | string | null;
};

const getSecret = (): string => {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return secret;
};

const expiresAtMillis = (value: Date | string | null | undefined): number => {
  const millis = value instanceof Date ? value.getTime() : new Date(value ?? '').getTime();
  if (!Number.isFinite(millis)) throw new Error('Invite link expiration is missing');
  return millis;
};

const payloadFor = (id: string, version: number, expiresAt: number): string => (
  `${INVITE_LINK_PURPOSE}:${id}:${version}:${expiresAt}`
);

const signatureFor = (id: string, version: number, expiresAt: number): string => (
  crypto.createHmac('sha256', getSecret()).update(payloadFor(id, version, expiresAt)).digest('base64url')
);

export const buildTeamInviteShareUrl = (invite: LinkFields, baseUrl: string): string => {
  const version = Math.max(1, Math.trunc(invite.linkVersion ?? 1));
  const expiresAt = expiresAtMillis(invite.linkExpiresAt);
  const url = new URL(`/i/${encodeURIComponent(invite.id)}`, baseUrl);
  url.searchParams.set('v', String(version));
  url.searchParams.set('e', String(expiresAt));
  url.searchParams.set('s', signatureFor(invite.id, version, expiresAt));
  return url.toString();
};

export const verifyTeamInviteShareLink = (
  invite: LinkFields,
  input: { version: string | null; expiresAt: string | null; signature: string | null },
  now = new Date(),
): boolean => {
  const version = Number(input.version);
  const expiresAt = Number(input.expiresAt);
  if (!Number.isInteger(version) || version < 1 || !Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return false;
  }
  if (version !== Math.max(1, Math.trunc(invite.linkVersion ?? 1))) return false;
  if (expiresAt !== expiresAtMillis(invite.linkExpiresAt)) return false;
  if (!input.signature) return false;
  const expected = Buffer.from(signatureFor(invite.id, version, expiresAt));
  const provided = Buffer.from(input.signature);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
};
