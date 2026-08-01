import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CodexAffiliateIngestionResult } from './codexIngestionResult';

export type AffiliateProducerPackageEvidence = {
  repositoryRoot: string;
  commit: string;
  commitSubject: string;
  commitAuthorDate: string;
  containingBranches: string[];
  changedPaths: string[];
  generatedPaths: string[];
  additionalChangedPaths: string[];
  fileSha256: Record<string, string>;
  setupScript: string;
};

export type AffiliateDisposableReviewScrapeRow = {
  id: string;
  sourceId: string;
  mappingId: string | null;
  status: string;
  candidateCount: number;
  itemCount: number;
};

export type AffiliateDisposableReviewEvidence = {
  databaseRole: 'DISPOSABLE_VALIDATION';
  sourceId: string;
  mappingId: string | null;
  claimedCandidateCount: number;
  currentCandidateCount: number;
  producerHashesStable: boolean;
  runs: AffiliateDisposableReviewScrapeRow[];
};

export type AffiliateReviewEvidenceQueryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

const git = (repositoryRoot: string, args: string[], encoding: BufferEncoding | 'buffer' = 'utf8') => (
  execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: encoding === 'buffer' ? 'buffer' : encoding,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  })
);

export const resolveAffiliateProducerRepositoryRoot = (
  configuredRoot = process.env.AFFILIATE_PRODUCER_REPOSITORY_ROOT,
): string => {
  const value = configuredRoot?.trim();
  if (!value) throw new Error('AFFILIATE_PRODUCER_REPOSITORY_ROOT is required.');
  const root = path.resolve(value);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Affiliate producer repository was not found: ${root}`);
  }
  return root;
};

export const normalizeAffiliateProducerPath = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    !normalized
    || path.posix.isAbsolute(normalized)
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
  ) {
    throw new Error(`Producer package path escapes the repository: ${value}`);
  }
  return normalized;
};

export const inspectAffiliateProducerPackage = (input: {
  repositoryRoot: string;
  result: CodexAffiliateIngestionResult;
}): AffiliateProducerPackageEvidence => {
  if (input.result.status !== 'REVIEW_REQUIRED' || !input.result.commit) {
    throw new Error('Producer package inspection requires a review-required result with a commit.');
  }
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const resolvedCommit = String(git(repositoryRoot, [
    'rev-parse',
    '--verify',
    `${input.result.commit}^{commit}`,
  ])).trim();
  if (resolvedCommit !== input.result.commit) {
    throw new Error(`Producer commit resolved to an unexpected object: ${resolvedCommit}`);
  }
  const generatedPaths = Array.from(new Set(
    input.result.generatedPaths.map(normalizeAffiliateProducerPath),
  )).sort();
  const changedPaths = String(git(repositoryRoot, [
    'diff-tree',
    '--root',
    '--no-commit-id',
    '--name-only',
    '-r',
    input.result.commit,
  ])).split('\n').map((value) => value.trim()).filter(Boolean).sort();
  const changedPathSet = new Set(changedPaths);
  const fileSha256: Record<string, string> = {};
  for (const generatedPath of generatedPaths) {
    if (!changedPathSet.has(generatedPath)) {
      throw new Error(
        `Generated path is not part of producer commit ${input.result.commit}: ${generatedPath}`,
      );
    }
    const file = git(
      repositoryRoot,
      ['show', `${input.result.commit}:${generatedPath}`],
      'buffer',
    ) as Buffer;
    fileSha256[generatedPath] = createHash('sha256').update(file).digest('hex');
  }
  const setupPaths = generatedPaths.filter((generatedPath) => (
    /^scripts\/setup-[a-z0-9-]+-affiliate-source\.ts$/.test(generatedPath)
  ));
  if (setupPaths.length !== 1) {
    throw new Error(
      `Producer package must contain exactly one setup script; found ${setupPaths.length}.`,
    );
  }
  const containingBranches = String(git(repositoryRoot, [
    'branch',
    '--format=%(refname:short)',
    '--contains',
    input.result.commit,
  ])).split('\n').map((value) => value.trim()).filter(Boolean).sort();
  return {
    repositoryRoot,
    commit: input.result.commit,
    commitSubject: String(git(repositoryRoot, [
      'show', '-s', '--format=%s', input.result.commit,
    ])).trim(),
    commitAuthorDate: String(git(repositoryRoot, [
      'show', '-s', '--format=%aI', input.result.commit,
    ])).trim(),
    containingBranches,
    changedPaths,
    generatedPaths,
    additionalChangedPaths: changedPaths.filter((value) => !generatedPaths.includes(value)),
    fileSha256,
    setupScript: setupPaths[0],
  };
};

export const materializeAffiliateProducerCommit = (input: {
  repositoryRoot: string;
  commit: string;
  nodeModulesRoot: string;
}): { repositoryRoot: string; cleanup: () => void } => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'affiliate-producer-'));
  const repositoryRoot = path.join(parent, 'repository');
  const archivePath = path.join(parent, 'commit.tar');
  fs.mkdirSync(repositoryRoot);
  try {
    execFileSync('git', [
      '-C',
      path.resolve(input.repositoryRoot),
      'archive',
      '--format=tar',
      `--output=${archivePath}`,
      input.commit,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    execFileSync('tar', ['-xf', archivePath, '-C', repositoryRoot], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const nodeModules = path.resolve(input.nodeModulesRoot, 'node_modules');
    if (!fs.statSync(nodeModules, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Reviewer node_modules was not found: ${nodeModules}`);
    }
    fs.symlinkSync(nodeModules, path.join(repositoryRoot, 'node_modules'), 'dir');
    fs.rmSync(archivePath, { force: true });
    return {
      repositoryRoot,
      cleanup: () => fs.rmSync(parent, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(parent, { recursive: true, force: true });
    throw error;
  }
};

export const inspectAffiliateDisposableReviewScrapes = async (input: {
  queryable: AffiliateReviewEvidenceQueryable;
  result: CodexAffiliateIngestionResult;
}): Promise<AffiliateDisposableReviewEvidence> => {
  if (input.result.status !== 'REVIEW_REQUIRED' || input.result.reviewScrapes.length !== 2) {
    throw new Error('Disposable scrape inspection requires two review scrapes.');
  }
  const runIds = input.result.reviewScrapes.map((scrape) => scrape.runId);
  const runResult = await input.queryable.query<AffiliateDisposableReviewScrapeRow>(
    `SELECT id, "sourceId", "mappingId", status,
            "candidateCount", "itemCount"
       FROM "AffiliateScrapeRuns"
      WHERE id = ANY($1::text[])
      ORDER BY "startedAt" ASC, id ASC`,
    [runIds],
  );
  if (runResult.rows.length !== 2) {
    throw new Error(
      `Disposable validation database contains ${runResult.rows.length} of 2 claimed review scrapes.`,
    );
  }
  const rowsById = new Map(runResult.rows.map((row) => [row.id, row]));
  const runs = runIds.map((runId) => {
    const row = rowsById.get(runId);
    if (!row) throw new Error(`Disposable review scrape was not found: ${runId}`);
    return row;
  });
  const sourceIds = new Set(runs.map((row) => row.sourceId));
  const mappingIds = new Set(runs.map((row) => row.mappingId));
  if (sourceIds.size !== 1 || mappingIds.size !== 1) {
    throw new Error('Disposable review scrapes do not use one stable source and mapping.');
  }
  for (const row of runs) {
    if (row.status !== 'SUCCEEDED') {
      throw new Error(`Disposable review scrape ${row.id} has status ${row.status}.`);
    }
    if (Number(row.candidateCount) !== input.result.candidateCount) {
      throw new Error(
        `Disposable review scrape ${row.id} has ${row.candidateCount} candidates; expected ${input.result.candidateCount}.`,
      );
    }
  }
  const sourceId = runs[0].sourceId;
  const candidateResult = await input.queryable.query<{ count: string | number }>(
    `SELECT count(*)::text AS count
       FROM "AffiliateImportCandidates"
      WHERE "sourceId" = $1`,
    [sourceId],
  );
  const currentCandidateCount = Number(candidateResult.rows[0]?.count ?? 0);
  if (currentCandidateCount !== input.result.candidateCount) {
    throw new Error(
      `Disposable source ${sourceId} has ${currentCandidateCount} current candidates; expected ${input.result.candidateCount}.`,
    );
  }
  return {
    databaseRole: 'DISPOSABLE_VALIDATION',
    sourceId,
    mappingId: runs[0].mappingId,
    claimedCandidateCount: input.result.candidateCount,
    currentCandidateCount,
    producerHashesStable: input.result.reviewScrapes[0].normalizedCandidateSha256
      === input.result.reviewScrapes[1].normalizedCandidateSha256,
    runs,
  };
};
