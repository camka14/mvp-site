import { NextRequest } from 'next/server';
import type { SessionToken } from '@/lib/authServer';
import { getTokenFromRequest, verifySessionToken } from '@/lib/authServer';
import type { AuthContext } from '@/lib/permissions';
import { requireSession } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

type AuthUserLookupClient = {
  authUser: {
    findUnique: (args: {
      where: { id: string };
      select: { email: true; emailVerifiedAt: true };
    }) => Promise<{ email: string; emailVerifiedAt: Date | null } | null>;
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

const DEFAULT_RAZUMLY_ADMIN_DOMAIN = 'razumly.com';

const normalizeEmail = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const getAllowedDomain = (): string => {
  const configured = normalizeEmail(process.env.RAZUMLY_ADMIN_DOMAIN);
  if (!configured) return DEFAULT_RAZUMLY_ADMIN_DOMAIN;
  return configured.replace(/^@+/, '');
};

const parseAllowListedEmails = (): Set<string> => (
  new Set(
    (process.env.RAZUMLY_ADMIN_EMAILS ?? '')
      .split(',')
      .map((entry) => normalizeEmail(entry))
      .filter((entry): entry is string => Boolean(entry)),
  )
);

const isAllowedDomainEmail = (email: string, domain: string): boolean => {
  const [, emailDomain = ''] = email.split('@');
  return emailDomain === domain;
};

export const evaluateRazumlyAdminAccess = async (
  userId: string,
  client: AuthUserLookupClient = prisma,
): Promise<RazumlyAdminStatus> => {
  const authUser = await client.authUser.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
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

  const domain = getAllowedDomain();
  if (!isAllowedDomainEmail(email, domain)) {
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

  const status = await evaluateRazumlyAdminAccess(session.userId, client);
  return { session, status };
};

export const resolveRazumlyAdminFromRequest = async (
  req: NextRequest,
  client: AuthUserLookupClient = prisma,
): Promise<{ session: SessionToken | null; status: RazumlyAdminStatus }> => {
  const token = getTokenFromRequest(req);
  return resolveRazumlyAdminFromToken(token, client);
};
