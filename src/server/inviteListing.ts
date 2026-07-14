import { Prisma } from '@/generated/prisma/client';

const DEFAULT_INVITE_PAGE_LIMIT = 50;
export const MAX_INVITE_PAGE_LIMIT = 100;
const MAX_INVITE_CURSOR_LENGTH = 1024;

/**
 * Terminal invite history is retained for 90 days. Cleanup is deliberately
 * scoped by the caller's authorized listing boundary and never removes a team
 * invite while a pending event-sync row may still need reconciliation.
 */
export const TERMINAL_INVITE_RETENTION_DAYS = 90;
const TERMINAL_INVITE_CLEANUP_BATCH_SIZE = 250;
const TERMINAL_INVITE_STATUSES = ['DECLINED', 'REJECTED', 'FAILED'] as const;
const TEAM_INVITE_TYPE_ALIASES = ['TEAM', 'PLAYER', 'TEAM_MANAGER', 'TEAM_HEAD_COACH', 'TEAM_ASSISTANT_COACH'];
const STAFF_INVITE_TYPE_ALIASES = ['STAFF', 'HOST', 'OFFICIAL'];

export type InviteRetentionScope = {
  userId?: string | null;
  delegatedChildUserIds?: string[];
  teamId?: string | null;
  type?: string | null;
  allowGlobal?: boolean;
};

type InviteCursor = {
  createdAt: string | null;
  id: string;
};

type InvitePageRow = {
  id: string;
  createdAt?: Date | null;
  [key: string]: unknown;
};

export class InvalidInviteCursorError extends Error {
  constructor() {
    super('Invalid invite cursor.');
    this.name = 'InvalidInviteCursorError';
  }
}

const encodeInviteCursor = (invite: InvitePageRow): string => Buffer.from(JSON.stringify({
  createdAt: invite.createdAt instanceof Date ? invite.createdAt.toISOString() : null,
  id: invite.id,
} satisfies InviteCursor), 'utf8').toString('base64url');

const decodeInviteCursor = (rawCursor: string): { createdAt: Date | null; id: string } => {
  if (!rawCursor || rawCursor.length > MAX_INVITE_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) {
    throw new InvalidInviteCursorError();
  }
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as Partial<InviteCursor>;
    if (typeof parsed.id !== 'string' || !parsed.id.trim()) {
      throw new InvalidInviteCursorError();
    }
    if (parsed.createdAt !== null && typeof parsed.createdAt !== 'string') {
      throw new InvalidInviteCursorError();
    }
    const createdAt = parsed.createdAt === null ? null : new Date(parsed.createdAt);
    if (createdAt && Number.isNaN(createdAt.getTime())) {
      throw new InvalidInviteCursorError();
    }
    return { createdAt, id: parsed.id };
  } catch (error) {
    if (error instanceof InvalidInviteCursorError) throw error;
    throw new InvalidInviteCursorError();
  }
};

export const normalizeInvitePageLimit = (value: string | null): number | null => {
  if (value === null || value === '') return DEFAULT_INVITE_PAGE_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_INVITE_PAGE_LIMIT) return null;
  return parsed;
};

export const listInviteRecordsPage = async <T extends InvitePageRow>(
  client: any,
  where: Record<string, unknown>,
  options: { limit: number; cursor?: string | null },
): Promise<{ invites: T[]; nextCursor: string | null }> => {
  const cursor = options.cursor ? decodeInviteCursor(options.cursor) : null;
  const pageWhere = cursor
    ? {
        AND: [
          where,
          cursor.createdAt
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  { createdAt: null },
                ],
              }
            : { createdAt: null, id: { lt: cursor.id } },
        ],
      }
    : where;
  const page = await client.invites.findMany({
    where: pageWhere,
    orderBy: [
      { createdAt: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ],
    take: options.limit + 1,
  }) as T[];
  const hasNextPage = page.length > options.limit;
  const invites = hasNextPage ? page.slice(0, options.limit) : page;
  return {
    invites,
    nextCursor: hasNextPage && invites.length > 0
      ? encodeInviteCursor(invites[invites.length - 1])
      : null,
  };
};

export const pruneExpiredTerminalInvites = async ({
  client,
  scope,
  now = new Date(),
}: {
  client: any;
  scope: InviteRetentionScope;
  now?: Date;
}): Promise<number> => {
  if (!client?.$executeRaw) return 0;
  const userId = scope.userId?.trim() || null;
  const teamId = scope.teamId?.trim() || null;
  const delegatedChildUserIds = Array.from(new Set(
    (scope.delegatedChildUserIds ?? []).map((id) => id.trim()).filter(Boolean),
  ));
  if (!scope.allowGlobal && !userId && !teamId) return 0;

  const cutoff = new Date(now.getTime() - TERMINAL_INVITE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const accessConditions: Prisma.Sql[] = [];
  const viewerConditions: Prisma.Sql[] = [];
  if (userId) viewerConditions.push(Prisma.sql`invite."userId" = ${userId}`);
  if (userId && delegatedChildUserIds.length) {
    viewerConditions.push(Prisma.sql`(
      UPPER(invite."type") IN (${Prisma.join(TEAM_INVITE_TYPE_ALIASES)})
      AND invite."userId" IN (${Prisma.join(delegatedChildUserIds)})
    )`);
  }
  if (viewerConditions.length) {
    accessConditions.push(Prisma.sql`(${Prisma.join(viewerConditions, ' OR ')})`);
  }
  if (teamId) accessConditions.push(Prisma.sql`invite."teamId" = ${teamId}`);

  const normalizedType = scope.type?.trim().toUpperCase() || null;
  const rawTypeValues = normalizedType === 'TEAM'
    ? TEAM_INVITE_TYPE_ALIASES
    : normalizedType === 'STAFF'
      ? STAFF_INVITE_TYPE_ALIASES
      : normalizedType
        ? [normalizedType]
        : [];
  if (rawTypeValues.length) {
    accessConditions.push(Prisma.sql`UPPER(invite."type") IN (${Prisma.join(rawTypeValues)})`);
  }
  const accessSql = accessConditions.length
    ? Prisma.join(accessConditions, ' AND ')
    : Prisma.sql`TRUE`;
  const terminalSql = Prisma.sql`UPPER(invite."status") IN (${Prisma.join([...TERMINAL_INVITE_STATUSES])})`;
  const ageSql = Prisma.sql`COALESCE(invite."updatedAt", invite."createdAt") < ${cutoff}`;

  // NOT EXISTS is evaluated before LIMIT, so any number of protected team
  // reconciliation rows cannot starve later deletable terminal invitations.
  const query = Prisma.sql`
    WITH candidates AS (
      SELECT invite."id"
      FROM "Invites" AS invite
      WHERE ${accessSql}
        AND ${terminalSql}
        AND ${ageSql}
        AND NOT EXISTS (
          SELECT 1
          FROM "TeamInviteEventSyncs" AS sync
          WHERE sync."inviteId" = invite."id"
            AND sync."status" = 'PENDING'
        )
      ORDER BY COALESCE(invite."updatedAt", invite."createdAt") ASC NULLS LAST, invite."id" ASC
      LIMIT ${TERMINAL_INVITE_CLEANUP_BATCH_SIZE}
    )
    DELETE FROM "Invites" AS invite
    USING candidates
    WHERE invite."id" = candidates."id"
      AND ${accessSql}
      AND ${terminalSql}
      AND ${ageSql}
  `;
  const deleted = await client.$executeRaw(query);
  return typeof deleted === 'number' ? deleted : 0;
};
