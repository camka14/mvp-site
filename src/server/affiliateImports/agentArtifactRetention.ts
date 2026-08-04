import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MEBIBYTE = 1024 * 1024;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export type RetentionFile = {
  path: string;
  bytes: number;
  modifiedAtMs: number;
};

export type FileRetentionPlan = {
  remove: RetentionFile[];
  keep: RetentionFile[];
  totalBytesBefore: number;
  totalBytesAfter: number;
  overLimitBytes: number;
};

export const planFileRetention = (input: {
  files: RetentionFile[];
  nowMs: number;
  maxAgeMs: number;
  minimumRemovalAgeMs: number;
  maxBytes: number;
  preserveNewest?: number;
}): FileRetentionPlan => {
  const files = [...input.files].sort((left, right) => (
    left.modifiedAtMs - right.modifiedAtMs || left.path.localeCompare(right.path)
  ));
  const preserved = new Set(
    files.slice(-Math.max(0, input.preserveNewest ?? 1)).map((file) => file.path),
  );
  const removed = new Set<string>();
  for (const file of files) {
    if (
      !preserved.has(file.path)
      && input.nowMs - file.modifiedAtMs >= input.maxAgeMs
    ) {
      removed.add(file.path);
    }
  }
  let keptBytes = files
    .filter((file) => !removed.has(file.path))
    .reduce((total, file) => total + file.bytes, 0);
  for (const file of files) {
    if (keptBytes <= input.maxBytes) break;
    if (
      removed.has(file.path)
      || preserved.has(file.path)
      || input.nowMs - file.modifiedAtMs < input.minimumRemovalAgeMs
    ) continue;
    removed.add(file.path);
    keptBytes -= file.bytes;
  }
  const remove = files.filter((file) => removed.has(file.path));
  const keep = files.filter((file) => !removed.has(file.path));
  const totalBytesBefore = files.reduce((total, file) => total + file.bytes, 0);
  const totalBytesAfter = keep.reduce((total, file) => total + file.bytes, 0);
  return {
    remove,
    keep,
    totalBytesBefore,
    totalBytesAfter,
    overLimitBytes: Math.max(0, totalBytesAfter - input.maxBytes),
  };
};

const listRegularFiles = async (root: string): Promise<RetentionFile[]> => {
  const result: RetentionFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) {
        const stat = await fs.stat(entryPath);
        result.push({ path: entryPath, bytes: stat.size, modifiedAtMs: stat.mtimeMs });
      }
    }
  };
  try {
    await visit(root);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return result;
};

const removeEmptyDirectories = async (root: string): Promise<void> => {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await removeEmptyDirectories(path.join(root, entry.name));
  }
  if ((await fs.readdir(root)).length === 0) await fs.rmdir(root).catch(() => undefined);
};

export const pruneSessionFiles = async (input: {
  root: string;
  maxBytes: number;
  maxAgeMs: number;
  minimumRemovalAgeMs: number;
  preserveNewest?: number;
  nowMs?: number;
}): Promise<FileRetentionPlan> => {
  const files = await listRegularFiles(input.root);
  const plan = planFileRetention({
    files,
    nowMs: input.nowMs ?? Date.now(),
    maxAgeMs: input.maxAgeMs,
    minimumRemovalAgeMs: input.minimumRemovalAgeMs,
    maxBytes: input.maxBytes,
    preserveNewest: input.preserveNewest,
  });
  for (const file of plan.remove) await fs.rm(file.path, { force: true });
  await removeEmptyDirectories(input.root);
  return plan;
};

export const compactTerminalLog = async (
  filePath: string,
  maxBytes: number,
): Promise<{ path: string; bytesBefore: number; bytesAfter: number; compacted: boolean }> => {
  let handle;
  try {
    handle = await fs.open(filePath, 'r+');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { path: filePath, bytesBefore: 0, bytesAfter: 0, compacted: false };
    }
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= maxBytes) {
      return {
        path: filePath,
        bytesBefore: stat.size,
        bytesAfter: stat.size,
        compacted: false,
      };
    }
    const retainedBytes = Math.max(0, Math.floor(maxBytes));
    const buffer = Buffer.alloc(retainedBytes);
    await handle.read(buffer, 0, retainedBytes, stat.size - retainedBytes);
    await handle.truncate(0);
    await handle.write(buffer, 0, buffer.length, 0);
    await handle.sync();
    return {
      path: filePath,
      bytesBefore: stat.size,
      bytesAfter: retainedBytes,
      compacted: true,
    };
  } finally {
    await handle.close();
  }
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export type AffiliateAgentArtifactRetentionResult = {
  lockAcquired: boolean;
  sessions?: FileRetentionPlan;
  terminalLogs?: Awaited<ReturnType<typeof compactTerminalLog>>[];
};

export const summarizeAffiliateAgentArtifactRetention = (
  result: AffiliateAgentArtifactRetentionResult,
) => ({
  lockAcquired: result.lockAcquired,
  sessions: result.sessions ? {
    filesRemoved: result.sessions.remove.length,
    bytesRemoved: result.sessions.totalBytesBefore - result.sessions.totalBytesAfter,
    bytesRemaining: result.sessions.totalBytesAfter,
    overLimitBytes: result.sessions.overLimitBytes,
  } : null,
  terminalLogs: result.terminalLogs?.filter((log) => log.bytesBefore > 0) ?? [],
});

export const runAffiliateAgentArtifactRetention = async (input: {
  repositoryRoot: string;
  codexHome?: string;
  nowMs?: number;
}): Promise<AffiliateAgentArtifactRetentionResult> => {
  const codexHome = path.resolve(input.codexHome ?? path.join(os.homedir(), '.codex'));
  const lockPath = path.join(codexHome, '.affiliate-artifact-retention.lock');
  await fs.mkdir(codexHome, { recursive: true });
  let lock;
  try {
    lock = await fs.open(lockPath, 'wx');
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error;
    const stat = await fs.stat(lockPath).catch(() => null);
    if (stat && (input.nowMs ?? Date.now()) - stat.mtimeMs > 10 * 60 * 1_000) {
      await fs.rm(lockPath, { force: true });
      return runAffiliateAgentArtifactRetention(input);
    }
    return { lockAcquired: false };
  }
  try {
    const sessionMaxBytes = positiveInteger(
      process.env.AFFILIATE_CODEX_SESSION_MAX_BYTES,
      512 * MEBIBYTE,
    );
    const sessionMaxAgeDays = positiveInteger(
      process.env.AFFILIATE_CODEX_SESSION_MAX_AGE_DAYS,
      14,
    );
    const sessionMinimumAgeHours = positiveInteger(
      process.env.AFFILIATE_CODEX_SESSION_MINIMUM_AGE_HOURS,
      2,
    );
    const terminalLogMaxBytes = positiveInteger(
      process.env.AFFILIATE_AGENT_TERMINAL_LOG_MAX_BYTES,
      32 * MEBIBYTE,
    );
    const sessions = await pruneSessionFiles({
      root: path.join(codexHome, 'sessions'),
      maxBytes: sessionMaxBytes,
      maxAgeMs: sessionMaxAgeDays * DAY_MS,
      minimumRemovalAgeMs: sessionMinimumAgeHours * HOUR_MS,
      preserveNewest: 1,
      nowMs: input.nowMs,
    });
    const terminalLogs = await Promise.all([
      'affiliate-codex-ingestion',
      'affiliate-codex-approvals',
      'affiliate-codex-coverage',
    ].map((directory) => compactTerminalLog(
      path.join(input.repositoryRoot, 'output', directory, 'container-terminal.log'),
      terminalLogMaxBytes,
    )));
    return { lockAcquired: true, sessions, terminalLogs };
  } finally {
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
};
