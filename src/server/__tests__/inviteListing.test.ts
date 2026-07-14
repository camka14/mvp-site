/** @jest-environment node */

import {
  listInviteRecordsPage,
  pruneExpiredTerminalInvites,
  TERMINAL_INVITE_RETENTION_DAYS,
} from '@/server/inviteListing';

describe('invite listing pagination and retention', () => {
  it('uses a deterministic keyset cursor across equal timestamps', async () => {
    const createdAt = new Date('2026-07-01T12:00:00.000Z');
    const client = {
      invites: {
        findMany: jest.fn()
          .mockResolvedValueOnce([
            { id: 'invite_c', createdAt },
            { id: 'invite_b', createdAt },
            { id: 'invite_a', createdAt },
          ])
          .mockResolvedValueOnce([{ id: 'invite_a', createdAt }]),
      },
    };

    const firstPage = await listInviteRecordsPage(client, { status: 'PENDING' }, { limit: 2 });
    const secondPage = await listInviteRecordsPage(
      client,
      { status: 'PENDING' },
      { limit: 2, cursor: firstPage.nextCursor },
    );

    expect(firstPage.invites.map((invite) => invite.id)).toEqual(['invite_c', 'invite_b']);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(secondPage.invites.map((invite) => invite.id)).toEqual(['invite_a']);
    expect(secondPage.nextCursor).toBeNull();
    expect(client.invites.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        AND: [
          { status: 'PENDING' },
          {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: 'invite_b' } },
              { createdAt: null },
            ],
          },
        ],
      },
    }));
  });

  it('uses one scoped bounded delete that preserves pending team reconciliation', async () => {
    let capturedQuery: { sql: string; values: unknown[] } | null = null;
    const client = {
      $executeRaw: jest.fn().mockImplementation(async (query) => {
        capturedQuery = query;
        return 2;
      }),
    };
    const now = new Date('2026-07-13T00:00:00.000Z');

    const deleted = await pruneExpiredTerminalInvites({
      client,
      scope: {
        userId: 'user_1',
        delegatedChildUserIds: ['child_1'],
        type: 'TEAM',
      },
      now,
    });

    expect(TERMINAL_INVITE_RETENTION_DAYS).toBe(90);
    expect(deleted).toBe(2);
    const sql = capturedQuery?.sql ?? '';
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('LIMIT');
    expect(sql.indexOf('NOT EXISTS')).toBeLessThan(sql.indexOf('LIMIT'));
    expect(capturedQuery?.values).toEqual(expect.arrayContaining([
      'user_1',
      'child_1',
      'TEAM',
      250,
    ]));
  });

  it('cannot let a full protected sync batch starve later deletable rows', async () => {
    let capturedQuery: { sql: string; values: unknown[] } | null = null;
    const client = {
      $executeRaw: jest.fn().mockImplementation(async (query) => {
        capturedQuery = query;
        return 1;
      }),
    };

    const deleted = await pruneExpiredTerminalInvites({
      client,
      scope: { teamId: 'team_1', type: 'TEAM' },
      now: new Date('2026-07-13T00:00:00.000Z'),
    });

    expect(deleted).toBe(1);
    const sql = capturedQuery?.sql ?? '';
    expect(sql).toMatch(/NOT EXISTS[\s\S]*LIMIT/);
    expect(sql).not.toContain('NOT IN');
  });

  it('fails closed when raw atomic cleanup is unavailable', async () => {
    const deleted = await pruneExpiredTerminalInvites({
      client: {},
      scope: { userId: 'user_1' },
      now: new Date('2026-07-13T00:00:00.000Z'),
    });

    expect(deleted).toBe(0);
  });
});
