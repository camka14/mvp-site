import { NextRequest } from 'next/server';
import type { SessionToken } from '@/lib/authServer';
import { getTokenFromRequest, verifySessionToken } from '@/lib/authServer';
import type { AuthContext } from '@/lib/permissions';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { isSessionTokenCurrent } from './authSessions';

type AuthUserLookupClient = {
  authUser: {
    findUnique: (args: {
      where: { id: string };
      select: { email: true; emailVerifiedAt: true; sessionVersion: true };
    }) => Promise<{ email: string; emailVerifiedAt: Date | null; sessionVersion: number | null } | null>;
  };
};

export type RazumlyAdminFailureReason =
  | 'missing_session'
  | 'invalid_session'
  | 'missing_user'
  | 'missing_email'
  | 'unverified_email'
  | 'invalid_domain'
  | 'not_allow_listed';

export type RazumlyAdminStatus = {
  allowed: boolean;
  email: string | null;
  verified: boolean;
  reason?: RazumlyAdminFailureReason;
};

const DEFAULT_RAZUMLY_ADMIN_DOMAINS = ['razumly.com', 'bracket-iq.com'] as const;

const normalizeEmail = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeDomain = (value: string | null | undefined): string | null => {
  const normalized = normalizeEmail(value);
  if (!normalized) return null;
  const withoutAtPrefix = normalized.replace(/^@+/, '');
  return withoutAtPrefix.length > 0 ? withoutAtPrefix : null;
};

const getAllowedDomains = (): Set<string> => {
  const configuredDomains = (process.env.RAZUMLY_ADMIN_DOMAINS ?? '')
    .split(',')
    .map((entry) => normalizeDomain(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (configuredDomains.length > 0) {
    return new Set(configuredDomains);
  }

  const legacySingleDomain = normalizeDomain(process.env.RAZUMLY_ADMIN_DOMAIN);
  if (legacySingleDomain) {
    return new Set([legacySingleDomain]);
  }

  return new Set(DEFAULT_RAZUMLY_ADMIN_DOMAINS);
};

const parseAllowListedEmails = (): Set<string> => (
  new Set(
    (process.env.RAZUMLY_ADMIN_EMAILS ?? '')
      .split(',')
      .map((entry) => normalizeEmail(entry))
      .filter((entry): entry is string => Boolean(entry)),
  )
);

const isAllowedDomainEmail = (email: string, allowedDomains: Set<string>): boolean => {
  const [, emailDomain = ''] = email.split('@');
  return allowedDomains.has(emailDomain);
};

export const evaluateRazumlyAdminAccess = async (
  userId: string,
  client: AuthUserLookupClient = prisma,
): Promise<RazumlyAdminStatus> => {
  const authUser = await client.authUser.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, sessionVersion: true },
  });
  if (!authUser) {
    return { allowed: false, email: null, verified: false, reason: 'missing_user' };
  }

  const email = normalizeEmail(authUser.email);
  if (!email) {
    return { allowed: false, email: null, verified: false, reason: 'missing_email' };
  }

  const verified = Boolean(authUser.emailVerifiedAt);
  if (!verified) {
    return { allowed: false, email, verified, reason: 'unverified_email' };
  }

  const allowedDomains = getAllowedDomains();
  if (!isAllowedDomainEmail(email, allowedDomains)) {
    return { allowed: false, email, verified, reason: 'invalid_domain' };
  }

  const allowList = parseAllowListedEmails();
  if (allowList.size > 0 && !allowList.has(email)) {
    return { allowed: false, email, verified, reason: 'not_allow_listed' };
  }

  return { allowed: true, email, verified };
};

export const requireRazumlyAdmin = async (
  req: NextRequest,
  client: AuthUserLookupClient = prisma,
): Promise<AuthContext & { adminEmail: string }> => {
  const session = await requireSession(req);
  const status = await evaluateRazumlyAdminAccess(session.userId, client);
  if (!status.allowed || !status.email) {
    throw new Response('Forbidden', { status: 403 });
  }
  return { ...session, adminEmail: status.email };
};

export const resolveRazumlyAdminFromToken = async (
  token: string | null,
  client: AuthUserLookupClient = prisma,
): Promise<{ session: SessionToken | null; status: RazumlyAdminStatus }> => {
  if (!token) {
    return {
      session: null,
      status: { allowed: false, email: null, verified: false, reason: 'missing_session' },
    };
  }

  const session = verifySessionToken(token);
  if (!session) {
    return {
      session: null,
      status: { allowed: false, email: null, verified: false, reason: 'invalid_session' },
    };
  }

  const authUser = await client.authUser.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerifiedAt: true, sessionVersion: true },
  });
  if (!authUser) {
    return {
      session: null,
      status: { allowed: false, email: null, verified: false, reason: 'missing_user' },
    };
  }
  if (!isSessionTokenCurrent(session, authUser.sessionVersion)) {
    return {
      session: null,
      status: { allowed: false, email: null, verified: false, reason: 'invalid_session' },
    };
  }

  const status = await evaluateRazumlyAdminAccess(session.userId, {
    authUser: {
      findUnique: async () => authUser,
    },
  });
  return { session, status };
};

export const resolveRazumlyAdminFromRequest = async (
  req: NextRequest,
  client: AuthUserLookupClient = prisma,
): Promise<{ session: SessionToken | null; status: RazumlyAdminStatus }> => {
  const token = getTokenFromRequest(req);
  return resolveRazumlyAdminFromToken(token, client);
};
