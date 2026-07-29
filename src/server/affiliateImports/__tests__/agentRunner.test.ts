/** @jest-environment node */

import fs from 'node:fs/promises';
import {
  runAffiliateMappingDraftJob,
} from '../agentRunner';
import { FixtureAffiliateMappingModelClient } from '../agentModelClient';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

const model = {
  family: 'fixture',
  upstreamRepository: 'bracketiq/fixture',
  upstreamRevision: 'fixture-v1',
  artifactSha256: HASH_C,
  adapterRevision: null,
  promptTemplateRevision: 'prompt-v1',
};

const draft = {
  schemaVersion: 1,
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  runId: 'run_1',
  policyDisposition: 'ALLOWED',
  implementationMode: 'GENERIC_MAPPING',
  listingKind: 'EVENT',
  evidence: [{
    artifactKind: 'PAGE_HTML',
    artifactSha256: HASH_A,
    pageUrl: 'https://rivercity.example/events',
    supports: ['title', 'officialActionUrl'],
  }],
  organization: {
    name: 'River City Sports Club',
    website: 'https://rivercity.example',
    description: 'Local sports organization.',
    city: 'Portland',
    address: '100 Main Street',
  },
  mapping: {
    kind: 'EVENT',
    listUrl: 'https://rivercity.example/events',
    itemSelector: '.event',
    fields: {
      title: { selector: '.title' },
      officialActionUrl: {
        selector: 'a',
        mode: 'attribute',
        attribute: 'href',
      },
    },
  },
  expectedCandidates: [{
    listingKind: 'EVENT',
    title: 'River City Summer League',
    officialActionUrl: 'https://rivercity.example/register',
    tags: ['League'],
    divisions: [],
  }],
  logo: {
    disposition: 'OFFICIAL_ASSET',
    artifactSha256: HASH_B,
    sourceUrl: 'https://rivercity.example/logo.png',
  },
  warnings: [],
  unresolvedQuestions: [],
};

const context = {
  jobId: 'job_1',
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  runId: 'run_1',
  policyDisposition: 'ALLOWED' as const,
  targetKindHints: ['EVENT' as const],
  artifacts: [{
    kind: 'PAGE_HTML',
    sha256: HASH_A,
    pageUrl: 'https://rivercity.example/events',
  }],
  instructionsRevision: 'v1',
};

describe('affiliate mapping isolated job runner', () => {
  it('renders a valid draft and records validation without publishing', async () => {
    const worktreeRoot = await fs.mkdtemp('/tmp/affiliate-agent-runner-');
    try {
      const result = await runAffiliateMappingDraftJob({
        context,
        workerId: 'worker_1',
        modelClient: new FixtureAffiliateMappingModelClient(model, new Map([
          ['job_1', draft],
        ])),
        modelManifestSha256: HASH_C,
        promptContractVersion: 1,
        worktreeRoot,
        validate: async ({ generatedPaths }) => ({
          testsPassed: generatedPaths.length === 4,
          scrapePassed: true,
          warnings: [],
        }),
      });
      expect(result).toEqual(expect.objectContaining({
        status: 'DRAFT_READY',
        jobId: 'job_1',
        intakeId: 'intake_1',
        generatedFiles: expect.arrayContaining([
          expect.objectContaining({
            path: 'scripts/setup-river-city-affiliate-source.ts',
          }),
        ]),
        validation: {
          schemaPassed: true,
          testsPassed: true,
          scrapePassed: true,
          warnings: [],
        },
      }));
      const setup = await fs.readFile(
        `${worktreeRoot}/scripts/setup-river-city-affiliate-source.ts`,
        'utf8',
      );
      expect(setup).toContain('autoScrapeEnabled: false');
      expect(setup).toContain('validatedAt: null');
    } finally {
      await fs.rm(worktreeRoot, { recursive: true, force: true });
    }
  });

  it('rejects identity, policy, and evidence outside the claimed context', async () => {
    const worktreeRoot = await fs.mkdtemp('/tmp/affiliate-agent-runner-');
    try {
      for (const unsafeDraft of [
        { ...draft, intakeId: 'different_intake' },
        { ...draft, policyDisposition: 'NEEDS_REVIEW', implementationMode: 'INSUFFICIENT_EVIDENCE', mapping: null, expectedCandidates: [] },
        { ...draft, evidence: [{ ...draft.evidence[0], artifactSha256: HASH_C }] },
      ]) {
        await expect(runAffiliateMappingDraftJob({
          context,
          workerId: 'worker_1',
          modelClient: new FixtureAffiliateMappingModelClient(model, new Map([
            ['job_1', unsafeDraft],
          ])),
          modelManifestSha256: HASH_C,
          promptContractVersion: 1,
          worktreeRoot,
        })).rejects.toThrow();
      }
    } finally {
      await fs.rm(worktreeRoot, { recursive: true, force: true });
    }
  });

  it('returns a refusal without writing files for a blocked job', async () => {
    const worktreeRoot = await fs.mkdtemp('/tmp/affiliate-agent-runner-');
    const blockedContext = {
      ...context,
      jobId: 'job_blocked',
      policyDisposition: 'BLOCKED' as const,
      artifacts: [{
        kind: 'ROBOTS',
        sha256: HASH_B,
        pageUrl: 'https://blocked.example/robots.txt',
      }],
    };
    const blockedDraft = {
      ...draft,
      policyDisposition: 'BLOCKED',
      implementationMode: 'BLOCKED',
      listingKind: null,
      evidence: [{
        artifactKind: 'ROBOTS',
        artifactSha256: HASH_B,
        pageUrl: 'https://blocked.example/robots.txt',
        supports: ['policyDisposition'],
      }],
      mapping: null,
      expectedCandidates: [],
      logo: {
        disposition: 'MISSING',
        artifactSha256: null,
        sourceUrl: null,
      },
    };
    try {
      const result = await runAffiliateMappingDraftJob({
        context: blockedContext,
        workerId: 'worker_1',
        modelClient: new FixtureAffiliateMappingModelClient(model, new Map([
          ['job_blocked', blockedDraft],
        ])),
        modelManifestSha256: HASH_C,
        promptContractVersion: 1,
        worktreeRoot,
        validate: async () => ({
          testsPassed: true,
          scrapePassed: true,
          warnings: [],
        }),
      });
      expect(result.status).toBe('REFUSED');
      expect(result.generatedFiles).toHaveLength(0);
      expect(await fs.readdir(worktreeRoot)).toHaveLength(0);
    } finally {
      await fs.rm(worktreeRoot, { recursive: true, force: true });
    }
  });
});
