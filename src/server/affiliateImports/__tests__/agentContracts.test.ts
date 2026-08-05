/** @jest-environment node */

import {
  affiliateMappingReviewSchema,
  affiliateMappingTrainingExampleSchema,
  affiliateMappingWorkerResultSchema,
  affiliateSourceDraftSchema,
  assertOpenWeightModelEligible,
  openWeightModelEligibilityIssues,
  openWeightModelManifestSchema,
} from '../agentContracts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

const evidence = (supports: string[] = ['title', 'officialActionUrl']) => [{
  artifactKind: 'PAGE_MARKDOWN',
  artifactSha256: HASH_A,
  pageUrl: 'https://rivercity.example/events',
  supports,
}];

const candidate = {
  listingKind: 'EVENT' as const,
  title: 'River City Summer League',
  officialActionUrl: 'https://rivercity.example/register',
  sourceUrl: 'https://rivercity.example/events',
  sportName: 'Grass Soccer',
  tags: ['League'],
  venueName: 'River City Sports Complex',
  address: '100 Main Street',
  city: 'Portland',
  startsAt: null,
  dateDisplayMode: 'NO_FIXED_DATE' as const,
  dateDisplayText: 'Registration open',
  divisions: ['Adult'],
};

const genericMapping = {
  kind: 'EVENT' as const,
  listUrl: 'https://rivercity.example/events',
  itemSelector: '.event-card',
  fields: {
    title: { selector: '.title' },
    officialActionUrl: {
      selector: 'a.register',
      mode: 'attribute' as const,
      attribute: 'href',
      transform: 'absoluteUrl' as const,
    },
  },
};

const allowedDraft = {
  schemaVersion: 1 as const,
  intakeId: 'intake_1',
  sourceKey: 'river-city-soccer',
  runId: 'run_1',
  policyDisposition: 'ALLOWED' as const,
  implementationMode: 'GENERIC_MAPPING' as const,
  listingKind: 'EVENT' as const,
  evidence: evidence(),
  organization: {
    name: 'River City Sports Club',
    website: 'https://rivercity.example',
    description: 'Local sports organization.',
    city: 'Portland',
    address: '100 Main Street',
  },
  mapping: genericMapping,
  expectedCandidates: [candidate],
  logo: {
    disposition: 'OFFICIAL_ASSET' as const,
    artifactSha256: HASH_B,
    sourceUrl: 'https://rivercity.example/logo.png',
  },
  warnings: [],
  unresolvedQuestions: [],
};

const blockedDraft = {
  ...allowedDraft,
  policyDisposition: 'BLOCKED' as const,
  implementationMode: 'BLOCKED' as const,
  listingKind: null,
  mapping: null,
  expectedCandidates: [],
  logo: {
    disposition: 'MISSING' as const,
    artifactSha256: null,
    sourceUrl: null,
  },
};

const modelManifest = {
  schemaVersion: 1 as const,
  upstreamRepository: 'openai/gpt-oss-20b',
  upstreamRevision: '0123456789abcdef',
  modelFamily: 'gpt-oss',
  weightArtifacts: [{ filename: 'model.safetensors', sha256: HASH_A }],
  tokenizerRevision: '0123456789abcdef',
  promptTemplateRevision: 'prompt-v1',
  license: {
    spdxId: 'Apache-2.0',
    textSha256: HASH_B,
    notices: ['Preserve the Apache 2.0 license.'],
    commercialUseApproved: true,
    modificationApproved: true,
    derivativeDeploymentApproved: true,
  },
  runtimeSourceRepository: 'ggml-org/llama.cpp',
  runtimeRevision: 'abcdef0123456789',
  trainingSourceRepository: 'huggingface/peft',
  trainingStackRevision: 'abcdef0123456789',
  quantization: {
    format: 'MXFP4',
    sourceCheckpointSha256: HASH_A,
    artifactSha256: HASH_C,
  },
  offlineColdStartVerifiedAt: '2026-07-29T18:58:00.000Z',
  requiresVendorApi: false as const,
};

describe('affiliate mapping agent contracts', () => {
  it('accepts an evidence-backed generic mapping', () => {
    expect(affiliateSourceDraftSchema.parse(allowedDraft)).toEqual({
      ...allowedDraft,
      mapping: {
        ...allowedDraft.mapping,
        fields: {
          ...allowedDraft.mapping.fields,
          title: { selector: '.title', mode: 'text' },
        },
      },
    });
  });

  it('accepts manual, blocked, insufficient-evidence, and custom-extractor drafts', () => {
    const manual = {
      ...allowedDraft,
      implementationMode: 'MANUAL_CANDIDATES',
      mapping: {
        ...genericMapping,
        itemSelector: 'body',
        manualCandidates: [{
          title: candidate.title,
          officialActionUrl: candidate.officialActionUrl,
          sourceUrl: candidate.sourceUrl,
          sportName: candidate.sportName,
          dateDisplayMode: candidate.dateDisplayMode,
          dateDisplayText: candidate.dateDisplayText,
        }],
      },
    };
    const insufficient = {
      ...blockedDraft,
      policyDisposition: 'NEEDS_REVIEW',
      implementationMode: 'INSUFFICIENT_EVIDENCE',
    };
    const custom = {
      ...allowedDraft,
      implementationMode: 'CUSTOM_EXTRACTOR_REQUIRED',
      mapping: null,
      expectedCandidates: [],
    };

    expect(affiliateSourceDraftSchema.parse(manual).implementationMode).toBe('MANUAL_CANDIDATES');
    expect(affiliateSourceDraftSchema.parse(blockedDraft).implementationMode).toBe('BLOCKED');
    expect(affiliateSourceDraftSchema.parse(insufficient).implementationMode).toBe('INSUFFICIENT_EVIDENCE');
    expect(affiliateSourceDraftSchema.parse(custom).implementationMode).toBe('CUSTOM_EXTRACTOR_REQUIRED');
  });

  it('rejects executable output for a blocked source', () => {
    const result = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      policyDisposition: 'BLOCKED',
      implementationMode: 'BLOCKED',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'mapping')).toBe(true);
  });

  it('rejects generic or composite sport labels in executable agent output', () => {
    const generic = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      expectedCandidates: [{ ...candidate, sportName: 'Volleyball' }],
    });
    const composite = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      expectedCandidates: [{ ...candidate, sportName: 'Baseball & Fastpitch Softball' }],
    });
    expect(generic.success).toBe(false);
    expect(composite.success).toBe(false);
    expect(generic.error?.issues.some((issue) => issue.message.includes('human review'))).toBe(true);
  });

  it('rejects an internal BracketIQ action URL', () => {
    const result = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      expectedCandidates: [{
        ...candidate,
        officialActionUrl: 'https://bracket-iq.com/events/internal/join',
      }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('officialActionUrl'))).toBe(true);
  });

  it('rejects an invented scheduled date without cited evidence', () => {
    const result = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      expectedCandidates: [{
        ...candidate,
        startsAt: '2026-09-01T18:00:00.000Z',
        dateDisplayMode: 'SCHEDULED',
        dateDisplayText: null,
      }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes('cited intake artifact'))).toBe(true);
  });

  it('accepts a scheduled date when the exact field is evidence-backed', () => {
    const result = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      evidence: evidence(['title', 'officialActionUrl', 'expectedCandidates.0.startsAt']),
      expectedCandidates: [{
        ...candidate,
        startsAt: '2026-09-01T18:00:00.000Z',
        dateDisplayMode: 'SCHEDULED',
        dateDisplayText: null,
      }],
    });
    expect(result.success).toBe(true);
  });

  it('does not allow a generated-logo disposition', () => {
    const result = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      logo: {
        disposition: 'GENERATED',
        artifactSha256: HASH_B,
        sourceUrl: 'https://rivercity.example/logo.png',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a mapping whose kind differs from the draft', () => {
    const result = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      listingKind: 'CLUB',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'mapping.kind')).toBe(true);
  });

  it('rejects TEAM output and executable drafts without an allowed listing kind', () => {
    const teamResult = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      listingKind: null,
      mapping: {
        ...genericMapping,
        kind: 'TEAM',
      },
    });
    expect(teamResult.success).toBe(false);
    expect(teamResult.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: ['listingKind'],
        message: expect.stringContaining('EVENT, RENTAL, or CLUB'),
      }),
      expect.objectContaining({
        path: ['mapping', 'kind'],
        message: expect.stringContaining('cannot create TEAM mappings'),
      }),
    ]));

    const missingKindResult = affiliateSourceDraftSchema.safeParse({
      ...allowedDraft,
      listingKind: null,
    });
    expect(missingKindResult.success).toBe(false);
    expect(missingKindResult.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['listingKind'] }),
    ]));
  });

  it('requires open-weight permissions and an offline cold start for promotion', () => {
    expect(openWeightModelManifestSchema.parse(modelManifest)).toEqual(modelManifest);
    expect(assertOpenWeightModelEligible(modelManifest, {
      requireOfflineColdStart: true,
    })).toEqual(modelManifest);

    const restricted = {
      ...modelManifest,
      license: {
        ...modelManifest.license,
        derivativeDeploymentApproved: false,
      },
      offlineColdStartVerifiedAt: null,
    };
    expect(openWeightModelEligibilityIssues(restricted, {
      requireOfflineColdStart: true,
    })).toEqual([
      'Derivative checkpoint deployment is not approved.',
      'Offline cold start has not been verified.',
    ]);
    expect(() => assertOpenWeightModelEligible(restricted, {
      requireOfflineColdStart: true,
    })).toThrow('Open-weight model is ineligible');
  });

  it('validates worker, reviewer, and human-approved training envelopes', () => {
    const workerResult = {
      schemaVersion: 1,
      jobId: 'job_1',
      intakeId: 'intake_1',
      status: 'DRAFT_READY',
      workerId: 'worker_1',
      model: {
        family: 'gpt-oss',
        upstreamRepository: 'openai/gpt-oss-20b',
        upstreamRevision: '0123456789abcdef',
        artifactSha256: HASH_A,
        adapterRevision: null,
        promptTemplateRevision: 'prompt-v1',
      },
      modelManifestSha256: HASH_B,
      promptContractVersion: 1,
      evidenceRunId: 'run_1',
      evidenceArtifactSha256s: [HASH_A],
      draft: allowedDraft,
      draftSha256: HASH_C,
      generatedFiles: [],
      validation: {
        schemaPassed: true,
        testsPassed: true,
        scrapePassed: true,
        warnings: [],
      },
      timingsMs: { total: 1200 },
      errorMessage: null,
    };
    expect(affiliateMappingWorkerResultSchema.parse(workerResult).status).toBe('DRAFT_READY');

    const review = {
      schemaVersion: 1,
      jobId: 'job_1',
      workerResultSha256: HASH_A,
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
      reviewedAt: '2026-07-29T18:58:00.000Z',
    };
    expect(affiliateMappingReviewSchema.parse(review).outcome).toBe('APPROVE_RECOMMENDATION');

    const example = {
      schemaVersion: 1,
      exampleId: 'example_1',
      evidenceLabel: 'FAITHFUL',
      input: {
        intakeSourceKey: 'river-city-soccer',
        runId: 'run_1',
        artifacts: [{ kind: 'PAGE_MARKDOWN', sha256: HASH_A }],
        contextContractVersion: 1,
      },
      output: {
        draftHash: HASH_A,
        approvedMappingHash: HASH_B,
        approvedCandidateFixtureHash: HASH_C,
      },
      correction: null,
      split: 'train',
      registrableDomain: 'rivercity.example',
      platformFamily: null,
      humanApproval: {
        approvedByUserId: 'user_1',
        approvedAt: '2026-07-29T18:58:00.000Z',
      },
    };
    expect(affiliateMappingTrainingExampleSchema.parse(example).evidenceLabel).toBe('FAITHFUL');
  });

  it('keeps unapproved or stale examples out of the train split', () => {
    const result = affiliateMappingTrainingExampleSchema.safeParse({
      schemaVersion: 1,
      exampleId: 'example_legacy',
      evidenceLabel: 'LEGACY_PARTIAL',
      input: {
        intakeSourceKey: 'legacy-source',
        runId: 'legacy-run',
        artifacts: [{ kind: 'PAGE_HTML', sha256: HASH_A }],
        contextContractVersion: 1,
      },
      output: null,
      correction: null,
      split: 'train',
      registrableDomain: 'legacy.example',
      platformFamily: null,
      humanApproval: null,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'split')).toBe(true);
  });
});
