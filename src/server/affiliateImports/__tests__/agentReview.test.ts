/** @jest-environment node */

import {
  buildAffiliateReviewerInput,
  createAffiliateMappingTeachingSignal,
  FixtureAffiliateMappingReviewer,
  redactAffiliateReviewerPayload,
  reviewAffiliateMappingWorkerResult,
} from '../agentReview';
import {
  affiliateMappingWorkerResultSchema,
  affiliateSourceDraftSchema,
  stableAgentArtifactSha256,
} from '../agentContracts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

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

const workerResult = {
  schemaVersion: 1,
  jobId: 'job_1',
  intakeId: 'intake_1',
  status: 'DRAFT_READY',
  workerId: 'worker_1',
  model: {
    family: 'fixture',
    upstreamRepository: 'bracketiq/fixture',
    upstreamRevision: 'v1',
    artifactSha256: HASH_A,
    adapterRevision: null,
    promptTemplateRevision: 'prompt-v1',
  },
  modelManifestSha256: HASH_B,
  promptContractVersion: 1,
  evidenceRunId: 'run_1',
  evidenceArtifactSha256s: [HASH_A],
  draft,
  draftSha256: HASH_C,
  generatedFiles: [],
  validation: {
    schemaPassed: true,
    testsPassed: true,
    scrapePassed: true,
    warnings: [],
  },
  timingsMs: { total: 100 },
  errorMessage: null,
};

const reviewFor = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  jobId: 'job_1',
  workerResultSha256: stableAgentArtifactSha256(
    affiliateMappingWorkerResultSchema.parse(workerResult),
  ),
  reviewer: {
    provider: 'codex',
    model: 'sol',
    configurationSha256: HASH_B,
  },
  outcome: 'APPROVE_RECOMMENDATION',
  issues: [],
  correctedDraft: null,
  suggestedPatch: null,
  testAdditions: [],
  confidence: 0.95,
  trainingEligibility: 'ELIGIBLE_AFTER_HUMAN_APPROVAL',
  reviewedAt: '2026-07-29T19:45:00.000Z',
  ...overrides,
});

describe('affiliate mapping independent review', () => {
  it('redacts secrets and direct contact data before review', () => {
    expect(redactAffiliateReviewerPayload({
      authorization: 'Bearer secret-token',
      text: (
        'Contact owner@example.com or 503-555-0100. '
        + 'https://objects.example/file?X-Amz-Signature=secret'
      ),
    })).toEqual({
      authorization: '[REDACTED]',
      text: (
        'Contact [REDACTED_EMAIL] or [REDACTED_PHONE]. '
        + 'https://objects.example/file?X-Amz-Signature=[REDACTED]'
      ),
    });
  });

  it('accepts a hash-bound recommendation without granting approval authority', async () => {
    const reviewerInput = buildAffiliateReviewerInput({
      workerResult,
      scopedDiff: 'diff --git a/source b/source',
      validationTranscripts: [{ name: 'jest', passed: true, output: 'PASS' }],
      evidenceExcerpts: [{
        artifactSha256: HASH_A,
        artifactKind: 'PAGE_HTML',
        pageUrl: 'https://rivercity.example/events',
        content: '<p>owner@example.com</p>',
      }],
      normalizedCandidateSamples: [{ title: 'River City Summer League' }],
    });
    expect(reviewerInput.authorityNotice).toContain('recommendation only');
    expect(reviewerInput.evidenceExcerpts[0].content).toContain('[REDACTED_EMAIL]');

    const review = await reviewAffiliateMappingWorkerResult({
      reviewer: new FixtureAffiliateMappingReviewer(reviewFor()),
      reviewerInput,
    });
    expect(review.outcome).toBe('APPROVE_RECOMMENDATION');
  });

  it('rejects mismatched review identity and premature approval recommendations', async () => {
    const reviewerInput = buildAffiliateReviewerInput({
      workerResult,
      scopedDiff: '',
      validationTranscripts: [],
      evidenceExcerpts: [],
      normalizedCandidateSamples: [],
    });
    await expect(reviewAffiliateMappingWorkerResult({
      reviewer: new FixtureAffiliateMappingReviewer(reviewFor({ jobId: 'job_other' })),
      reviewerInput,
    })).rejects.toThrow('job id does not match');
    await expect(reviewAffiliateMappingWorkerResult({
      reviewer: new FixtureAffiliateMappingReviewer(reviewFor({
        workerResultSha256: HASH_C,
      })),
      reviewerInput,
    })).rejects.toThrow('hash does not match');

    const incompleteInput = buildAffiliateReviewerInput({
      workerResult: {
        ...workerResult,
        validation: { ...workerResult.validation, scrapePassed: false },
      },
      scopedDiff: '',
      validationTranscripts: [],
      evidenceExcerpts: [],
      normalizedCandidateSamples: [],
    });
    const incompleteHash = stableAgentArtifactSha256(incompleteInput.workerResult);
    await expect(reviewAffiliateMappingWorkerResult({
      reviewer: new FixtureAffiliateMappingReviewer(reviewFor({
        workerResultSha256: incompleteHash,
      })),
      reviewerInput: incompleteInput,
    })).rejects.toThrow('before schema, tests, and review scrape pass');
  });

  it('creates teaching signals only from explicit human disposition', () => {
    const review = reviewFor();
    expect(createAffiliateMappingTeachingSignal({
      workerResult,
      review,
      disposition: 'APPROVE_WORKER',
      approvedByUserId: 'human_user_1',
      approvedAt: new Date('2026-07-29T20:00:00.000Z'),
    })).toEqual(expect.objectContaining({
      jobId: 'job_1',
      disposition: 'APPROVE_WORKER',
      approvedDraftSha256: stableAgentArtifactSha256(
        affiliateSourceDraftSchema.parse(draft),
      ),
      eligibleForDatasetReview: true,
      rejectionReason: null,
    }));
    expect(() => createAffiliateMappingTeachingSignal({
      workerResult,
      review,
      disposition: 'REJECT',
      approvedByUserId: 'human_user_1',
      approvedAt: new Date('2026-07-29T20:00:00.000Z'),
    })).toThrow('require a reason');
  });
});
