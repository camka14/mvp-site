/** @jest-environment node */

import {
  affiliateMappingGoldExampleSchema,
  buildAffiliateMappingGoldRelease,
  buildAffiliateMappingTrainingReadinessReport,
} from '../agentGoldDataset';

const HASH_HTML = 'a'.repeat(64);
const HASH_ROBOTS = 'b'.repeat(64);

const executableDraft = {
  schemaVersion: 1 as const,
  intakeId: 'intake_river',
  sourceKey: 'river-city',
  runId: 'run_river',
  policyDisposition: 'ALLOWED' as const,
  implementationMode: 'GENERIC_MAPPING' as const,
  listingKind: 'EVENT' as const,
  evidence: [{
    artifactKind: 'PAGE_HTML',
    artifactSha256: HASH_HTML,
    pageUrl: 'https://rivercity.example/events',
    supports: ['title', 'officialActionUrl', 'expectedCandidates.0.startsAt'],
  }],
  organization: {
    name: 'River City Sports Club',
    website: 'https://rivercity.example',
    description: 'A local sports organization.',
    city: 'Portland',
    address: '100 Main Street',
  },
  mapping: {
    kind: 'EVENT' as const,
    listUrl: 'https://rivercity.example/events',
    itemSelector: '.event',
    fields: {
      title: { selector: '.title' },
      officialActionUrl: {
        selector: 'a',
        mode: 'attribute' as const,
        attribute: 'href',
      },
    },
  },
  expectedCandidates: [{
    listingKind: 'EVENT' as const,
    title: 'River City Summer League',
    officialActionUrl: 'https://rivercity.example/register',
    sourceUrl: 'https://rivercity.example/events',
    sportName: 'Soccer',
    tags: ['League'],
    venueName: 'River City Sports Complex',
    address: '100 Main Street',
    city: 'Portland',
    startsAt: '2026-09-01T18:00:00.000Z',
    dateDisplayMode: 'SCHEDULED' as const,
    dateDisplayText: 'September 1',
    priceText: '$100',
    divisions: ['Adult'],
  }],
  logo: {
    disposition: 'OFFICIAL_ASSET' as const,
    artifactSha256: HASH_HTML,
    sourceUrl: 'https://rivercity.example/logo.png',
  },
  warnings: [],
  unresolvedQuestions: [],
};

const realExample = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  exampleId: 'river-event',
  split: 'test',
  registrableDomain: 'rivercity.example',
  platformFamily: null,
  target: {
    type: 'LISTING_KIND',
    listingKind: 'EVENT',
  },
  evidenceOrigin: 'REAL_CAPTURE',
  evidenceOriginDetails: {
    origin: 'REAL_CAPTURE',
    withheldEvidence: [],
  },
  includedInTraining: false,
  includedInRetrieval: false,
  context: {
    jobId: 'job_river',
    intakeId: 'intake_river',
    sourceKey: 'river-city',
    runId: 'run_river',
    policyDisposition: 'ALLOWED',
    targetKindHints: ['EVENT'],
    artifacts: [{
      kind: 'PAGE_HTML',
      sha256: HASH_HTML,
      pageUrl: 'https://rivercity.example/events',
      byteLength: 42,
    }],
    evidenceExcerpts: [{
      kind: 'PAGE_MARKDOWN',
      sha256: HASH_HTML,
      pageUrl: 'https://rivercity.example/events',
      content: 'River City Summer League starts September 1, 2026.',
      truncated: false,
    }],
    instructionsRevision: 'affiliate-source-mapping-contract-v1',
  },
  approvedDraft: executableDraft,
  expectedPersistedCandidates: executableDraft.expectedCandidates,
  fixturePages: [{
    url: 'https://rivercity.example/events',
    finalUrl: 'https://rivercity.example/events',
    statusCode: 200,
    file: 'fixtures/river-events.html',
    byteLength: 42,
    sha256: HASH_HTML,
  }],
  humanApproval: {
    approvalId: 'approval_river',
    approvedByUserId: 'admin_1',
    approvedAt: '2026-07-29T20:00:00.000Z',
  },
  ...overrides,
});

const blockedExample = (overrides: Record<string, unknown> = {}) => {
  const approvedDraft = {
    ...executableDraft,
    intakeId: 'intake_blocked',
    sourceKey: 'blocked-source',
    runId: 'run_blocked',
    policyDisposition: 'BLOCKED' as const,
    implementationMode: 'BLOCKED' as const,
    listingKind: null,
    evidence: [{
      artifactKind: 'ROBOTS',
      artifactSha256: HASH_ROBOTS,
      pageUrl: 'https://blocked.example/robots.txt',
      supports: ['policyDisposition'],
    }],
    mapping: null,
    expectedCandidates: [],
    logo: {
      disposition: 'MISSING' as const,
      artifactSha256: null,
      sourceUrl: null,
    },
  };
  return {
    schemaVersion: 1,
    exampleId: 'blocked-policy',
    split: 'train',
    registrableDomain: 'blocked.example',
    platformFamily: null,
    target: {
      type: 'REFUSAL',
      refusalClass: 'BLOCKED',
    },
    evidenceOrigin: 'REAL_CAPTURE',
    evidenceOriginDetails: {
      origin: 'REAL_CAPTURE',
      withheldEvidence: [],
    },
    includedInTraining: true,
    includedInRetrieval: true,
    context: {
      jobId: 'job_blocked',
      intakeId: 'intake_blocked',
      sourceKey: 'blocked-source',
      runId: 'run_blocked',
      policyDisposition: 'BLOCKED',
      targetKindHints: [],
      artifacts: [{
        kind: 'ROBOTS',
        sha256: HASH_ROBOTS,
        pageUrl: 'https://blocked.example/robots.txt',
      }],
      instructionsRevision: 'affiliate-source-mapping-contract-v1',
    },
    approvedDraft,
    expectedPersistedCandidates: [],
    fixturePages: [],
    humanApproval: {
      approvalId: 'approval_blocked',
      approvedByUserId: 'admin_1',
      approvedAt: '2026-07-29T20:00:00.000Z',
    },
    ...overrides,
  };
};

describe('affiliate mapping gold dataset contracts', () => {
  it('accepts real executable, blocked, derived-insufficiency, and invented-control examples', () => {
    expect(affiliateMappingGoldExampleSchema.parse(realExample())).toBeTruthy();
    expect(affiliateMappingGoldExampleSchema.parse(blockedExample())).toBeTruthy();

    const derived = blockedExample({
      exampleId: 'derived-insufficient',
      evidenceOrigin: 'DERIVED_EVIDENCE_ABLATION',
      evidenceOriginDetails: {
        origin: 'DERIVED_EVIDENCE_ABLATION',
        withheldEvidence: ['Registration detail page'],
      },
      approvedDraft: {
        ...blockedExample().approvedDraft,
        policyDisposition: 'NEEDS_REVIEW',
        implementationMode: 'INSUFFICIENT_EVIDENCE',
      },
      target: {
        type: 'REFUSAL',
        refusalClass: 'INSUFFICIENT_EVIDENCE',
      },
      context: {
        ...blockedExample().context,
        policyDisposition: 'NEEDS_REVIEW',
      },
    });
    expect(affiliateMappingGoldExampleSchema.parse(derived)).toBeTruthy();

    const invented = realExample({
      exampleId: 'invented-control',
      evidenceOrigin: 'INVENTED_CONTROL',
      evidenceOriginDetails: {
        origin: 'INVENTED_CONTROL',
        withheldEvidence: [],
      },
    });
    expect(affiliateMappingGoldExampleSchema.parse(invented)).toBeTruthy();
  });

  it('builds a stable release with split, target, mode, origin, and domain counts', () => {
    const options = {
      releaseId: 'gold-v1',
      createdAt: new Date('2026-07-29T21:00:00.000Z'),
      repositoryCommit: 'abc123',
    };
    const first = buildAffiliateMappingGoldRelease(
      [blockedExample(), realExample()],
      options,
    );
    const second = buildAffiliateMappingGoldRelease(
      [realExample(), blockedExample()],
      options,
    );
    expect(first).toEqual(second);
    expect(first.manifest.counts).toEqual(expect.objectContaining({
      split: { train: 1, test: 1 },
      target: { BLOCKED: 1, EVENT: 1 },
      implementationMode: { BLOCKED: 1, GENERIC_MAPPING: 1 },
      evidenceOrigin: { REAL_CAPTURE: 2 },
      total: 2,
    }));
  });

  it('rejects missing approval, unknown evidence, invented dates, and unsafe logos or URLs', () => {
    const noApproval = realExample();
    delete (noApproval as { humanApproval?: unknown }).humanApproval;
    expect(() => affiliateMappingGoldExampleSchema.parse(noApproval)).toThrow();

    const unknownEvidence = realExample({
      approvedDraft: {
        ...executableDraft,
        evidence: [{
          ...executableDraft.evidence[0],
          artifactSha256: HASH_ROBOTS,
        }],
      },
    });
    expect(() => affiliateMappingGoldExampleSchema.parse(unknownEvidence))
      .toThrow('outside the frozen context');

    const inventedDate = realExample({
      expectedPersistedCandidates: [{
        ...executableDraft.expectedCandidates[0],
        startsAt: '2026-07-01T18:00:00.000Z',
      }],
    });
    expect(() => affiliateMappingGoldExampleSchema.parse(inventedDate))
      .toThrow('future-dated');

    const internalUrl = realExample({
      expectedPersistedCandidates: [{
        ...executableDraft.expectedCandidates[0],
        officialActionUrl: 'https://bracket-iq.com/join',
      }],
    });
    expect(() => affiliateMappingGoldExampleSchema.parse(internalUrl))
      .toThrow('official external');

    const generatedLogo = realExample({
      approvedDraft: {
        ...executableDraft,
        logo: {
          disposition: 'GENERATED',
          artifactSha256: HASH_HTML,
          sourceUrl: 'https://rivercity.example/generated.png',
        },
      },
    });
    expect(() => affiliateMappingGoldExampleSchema.parse(generatedLogo)).toThrow();
  });

  it('rejects split leakage, duplicate ids, test retrieval, and forbidden secrets', () => {
    expect(() => buildAffiliateMappingGoldRelease([
      realExample(),
      realExample({
        exampleId: 'same-domain-train',
        split: 'train',
        includedInTraining: true,
      }),
    ], {
      releaseId: 'bad',
      createdAt: new Date(),
      repositoryCommit: 'abc123',
    })).toThrow('leaks across');

    expect(() => buildAffiliateMappingGoldRelease([
      realExample(),
      realExample(),
    ], {
      releaseId: 'bad',
      createdAt: new Date(),
      repositoryCommit: 'abc123',
    })).toThrow('Duplicate gold example id');

    expect(() => affiliateMappingGoldExampleSchema.parse(realExample({
      includedInRetrieval: true,
    }))).toThrow('Test examples cannot');

    const secret = realExample();
    secret.context.evidenceExcerpts[0].content = 'DATABASE_URL=postgresql://secret';
    expect(() => buildAffiliateMappingGoldRelease([secret], {
      releaseId: 'bad',
      createdAt: new Date(),
      repositoryCommit: 'abc123',
    })).toThrow('forbidden database URL');
  });

  it('never counts invented controls toward the meaningful training threshold', () => {
    const examples = Array.from({ length: 80 }, (_, index) => realExample({
      exampleId: `control-train-${index}`,
      split: 'train',
      registrableDomain: `control-${index}.example`,
      evidenceOrigin: 'INVENTED_CONTROL',
      evidenceOriginDetails: {
        origin: 'INVENTED_CONTROL',
        withheldEvidence: [],
      },
      includedInTraining: true,
    }));
    const release = buildAffiliateMappingGoldRelease(examples, {
      releaseId: 'controls-only',
      createdAt: new Date('2026-07-29T21:00:00.000Z'),
      repositoryCommit: 'abc123',
    });
    const report = buildAffiliateMappingTrainingReadinessReport({
      goldRelease: release,
      sftManifest: null,
      baseEvaluation: null,
      runtimeObservation: null,
    });
    expect(report.decision).toBe('DO_NOT_TRAIN');
    expect(report.realApprovedCounts.train).toBe(0);
    expect(report.blockingReasons).toContain('Fewer than 80 real approved training examples.');
  });
});
