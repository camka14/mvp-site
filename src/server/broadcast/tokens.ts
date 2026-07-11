import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { getAuthSecret } from '@/lib/authServer';
import { getPublishedBroadcastOverlay } from './access';
import type { BroadcastOverlaySocketTicket } from './types';

export const BROADCAST_OVERLAY_SOCKET_ISSUER = 'bracket-iq';
export const BROADCAST_OVERLAY_SOCKET_AUDIENCE = 'bracket-iq-broadcast-overlay';
export const BROADCAST_OVERLAY_SOCKET_TOKEN_TYPE = 'broadcast_overlay_stream';
export const BROADCAST_OVERLAY_SOCKET_SCOPE = 'broadcast-overlay-read';
export const BROADCAST_OVERLAY_SOCKET_TTL_SECONDS = 60;

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export class BroadcastOverlayCapabilityError extends Error {
  constructor() {
    super('The broadcast overlay capability is invalid, expired, or revoked.');
    this.name = 'BroadcastOverlayCapabilityError';
  }
}

const hashToken = (token: string): string => (
  createHash('sha256').update(token).digest('base64url')
);

const createRawToken = (): string => randomBytes(32).toString('base64url');

const updateLastUsedAtIfNeeded = async (tokenRow: { id: string; lastUsedAt: Date | null }): Promise<void> => {
  const lastUsedAt = tokenRow.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - lastUsedAt < LAST_USED_WRITE_INTERVAL_MS) {
    return;
  }
  await prisma.broadcastOverlayAccessTokens.update({
    where: { id: tokenRow.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => undefined);
};

export const createBroadcastOverlayAccessToken = async (input: {
  overlayId: string;
  createdByUserId: string;
  label?: string;
  expiresAt?: Date | null;
}) => {
  const token = createRawToken();
  const tokenRow = await prisma.$transaction(async (tx) => {
    const overlay = await tx.broadcastOverlays.findUnique({ where: { id: input.overlayId } });
    if (!overlay || overlay.archivedAt) {
      throw new BroadcastOverlayCapabilityError();
    }
    const row = await tx.broadcastOverlayAccessTokens.create({
      data: {
        id: randomUUID(),
        overlayId: overlay.id,
        tokenHash: hashToken(token),
        label: input.label?.trim() || null,
        createdByUserId: input.createdByUserId,
        expiresAt: input.expiresAt ?? null,
      },
    });
    await tx.broadcastOverlayActions.create({
      data: {
        id: randomUUID(),
        overlayId: overlay.id,
        organizationId: overlay.organizationId,
        eventId: overlay.eventId,
        actorUserId: input.createdByUserId,
        actorKind: 'USER',
        actionType: 'ACCESS_TOKEN_CREATED',
        presentationRevision: 0,
        requestId: `token-create:${row.id}`,
        payload: { label: row.label },
      },
    });
    return row;
  });
  return { token, tokenRow };
};

export type ValidatedBroadcastOverlayAccess = {
  overlay: Awaited<ReturnType<typeof getPublishedBroadcastOverlay>>;
  tokenRow: {
    id: string;
    overlayId: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
  };
};

export const validateBroadcastOverlayAccessToken = async (input: {
  overlayId: string;
  token: string;
}): Promise<ValidatedBroadcastOverlayAccess> => {
  const token = input.token.trim();
  if (!token || token.length < 32) {
    throw new BroadcastOverlayCapabilityError();
  }
  const now = new Date();
  const tokenRow = await prisma.broadcastOverlayAccessTokens.findFirst({
    where: {
      overlayId: input.overlayId,
      tokenHash: hashToken(token),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      overlayId: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  });
  if (!tokenRow) {
    throw new BroadcastOverlayCapabilityError();
  }
  const overlay = await getPublishedBroadcastOverlay(input.overlayId);
  await updateLastUsedAtIfNeeded(tokenRow);
  return { overlay, tokenRow };
};

export const rotateBroadcastOverlayAccessToken = async (input: {
  overlayId: string;
  tokenId: string;
  rotatedByUserId: string;
  label?: string;
  expiresAt?: Date | null;
}) => {
  const token = createRawToken();
  const tokenRow = await prisma.$transaction(async (tx) => {
    const existing = await tx.broadcastOverlayAccessTokens.findFirst({
      where: { id: input.tokenId, overlayId: input.overlayId, revokedAt: null },
    });
    const overlay = await tx.broadcastOverlays.findUnique({ where: { id: input.overlayId } });
    if (!existing || !overlay || overlay.archivedAt) {
      throw new BroadcastOverlayCapabilityError();
    }
    await tx.broadcastOverlayAccessTokens.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        revokedByUserId: input.rotatedByUserId,
        revokeReason: 'ROTATED',
      },
    });
    const replacement = await tx.broadcastOverlayAccessTokens.create({
      data: {
        id: randomUUID(),
        overlayId: input.overlayId,
        tokenHash: hashToken(token),
        label: input.label?.trim() || existing.label,
        createdByUserId: input.rotatedByUserId,
        expiresAt: input.expiresAt ?? existing.expiresAt,
      },
    });
    await tx.broadcastOverlayActions.create({
      data: {
        id: randomUUID(),
        overlayId: overlay.id,
        organizationId: overlay.organizationId,
        eventId: overlay.eventId,
        accessTokenId: existing.id,
        actorUserId: input.rotatedByUserId,
        actorKind: 'USER',
        actionType: 'ACCESS_TOKEN_ROTATED',
        presentationRevision: 0,
        requestId: `token-rotate:${existing.id}:${replacement.id}`,
        payload: { replacementTokenId: replacement.id, label: replacement.label },
      },
    });
    return replacement;
  });
  return { token, tokenRow };
};

export const revokeBroadcastOverlayAccessToken = async (input: {
  overlayId: string;
  tokenId: string;
  revokedByUserId: string;
  reason?: string;
}): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const tokenRow = await tx.broadcastOverlayAccessTokens.findFirst({
      where: { id: input.tokenId, overlayId: input.overlayId, revokedAt: null },
    });
    const overlay = await tx.broadcastOverlays.findUnique({ where: { id: input.overlayId } });
    if (!tokenRow || !overlay) {
      throw new BroadcastOverlayCapabilityError();
    }
    await tx.broadcastOverlayAccessTokens.update({
      where: { id: tokenRow.id },
      data: {
        revokedAt: new Date(),
        revokedByUserId: input.revokedByUserId,
        revokeReason: input.reason?.trim() || 'REVOKED',
      },
    });
    await tx.broadcastOverlayActions.create({
      data: {
        id: randomUUID(),
        overlayId: overlay.id,
        organizationId: overlay.organizationId,
        eventId: overlay.eventId,
        accessTokenId: tokenRow.id,
        actorUserId: input.revokedByUserId,
        actorKind: 'USER',
        actionType: 'ACCESS_TOKEN_REVOKED',
        presentationRevision: 0,
        requestId: `token-revoke:${tokenRow.id}`,
        payload: { reason: input.reason?.trim() || 'REVOKED' },
      },
    });
  });
  const { publishBroadcastOverlayRevocation } = await import('@/server/realtime/broadcastOverlayRealtime');
  publishBroadcastOverlayRevocation({ overlayId: input.overlayId, accessTokenId: input.tokenId });
};

export const createBroadcastOverlaySocketTicket = (input: {
  overlayId: string;
  accessTokenId: string;
}): string => jwt.sign({
  overlayId: input.overlayId,
  accessTokenId: input.accessTokenId,
  scope: BROADCAST_OVERLAY_SOCKET_SCOPE,
  tokenType: BROADCAST_OVERLAY_SOCKET_TOKEN_TYPE,
}, getAuthSecret(), {
  algorithm: 'HS256',
  issuer: BROADCAST_OVERLAY_SOCKET_ISSUER,
  audience: BROADCAST_OVERLAY_SOCKET_AUDIENCE,
  expiresIn: BROADCAST_OVERLAY_SOCKET_TTL_SECONDS,
});

export const verifyBroadcastOverlaySocketTicket = (token: string): BroadcastOverlaySocketTicket | null => {
  try {
    const decoded = jwt.verify(token, getAuthSecret(), {
      algorithms: ['HS256'],
      issuer: BROADCAST_OVERLAY_SOCKET_ISSUER,
      audience: BROADCAST_OVERLAY_SOCKET_AUDIENCE,
    }) as JwtPayload;
    if (
      decoded.tokenType !== BROADCAST_OVERLAY_SOCKET_TOKEN_TYPE
      || decoded.scope !== BROADCAST_OVERLAY_SOCKET_SCOPE
      || typeof decoded.overlayId !== 'string'
      || typeof decoded.accessTokenId !== 'string'
      || !decoded.overlayId.trim()
      || !decoded.accessTokenId.trim()
    ) {
      return null;
    }
    return {
      overlayId: decoded.overlayId,
      accessTokenId: decoded.accessTokenId,
      scope: BROADCAST_OVERLAY_SOCKET_SCOPE,
    };
  } catch {
    return null;
  }
};

