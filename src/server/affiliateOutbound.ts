import crypto from 'node:crypto';
import { normalizeExternalHttpUrl } from '@/lib/externalUrl';
import { prisma } from '@/lib/prisma';
import { SITE_URL } from '@/lib/siteUrl';

export const AFFILIATE_OUTBOUND_KINDS = ['event', 'team', 'facility'] as const;
export type AffiliateOutboundKind = (typeof AFFILIATE_OUTBOUND_KINDS)[number];

export type AffiliateOutboundTarget = {
  kind: AffiliateOutboundKind;
  id: string;
  signature: string;
};

export const AFFILIATE_OUTBOUND_COOKIE_NAME = 'biq_outbound_session';
export const AFFILIATE_BROWSER_PROOF_TTL_MS = 5 * 60 * 1000;

const OUTBOUND_SIGNATURE_VERSION = 'v1';
const OUTBOUND_SIGNATURE_LENGTH = 32;
const MAX_TARGET_ID_LENGTH = 200;
const TARGET_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const FUTURE_PROOF_CLOCK_SKEW_MS = 30 * 1000;

const BLOCKED_USER_AGENT_PATTERNS = [
  /\b(?:GPTBot|ChatGPT-User|OAI-SearchBot)\b/i,
  /\b(?:ClaudeBot|Claude-Web|anthropic-ai)\b/i,
  /\b(?:PerplexityBot|Bytespider|CCBot|cohere-ai|Amazonbot|Applebot-Extended|Google-Extended)\b/i,
  /\b(?:Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|PetalBot|facebookexternalhit)\b/i,
  /\b(?:HeadlessChrome|PhantomJS|SlimerJS)\b/i,
  /\b(?:curl|Wget|python-requests|python-httpx|aiohttp|Scrapy|Go-http-client|node-fetch|undici|Apache-HttpClient)\b/i,
  /\b(?:crawler|spider|scraper|bot)\b/i,
] as const;

const getAffiliateOutboundSecret = (): string => {
  const secret = process.env.AFFILIATE_REDIRECT_SECRET?.trim()
    || process.env.AUTH_SECRET?.trim()
    || process.env.JWT_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === 'test') {
    return 'bracketiq-affiliate-outbound-test-secret';
  }
  if (!secret) {
    throw new Error('AFFILIATE_REDIRECT_SECRET or AUTH_SECRET is required for affiliate redirects.');
  }
  return secret;
};

const sign = (value: string): string => (
  crypto
    .createHmac('sha256', getAffiliateOutboundSecret())
    .update(`bracketiq:affiliate-outbound:${value}`)
    .digest('base64url')
    .slice(0, OUTBOUND_SIGNATURE_LENGTH)
);

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const isAffiliateOutboundKind = (value: string): value is AffiliateOutboundKind => (
  (AFFILIATE_OUTBOUND_KINDS as readonly string[]).includes(value)
);

export const normalizeAffiliateOutboundTargetId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > MAX_TARGET_ID_LENGTH
    || !TARGET_ID_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
};

export const createAffiliateOutboundSignature = (
  kind: AffiliateOutboundKind,
  id: string,
): string => sign(`${OUTBOUND_SIGNATURE_VERSION}:target:${kind}:${id}`);

export const verifyAffiliateOutboundSignature = (
  kind: AffiliateOutboundKind,
  id: string,
  signature: string,
): boolean => {
  const normalizedId = normalizeAffiliateOutboundTargetId(id);
  if (!normalizedId || !/^[A-Za-z0-9_-]{32}$/.test(signature)) return false;
  return safeEqual(createAffiliateOutboundSignature(kind, normalizedId), signature);
};

export const buildAffiliateOutboundPath = (
  kind: AffiliateOutboundKind,
  id: string,
): string => {
  const normalizedId = normalizeAffiliateOutboundTargetId(id);
  if (!normalizedId) throw new Error('A valid affiliate outbound target id is required.');
  const signature = createAffiliateOutboundSignature(kind, normalizedId);
  return `/out/${kind}/${encodeURIComponent(normalizedId)}/${signature}`;
};

export const buildAffiliateOutboundUrl = (
  kind: AffiliateOutboundKind,
  id: string,
): string => `${SITE_URL}${buildAffiliateOutboundPath(kind, id)}`;

export const withAffiliateOutboundAction = <T extends Record<string, any>>(
  row: T,
  kind: AffiliateOutboundKind,
): T => {
  const id = normalizeAffiliateOutboundTargetId(row.id ?? row.$id);
  const affiliateUrl = normalizeExternalHttpUrl(row.affiliateUrl);

  return {
    ...row,
    affiliateActionUrl: affiliateUrl && id
      ? buildAffiliateOutboundUrl(kind, id)
      : null,
  };
};

export const protectAffiliateRow = <T extends Record<string, any>>(
  row: T,
  kind: AffiliateOutboundKind,
): T => {
  const protectedRow = withAffiliateOutboundAction(row, kind);

  (protectedRow as Record<string, any>).affiliateUrl = (
    protectedRow as Record<string, any>
  ).affiliateActionUrl;
  if (kind === 'event' && Object.prototype.hasOwnProperty.call(protectedRow, 'sourceUrl')) {
    (protectedRow as Record<string, any>).sourceUrl = null;
  }
  return protectedRow;
};

export const createAffiliateBrowserSessionId = (): string => crypto.randomBytes(24).toString('base64url');

export const createAffiliateBrowserProof = (
  target: AffiliateOutboundTarget,
  browserSessionId: string,
  issuedAtMs: number = Date.now(),
): string => {
  const normalizedIssuedAt = Math.trunc(issuedAtMs);
  const proofSignature = sign([
    OUTBOUND_SIGNATURE_VERSION,
    'proof',
    target.kind,
    target.id,
    target.signature,
    browserSessionId,
    normalizedIssuedAt,
  ].join(':'));
  return `${normalizedIssuedAt}.${proofSignature}`;
};

export const verifyAffiliateBrowserProof = (
  proof: string,
  target: AffiliateOutboundTarget,
  browserSessionId: string,
  nowMs: number = Date.now(),
): boolean => {
  const [issuedAtRaw, proofSignature, ...extra] = proof.split('.');
  if (extra.length || !/^\d{13}$/.test(issuedAtRaw ?? '') || !proofSignature) return false;
  const issuedAtMs = Number(issuedAtRaw);
  if (
    !Number.isSafeInteger(issuedAtMs)
    || issuedAtMs > nowMs + FUTURE_PROOF_CLOCK_SKEW_MS
    || nowMs - issuedAtMs > AFFILIATE_BROWSER_PROOF_TTL_MS
  ) {
    return false;
  }
  const expected = createAffiliateBrowserProof(target, browserSessionId, issuedAtMs);
  return safeEqual(expected, proof);
};

export const isBlockedAffiliateUserAgent = (userAgent: string | null): boolean => {
  const normalized = userAgent?.trim() ?? '';
  if (!normalized) return true;
  return BLOCKED_USER_AGENT_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const resolveAffiliateDestination = async (
  kind: AffiliateOutboundKind,
  id: string,
): Promise<string | null> => {
  if (kind === 'event') {
    const event = await prisma.events.findFirst({
      where: {
        id,
        archivedAt: null,
        OR: [{ state: 'PUBLISHED' }, { state: null }],
      },
      select: { affiliateUrl: true },
    });
    return normalizeExternalHttpUrl(event?.affiliateUrl);
  }

  if (kind === 'team') {
    const team = await prisma.canonicalTeams.findFirst({
      where: {
        id,
        archivedAt: null,
        visibility: 'PUBLIC',
      },
      select: { affiliateUrl: true },
    });
    return normalizeExternalHttpUrl(team?.affiliateUrl);
  }

  const facility = await prisma.facilities.findFirst({
    where: { id, status: 'ACTIVE' },
    select: { affiliateUrl: true },
  });
  return normalizeExternalHttpUrl(facility?.affiliateUrl);
};
