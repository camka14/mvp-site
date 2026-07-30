/** @jest-environment node */

import {
  buildAffiliateMappingSftRelease,
} from '../agentTrainingRelease';
import { stableAgentArtifactSha256 } from '../agentContracts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const draft = {
  schemaVersion: 1 as const,
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  runId: 'run_1',
  policyDisposition: 'BLOCKED' as const,
  implementationMode: 'BLOCKED' as const,
  listingKind: null,
  evidence: [{
    artifactKind: 'ROBOTS',
    artifactSha256: HASH_A,
    pageUrl: 'https://river-city.test/robots.txt',
    supports: ['policyDisposition'],
  }],
  organization: {
    name: null,
    website: null,
    description: null,
    city: null,
    address: null,
  },
  mapping: null,
  expectedCandidates: [],
  logo: {
    disposition: 'MISSING' as const,
    artifactSha256: null,
    sourceUrl: null,
  },
  warnings: [],
  unresolvedQuestions: [],
};

const envelope = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  trainingExample: {
    schemaVersion: 1,
    exampleId: 'example_1',
    evidenceLabel: 'BLOCKED',
    input: {
      intakeSourceKey: 'river-city',
      runId: 'run_1',
      artifacts: [{ kind: 'ROBOTS', sha256: HASH_A }],
      contextContractVersion: 1,
    },
    output: {
      draftHash: stableAgentArtifactSha256(draft),
      approvedMappingHash: null,
      approvedCandidateFixtureHash: null,
    },
    correction: null,
    split: 'train',
    registrableDomain: 'river-city.test',
    platformFamily: null,
    humanApproval: {
      approvedByUserId: 'admin_1',
      approvedAt: '2026-07-29T20:00:00.000Z',
    },
  },
  context: {
    jobId: 'job_1',
    intakeId: 'intake_1',
    sourceKey: 'river-city',
    runId: 'run_1',
    policyDisposition: 'BLOCKED',
    targetKindHints: [],
    artifacts: [{
      kind: 'ROBOTS',
      sha256: HASH_A,
      pageUrl: 'https://river-city.test/robots.txt',
    }],
    evidenceExcerpts: [{
      kind: 'ROBOTS',
      sha256: HASH_A,
      pageUrl: 'https://river-city.test/robots.txt',
      content: 'User-agent: *\nDisallow: /',
      truncated: false,
    }],
    instructionsRevision: 'affiliate-source-mapping-contract-v1',
  },
  approvedDraft: draft,
  ...overrides,
});

describe('affiliate mapping SFT release', () => {
  it('builds deterministic chat rows only from approved evidence-bound envelopes', () => {
    const release = buildAffiliateMappingSftRelease([envelope()], {
      releaseId: 'release-v1',
      createdAt: new Date('2026-07-29T20:10:00.000Z'),
    });

    expect(release.manifest.counts).toEqual({
      train: 1,
      validation: 0,
      test: 0,
      total: 1,
    });
    expect(release.rows[0].messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
    ]);
    expect(JSON.parse(release.rows[0].messages[2].content)).toEqual(draft);
  });

  it('rejects partial evidence, unapproved rows, and mismatched draft hashes', () => {
    const partial = envelope();
    partial.trainingExample.evidenceLabel = 'LEGACY_PARTIAL';
    partial.trainingExample.split = 'validation';
    expect(() => buildAffiliateMappingSftRelease([partial], {
      releaseId: 'bad',
      createdAt: new Date(),
    })).toThrow('only FAITHFUL and BLOCKED');

    const unapproved = envelope();
    unapproved.trainingExample.humanApproval = null as never;
    expect(() => buildAffiliateMappingSftRelease([unapproved], {
      releaseId: 'bad',
      createdAt: new Date(),
    })).toThrow('human approval');

    const mismatched = envelope();
    mismatched.trainingExample.output.draftHash = HASH_B;
    expect(() => buildAffiliateMappingSftRelease([mismatched], {
      releaseId: 'bad',
      createdAt: new Date(),
    })).toThrow('approved draft hash');
  });

  it('rejects secrets and domain leakage across dataset splits', () => {
    const withSecret = envelope();
    withSecret.context.evidenceExcerpts[0].content = 'DATABASE_URL=postgresql://secret';
    expect(() => buildAffiliateMappingSftRelease([withSecret], {
      releaseId: 'bad',
      createdAt: new Date(),
    })).toThrow('forbidden database URL');

    const validation = envelope();
    validation.trainingExample.exampleId = 'example_2';
    validation.trainingExample.split = 'validation';
    expect(() => buildAffiliateMappingSftRelease([envelope(), validation], {
      releaseId: 'bad',
      createdAt: new Date(),
    })).toThrow('leaks across');
  });

  it('rejects legacy TEAM target hints before release construction', () => {
    const withTeamHint = envelope();
    withTeamHint.context.targetKindHints = ['TEAM'] as never;
    expect(() => buildAffiliateMappingSftRelease([withTeamHint], {
      releaseId: 'bad',
      createdAt: new Date(),
    })).toThrow();
  });
});
