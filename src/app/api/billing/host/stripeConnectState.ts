import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getRequestOrigin as resolveRequestOrigin } from '@/lib/requestOrigin';

export const STRIPE_CONNECT_CALLBACK_PATH = '/api/billing/host/callback';
export const STRIPE_CONNECT_STATE_TTL_SECONDS = 10 * 60;
const STRIPE_CONNECT_STATE_AUDIENCE = 'razumly-stripe-connect';
const STRIPE_CONNECT_STATE_ISSUER = 'razumly';

export type ConnectOwnerKind = 'user' | 'organization';

export type ConnectStatePayload = {
  kind: ConnectOwnerKind;
  ownerId: string;
  returnUrl: string;
  refreshUrl: string;
  nonce: string;
};

const getAuthSecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
};

export const getRequestOrigin = (req: NextRequest): string => resolveRequestOrigin(req);

export const getCallbackUrl = (origin: string): string => {
  const normalized = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${normalized}${STRIPE_CONNECT_CALLBACK_PATH}`;
};

export const sanitizeSameOriginUrl = (value: string | null, origin: string): string | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const requestOrigin = new URL(origin);
    if (parsed.origin !== requestOrigin.origin) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export const createConnectState = (
  kind: ConnectOwnerKind,
  ownerId: string,
  returnUrl: string,
  refreshUrl: string,
): string => {
  const payload = {
    kind,
    ownerId,
    returnUrl,
    refreshUrl,
    nonce: crypto.randomBytes(8).toString('hex'),
  } satisfies ConnectStatePayload;

  return jwt.sign(payload, getAuthSecret(), {
    audience: STRIPE_CONNECT_STATE_AUDIENCE,
    issuer: STRIPE_CONNECT_STATE_ISSUER,
    expiresIn: `${STRIPE_CONNECT_STATE_TTL_SECONDS}s`,
  });
};

export const parseConnectState = (token: string): ConnectStatePayload | null => {
  try {
    const decoded = jwt.verify(token, getAuthSecret(), {
      audience: STRIPE_CONNECT_STATE_AUDIENCE,
      issuer: STRIPE_CONNECT_STATE_ISSUER,
      maxAge: `${STRIPE_CONNECT_STATE_TTL_SECONDS}s`,
      algorithms: ['HS256'],
    }) as JwtPayload & Partial<ConnectStatePayload>;

    if (!decoded || typeof decoded !== 'object') {
      return null;
    }

    const kind = decoded.kind;
    const ownerId = decoded.ownerId;
    const returnUrl = decoded.returnUrl;
    const refreshUrl = decoded.refreshUrl;
    const nonce = decoded.nonce;

    if (kind !== 'user' && kind !== 'organization') {
      return null;
    }

    if (typeof ownerId !== 'string' || !ownerId) {
      return null;
    }

    if (typeof returnUrl !== 'string' || !returnUrl) {
      return null;
    }

    if (typeof refreshUrl !== 'string' || !refreshUrl) {
      return null;
    }

    if (typeof nonce !== 'string' || !nonce) {
      return null;
    }

    return {
      kind,
      ownerId,
      returnUrl,
      refreshUrl,
      nonce,
    };
  } catch {
    return null;
  }
};

export const buildStripeAuthorizeUrl = (
  stripe: Stripe,
  params: {
    clientId: string;
    state: string;
    redirectUri: string;
    email?: string;
  },
): string => stripe.oauth.authorizeUrl({
  client_id: params.clientId,
  state: params.state,
  response_type: 'code',
  scope: 'read_write',
  redirect_uri: params.redirectUri,
  ...(params.email ? { stripe_user: { email: params.email } } : {}),
});

export const appendStripeResultQuery = (
  target: string,
  result: 'return' | 'error',
  options?: { reason?: string },
): string => {
  const parsed = new URL(target);
  parsed.searchParams.set('stripe', result);
  if (options?.reason) {
    parsed.searchParams.set('reason', options.reason);
  }
  return parsed.toString();
};
