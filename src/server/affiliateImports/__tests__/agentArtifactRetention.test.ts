import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  compactTerminalLog,
  planFileRetention,
  pruneSessionFiles,
} from '../agentArtifactRetention';

describe('affiliate agent artifact retention', () => {
  test('keeps the newest session and removes old files until the byte limit is met', () => {
    const nowMs = Date.parse('2026-08-04T20:00:00.000Z');
    const plan = planFileRetention({
      files: [
        { path: '/sessions/old.jsonl', bytes: 400, modifiedAtMs: nowMs - 20_000 },
        { path: '/sessions/middle.jsonl', bytes: 300, modifiedAtMs: nowMs - 10_000 },
        { path: '/sessions/current.jsonl', bytes: 200, modifiedAtMs: nowMs - 100 },
      ],
      nowMs,
      maxAgeMs: 15_000,
      minimumRemovalAgeMs: 5_000,
      maxBytes: 500,
      preserveNewest: 1,
    });
    expect(plan.remove.map((file) => file.path)).toEqual(['/sessions/old.jsonl']);
    expect(plan.keep.map((file) => file.path)).toEqual([
      '/sessions/middle.jsonl',
      '/sessions/current.jsonl',
    ]);
    expect(plan.totalBytesBefore).toBe(900);
    expect(plan.totalBytesAfter).toBe(500);
    expect(plan.overLimitBytes).toBe(0);
  });

  test('does not remove recent files even when they exceed the byte limit', () => {
    const nowMs = 20_000;
    const plan = planFileRetention({
      files: [
        { path: '/sessions/recent-a.jsonl', bytes: 400, modifiedAtMs: 19_000 },
        { path: '/sessions/recent-b.jsonl', bytes: 400, modifiedAtMs: 19_500 },
      ],
      nowMs,
      maxAgeMs: 50_000,
      minimumRemovalAgeMs: 5_000,
      maxBytes: 500,
    });
    expect(plan.remove).toEqual([]);
    expect(plan.overLimitBytes).toBe(300);
  });

  test('prunes session files and compacts a terminal log to its newest bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-retention-test-'));
    try {
      const sessions = path.join(root, 'sessions');
      await fs.mkdir(sessions);
      const oldPath = path.join(sessions, 'old.jsonl');
      const currentPath = path.join(sessions, 'current.jsonl');
      await fs.writeFile(oldPath, Buffer.alloc(12, 1));
      await fs.writeFile(currentPath, Buffer.alloc(8, 2));
      await fs.utimes(oldPath, new Date(1_000), new Date(1_000));
      await fs.utimes(currentPath, new Date(9_000), new Date(9_000));

      const plan = await pruneSessionFiles({
        root: sessions,
        maxBytes: 8,
        maxAgeMs: 5_000,
        minimumRemovalAgeMs: 2_000,
        preserveNewest: 1,
        nowMs: 10_000,
      });
      expect(plan.remove.map((file) => file.path)).toEqual([oldPath]);
      await expect(fs.stat(oldPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.stat(currentPath)).resolves.toBeDefined();

      const logPath = path.join(root, 'container-terminal.log');
      await fs.writeFile(logPath, Buffer.from('0123456789'));
      const result = await compactTerminalLog(logPath, 4);
      expect(result).toMatchObject({ bytesBefore: 10, bytesAfter: 4, compacted: true });
      await expect(fs.readFile(logPath, 'utf8')).resolves.toBe('6789');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
