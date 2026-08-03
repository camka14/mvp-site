/** @jest-environment node */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CodexAffiliateIngestionResult } from '../codexIngestionResult';
import {
  inspectAffiliateDisposableReviewScrapes,
  inspectAffiliateProducerPackage,
  materializeAffiliateProducerCommit,
  normalizeAffiliateProducerPath,
  preserveAffiliateDisposableDatabaseUrl,
  resolveAffiliateDisposableDatabaseUrl,
  resolveAffiliateProducerRepositoryRoot,
} from '../producerPackageEvidence';

const HASH = 'a'.repeat(64);

const result = (commit: string): CodexAffiliateIngestionResult => ({
  schemaVersion: 1,
  jobId: 'job-1',
  intakeId: 'intake-1',
  sourceKey: 'source-1',
  workerId: 'producer-1',
  status: 'REVIEW_REQUIRED',
  branch: 'codex/affiliate-ingestion-live',
  commit,
  generatedPaths: [
    'scripts/setup-example-affiliate-source.ts',
    'src/server/affiliateImports/example.ts',
  ],
  logoDisposition: 'OFFICIAL_ASSET',
  candidateCount: 2,
  reviewScrapes: [
    { runId: 'run-1', candidateCount: 2, normalizedCandidateSha256: HASH, passed: true },
    { runId: 'run-2', candidateCount: 2, normalizedCandidateSha256: HASH, passed: true },
  ],
  validation: {
    testsPassed: true,
    diffCheckPassed: true,
    duplicateSafe: true,
    warnings: [],
  },
  errorMessage: null,
});

const createRepository = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'affiliate-producer-test-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/server/affiliateImports'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/setup-example-affiliate-source.ts'), 'export const version = 1;\n');
  fs.writeFileSync(path.join(root, 'src/server/affiliateImports/example.ts'), 'export const example = true;\n');
  execFileSync('git', ['init', '-b', 'codex/affiliate-ingestion-live'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['add', 'scripts', 'src'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'affiliate: add example'], { cwd: root });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return { root, commit, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
};

describe('affiliate producer package evidence', () => {
  it('preserves the disposable database URL before the live URL replaces DATABASE_URL', () => {
    const environment: Record<string, string | undefined> = {
      DATABASE_URL: 'postgresql://disposable/affiliate_codex',
    };
    expect(preserveAffiliateDisposableDatabaseUrl(environment))
      .toBe('postgresql://disposable/affiliate_codex');
    environment.DATABASE_URL = 'postgresql://live/bracketiq';
    expect(resolveAffiliateDisposableDatabaseUrl(environment))
      .toBe('postgresql://disposable/affiliate_codex');
  });

  it('selects the allowlisted producer repository for the result worker', () => {
    const first = createRepository();
    const second = createRepository();
    try {
      const environment = {
        AFFILIATE_PRODUCER_REPOSITORY_ROOTS: JSON.stringify({
          'producer-1': first.root,
          'producer-2': second.root,
        }),
      };
      expect(resolveAffiliateProducerRepositoryRoot('producer-2', environment)).toBe(second.root);
      expect(() => resolveAffiliateProducerRepositoryRoot('producer-3', environment))
        .toThrow('not configured for worker producer-3');
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it('retains the singular producer root as a backward-compatible fallback', () => {
    const repository = createRepository();
    try {
      expect(resolveAffiliateProducerRepositoryRoot('producer-1', {
        AFFILIATE_PRODUCER_REPOSITORY_ROOT: repository.root,
      })).toBe(repository.root);
    } finally {
      repository.cleanup();
    }
  });

  it('verifies generated files in the exact commit and materializes that commit after HEAD advances', () => {
    const repository = createRepository();
    try {
      const evidence = inspectAffiliateProducerPackage({
        repositoryRoot: repository.root,
        result: result(repository.commit),
      });
      expect(evidence.setupScript).toBe('scripts/setup-example-affiliate-source.ts');
      expect(Object.keys(evidence.fileSha256)).toHaveLength(2);

      fs.writeFileSync(
        path.join(repository.root, 'scripts/setup-example-affiliate-source.ts'),
        'export const version = 2;\n',
      );
      execFileSync('git', ['add', 'scripts/setup-example-affiliate-source.ts'], { cwd: repository.root });
      execFileSync('git', ['commit', '-m', 'advance producer'], { cwd: repository.root });

      const snapshot = materializeAffiliateProducerCommit({
        repositoryRoot: repository.root,
        commit: repository.commit,
        nodeModulesRoot: repository.root,
      });
      try {
        expect(fs.readFileSync(
          path.join(snapshot.repositoryRoot, evidence.setupScript),
          'utf8',
        )).toContain('version = 1');
        expect(fs.lstatSync(path.join(snapshot.repositoryRoot, 'node_modules')).isSymbolicLink()).toBe(true);
      } finally {
        snapshot.cleanup();
      }
    } finally {
      repository.cleanup();
    }
  });

  it('rejects escaping or uncommitted generated paths', () => {
    expect(() => normalizeAffiliateProducerPath('../outside.ts')).toThrow('escapes');
    const repository = createRepository();
    try {
      expect(() => inspectAffiliateProducerPackage({
        repositoryRoot: repository.root,
        result: {
          ...result(repository.commit),
          generatedPaths: [...result(repository.commit).generatedPaths, 'missing.ts'],
        },
      })).toThrow('not part of producer commit');
    } finally {
      repository.cleanup();
    }
  });

  it('verifies both duplicate-safe runs in the disposable database', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [
          { id: 'run-1', sourceId: 'source-db', mappingId: 'mapping-db', status: 'SUCCEEDED', candidateCount: 2, itemCount: 2 },
          { id: 'run-2', sourceId: 'source-db', mappingId: 'mapping-db', status: 'SUCCEEDED', candidateCount: 2, itemCount: 2 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] });
    await expect(inspectAffiliateDisposableReviewScrapes({
      queryable: { query },
      result: result('b'.repeat(40)),
    })).resolves.toEqual(expect.objectContaining({
      databaseRole: 'DISPOSABLE_VALIDATION',
      sourceId: 'source-db',
      currentCandidateCount: 2,
      producerHashesStable: true,
    }));
  });

  it('fails when a claimed run is absent or has the wrong candidate count', async () => {
    const absent = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await expect(inspectAffiliateDisposableReviewScrapes({
      queryable: absent,
      result: result('b'.repeat(40)),
    })).rejects.toThrow('0 of 2');

    const wrongCount = { query: jest.fn().mockResolvedValue({ rows: [
      { id: 'run-1', sourceId: 'source-db', mappingId: 'mapping-db', status: 'SUCCEEDED', candidateCount: 1, itemCount: 1 },
      { id: 'run-2', sourceId: 'source-db', mappingId: 'mapping-db', status: 'SUCCEEDED', candidateCount: 1, itemCount: 1 },
    ] }) };
    await expect(inspectAffiliateDisposableReviewScrapes({
      queryable: wrongCount,
      result: result('b'.repeat(40)),
    })).rejects.toThrow('expected 2');
  });
});
