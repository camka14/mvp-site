import crypto from 'crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getFirebaseMessagingClient, isFirebaseMessagingEnabled } from '@/server/firebaseAdmin';

interface PushDeviceTargetRow {
  id: string;
  userId: string;
  pushToken: string;
  pushTarget: string | null;
  pushPlatform: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastSeenAt: Date | null;
}

export interface RegisterPushDeviceTargetInput {
  userId: string;
  pushToken: string;
  pushTarget?: string | null;
  pushPlatform?: string | null;
}

export interface UnregisterPushDeviceTargetInput {
  userIds: string[];
  pushToken?: string | null;
  pushTarget?: string | null;
}

export interface SendPushToUsersInput {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushDispatchResult {
  attempted: boolean;
  reason?: string;
  recipientCount: number;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  prunedTokenCount: number;
}

const normalizeOptional = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeUserIds = (userIds: string[]): string[] => (
  Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)))
);

const toPushDataValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toPushData = (data?: Record<string, unknown>): Record<string, string> | undefined => {
  if (!data) return undefined;
  const entries = Object.entries(data)
    .map(([key, value]) => [key, toPushDataValue(value)] as const)
    .filter(([key, value]) => key.trim().length > 0 && value.length > 0);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
};

const isInvalidTokenError = (code?: string): boolean => (
  code === 'messaging/registration-token-not-registered'
  || code === 'messaging/invalid-registration-token'
);

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const registerPushDeviceTarget = async ({
  userId,
  pushToken,
  pushTarget,
  pushPlatform,
}: RegisterPushDeviceTargetInput): Promise<void> => {
  const normalizedUserId = userId.trim();
  const normalizedPushToken = pushToken.trim();
  if (!normalizedUserId || !normalizedPushToken) return;

  const now = new Date();
  const id = crypto.randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "PushDeviceTarget" ("id", "createdAt", "updatedAt", "userId", "pushToken", "pushTarget", "pushPlatform", "lastSeenAt")
    VALUES (
      ${id},
      ${now},
      ${now},
      ${normalizedUserId},
      ${normalizedPushToken},
      ${normalizeOptional(pushTarget)},
      ${normalizeOptional(pushPlatform)},
      ${now}
    )
    ON CONFLICT ("pushToken")
    DO UPDATE SET
      "updatedAt" = EXCLUDED."updatedAt",
      "lastSeenAt" = EXCLUDED."lastSeenAt",
      "userId" = EXCLUDED."userId",
      "pushTarget" = COALESCE(EXCLUDED."pushTarget", "PushDeviceTarget"."pushTarget"),
      "pushPlatform" = COALESCE(EXCLUDED."pushPlatform", "PushDeviceTarget"."pushPlatform")
  `;
};

export const unregisterPushDeviceTarget = async ({
  userIds,
  pushToken,
  pushTarget,
}: UnregisterPushDeviceTargetInput): Promise<void> => {
  const normalizedUserIds = normalizeUserIds(userIds);
  const normalizedPushToken = normalizeOptional(pushToken);
  const normalizedPushTarget = normalizeOptional(pushTarget);

  if (normalizedPushToken) {
    await prisma.$executeRaw`
      DELETE FROM "PushDeviceTarget"
      WHERE "pushToken" = ${normalizedPushToken}
    `;
    return;
  }

  if (!normalizedUserIds.length) return;

  if (normalizedPushTarget) {
    await prisma.$executeRaw`
      DELETE FROM "PushDeviceTarget"
      WHERE "userId" IN (${Prisma.join(normalizedUserIds)})
      AND "pushTarget" = ${normalizedPushTarget}
    `;
    return;
  }

  await prisma.$executeRaw`
    DELETE FROM "PushDeviceTarget"
    WHERE "userId" IN (${Prisma.join(normalizedUserIds)})
  `;
};

const getPushTokensForUsers = async (userIds: string[]): Promise<string[]> => {
  const normalizedUserIds = normalizeUserIds(userIds);
  if (!normalizedUserIds.length) return [];

  const rows = await prisma.$queryRaw<Pick<PushDeviceTargetRow, 'pushToken'>[]>`
    SELECT DISTINCT "pushToken"
    FROM "PushDeviceTarget"
    WHERE "userId" IN (${Prisma.join(normalizedUserIds)})
      AND "pushToken" IS NOT NULL
  `;

  return Array.from(new Set(rows.map((row) => row.pushToken?.trim()).filter(Boolean) as string[]));
};

const prunePushTokens = async (tokens: string[]): Promise<number> => {
  const normalizedTokens = Array.from(new Set(tokens.map((token) => token.trim()).filter(Boolean)));
  if (!normalizedTokens.length) return 0;

  await prisma.$executeRaw`
    DELETE FROM "PushDeviceTarget"
    WHERE "pushToken" IN (${Prisma.join(normalizedTokens)})
  `;
  return normalizedTokens.length;
};

export const sendPushToUsers = async ({
  userIds,
  title,
  body,
  data,
}: SendPushToUsersInput): Promise<PushDispatchResult> => {
  const normalizedUserIds = normalizeUserIds(userIds);
  if (!normalizedUserIds.length) {
    return {
      attempted: false,
      reason: 'no_recipients',
      recipientCount: 0,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    };
  }

  const tokens = await getPushTokensForUsers(normalizedUserIds);
  if (!tokens.length) {
    return {
      attempted: false,
      reason: 'no_tokens',
      recipientCount: normalizedUserIds.length,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    };
  }

  if (!isFirebaseMessagingEnabled()) {
    return {
      attempted: false,
      reason: 'firebase_disabled',
      recipientCount: normalizedUserIds.length,
      tokenCount: tokens.length,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    };
  }

  const messaging = getFirebaseMessagingClient();
  if (!messaging) {
    return {
      attempted: false,
      reason: 'messaging_unavailable',
      recipientCount: normalizedUserIds.length,
      tokenCount: tokens.length,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    };
  }

  try {
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = new Set<string>();

    const tokenChunks = chunk(tokens, 500);
    const payloadData = toPushData(data);

    for (const tokenChunk of tokenChunks) {
      const response = await messaging.sendEachForMulticast({
        notification: {
          title: title.trim() || 'Notification',
          body: body.trim() || 'You have a new update.',
        },
        tokens: tokenChunk,
        data: payloadData,
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((entry, index) => {
        if (!entry.success && isInvalidTokenError(entry.error?.code)) {
          invalidTokens.add(tokenChunk[index]);
        }
      });
    }

    const prunedTokenCount = await prunePushTokens(Array.from(invalidTokens));

    return {
      attempted: true,
      recipientCount: normalizedUserIds.length,
      tokenCount: tokens.length,
      successCount,
      failureCount,
      prunedTokenCount,
    };
  } catch (error) {
    console.error('Failed to send push notifications', error);
    return {
      attempted: false,
      reason: 'dispatch_error',
      recipientCount: normalizedUserIds.length,
      tokenCount: tokens.length,
      successCount: 0,
      failureCount: tokens.length,
      prunedTokenCount: 0,
    };
  }
};
