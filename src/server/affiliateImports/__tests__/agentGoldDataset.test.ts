/** @jest-environment node */

import {
  affiliateMappingGoldFixtureManifest,
  affiliateMappingGoldExampleSchema,
  assertAffiliateMappingGoldReleaseIntegrity,
  buildAffiliateMappingGoldRelease,
  buildAffiliateMappingTrainingReadinessReport,
  renderAffiliateMappingGoldJsonLines,
} from '../agentGoldDataset';
import {
  assertAffiliateGoldCohortProposalIntegrity,
  planAffiliateGoldTestCohort,
  reviseAffiliateGoldCohortRequiredPage,
  type AffiliateGoldCohortCandidate,
} from '../agentGoldCohort';
import {
  assertLockedGoldCaptureCohort,
  goldCapturePageNeedsRobotsReview,
  pageHasCurrentGoldCaptureEvidence,
  planGoldCaptureBatches,
  resolveGoldCaptureMaxAttempts,
} from '../agentGoldCaptureCohort';

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
    expect(first.manifest.fixtureManifestFiles).toHaveLength(2);
    expect(first.manifest.fixtureManifestSha256s).toHaveLength(2);
    expect(
      renderAffiliateMappingGoldJsonLines(first.examples).trim().split('\n'),
    ).toHaveLength(2);
    expect(affiliateMappingGoldFixtureManifest(first.examples[0])).toEqual({
      schemaVersion: 1,
      exampleId: first.examples[0].exampleId,
      fixturePages: first.examples[0].fixturePages,
    });
  });

  it('rejects unsafe release paths and detects manifest tampering', () => {
    expect(() => buildAffiliateMappingGoldRelease([realExample()], {
      releaseId: '../escape',
      createdAt: new Date(),
      repositoryCommit: 'abc123',
    })).toThrow('Release id may contain only');

    const release = buildAffiliateMappingGoldRelease([realExample()], {
      releaseId: 'gold-v1',
      createdAt: new Date('2026-07-29T21:00:00.000Z'),
      repositoryCommit: 'abc123',
    });
    release.manifest.rowSha256s[0] = HASH_ROBOTS;
    expect(() => assertAffiliateMappingGoldReleaseIntegrity(release))
      .toThrow('row hashes do not match');
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

const cohortCandidate = (
  index: number,
  overrides: Partial<AffiliateGoldCohortCandidate> = {},
): AffiliateGoldCohortCandidate => {
  const targetKind = index < 2
    ? 'TEAM'
    : index < 8
      ? 'CLUB'
      : index < 15
        ? 'RENTAL'
        : 'EVENT';
  return {
    sourceId: `source_${index}`,
    sourceKey: `source-${index}`,
    sourceName: `Source ${index}`,
    sourceUrl: `https://source-${index}.example/list`,
    targetKind,
    sourceStatus: 'ACTIVE',
    registrableDomain: `source-${index}.example`,
    platformFamily: index % 9 === 0 ? 'FIXTURE_PLATFORM' : null,
    priorEvidenceLabel: index === 44 ? 'BLOCKED' : 'LEGACY_PARTIAL',
    mappingId: index === 44 ? null : `mapping_${index}`,
    mappingVersion: index === 44 ? null : 1,
    mappingMode: index === 44
      ? 'NONE'
      : index % 2 === 0
        ? 'SELECTOR'
        : 'MANUAL_CANDIDATES',
    mappingValidated: index !== 44,
    hasSetupScript: index % 3 !== 0,
    hasReviewedCandidateHistory: index % 4 !== 0,
    hasDetailPage: index >= 2 && index < 5,
    rendersJavascript: index >= 5 && index < 8,
    dateCoverage: index === 15
      ? 'EVERGREEN'
      : index === 16
        ? 'SCHEDULED'
        : targetKind === 'EVENT'
          ? 'UNKNOWN'
          : 'NOT_APPLICABLE',
    intakeMatchStatus: 'UNMATCHED',
    intakePlanAction: index === 44 ? 'RECORD_BLOCKED' : 'PROPOSE_INTAKE',
    requiredCapturePages: [{
      url: `https://source-${index}.example/list`,
      role: 'LISTING',
    }],
    ...overrides,
  };
};

describe('affiliate mapping gold cohort planning', () => {
  it('creates a newly hashed proposal when one approved capture URL is revised', () => {
    const proposal = planAffiliateGoldTestCohort({
      candidates: Array.from({ length: 45 }, (_, index) => cohortCandidate(index)),
      repositoryCommit: 'historical-commit',
    });
    const example = proposal.examples[0];
    const originalPage = example.requiredCapturePages[0];
    const originalUrl = new URL(originalPage.url);
    const replacementUrl = new URL(originalPage.url);
    replacementUrl.hostname = `www.${originalUrl.hostname}`;

    const revised = reviseAffiliateGoldCohortRequiredPage({
      proposal,
      sourceKey: example.sourceKey,
      fromUrl: originalUrl.toString(),
      toUrl: replacementUrl.toString(),
      reason: 'The canonical www endpoint has valid TLS while the apex endpoint does not.',
      repositoryCommit: 'revision-commit',
    });

    expect(revised.cohortId).not.toBe(proposal.cohortId);
    expect(revised.proposalSha256).not.toBe(proposal.proposalSha256);
    expect(revised.repositoryCommit).toBe('revision-commit');
    expect(revised.examples.find((candidate) => candidate.sourceKey === example.sourceKey))
      .toEqual(expect.objectContaining({
        requiredCapturePages: [{
          ...originalPage,
          url: replacementUrl.toString(),
        }],
        selectionReasons: expect.arrayContaining([
          'Cohort revision: The canonical www endpoint has valid TLS while the apex endpoint does not.',
        ]),
      }));
    expect(proposal.examples[0].requiredCapturePages[0].url).toBe(originalPage.url);
    expect(() => assertAffiliateGoldCohortProposalIntegrity(revised)).not.toThrow();
    expect(() => reviseAffiliateGoldCohortRequiredPage({
      proposal,
      sourceKey: example.sourceKey,
      fromUrl: originalUrl.toString(),
      toUrl: 'https://different.example/',
      reason: 'Unsafe cross-domain replacement.',
      repositoryCommit: 'revision-commit',
    })).toThrow('same registrable host');
  });

  it('requires a matching immutable lock before planning live capture batches', () => {
    const proposal = planAffiliateGoldTestCohort({
      candidates: Array.from({ length: 45 }, (_, index) => cohortCandidate(index)),
      repositoryCommit: 'historical-commit',
    });
    const lock = {
      schemaVersion: 1,
      cohortId: proposal.cohortId,
      proposalSha256: proposal.proposalSha256,
      repositoryCommit: proposal.repositoryCommit,
      approvedByUserId: 'admin-user-id',
      lockedAt: '2026-07-29T20:00:00.000Z',
      domainAssignments: proposal.lockedDomainAssignments,
      platformFamilies: proposal.lockedPlatformFamilies,
    };

    expect(assertLockedGoldCaptureCohort(proposal, lock)).toEqual({ proposal, lock });
    expect(() => assertLockedGoldCaptureCohort(proposal, {
      ...lock,
      proposalSha256: '0'.repeat(64),
    })).toThrow('lock does not match');
  });

  it('keeps live capture runs within the ten-page intake limit', () => {
    const pages = Array.from({ length: 23 }, (_, index) => ({
      url: `https://capture-${index}.example/page`,
      role: 'DETAIL',
    }));

    expect(planGoldCaptureBatches(pages).map((batch) => batch.length))
      .toEqual([10, 10, 3]);
  });

  it('uses three capture attempts by default and permits an explicit override', () => {
    expect(resolveGoldCaptureMaxAttempts()).toBe(3);
    expect(resolveGoldCaptureMaxAttempts('1')).toBe(1);
    expect(resolveGoldCaptureMaxAttempts('4')).toBe(4);
    expect(() => resolveGoldCaptureMaxAttempts('0')).toThrow(
      'Gold capture maximum attempts must be a positive integer.',
    );
    expect(() => resolveGoldCaptureMaxAttempts('2.5')).toThrow(
      'Gold capture maximum attempts must be a positive integer.',
    );
  });

  it('requires non-empty ScrapingDog content from a successful or partial run', () => {
    const page = {
      id: 'page_1',
      intakeId: 'intake_1',
      role: 'LISTING',
      robotsStatus: 'ALLOWED',
      robotsNotes: null,
    };
    const successfulRunIds = new Set(['run_current']);

    expect(pageHasCurrentGoldCaptureEvidence(page, [{
      pageId: page.id,
      runId: 'run_old',
      kind: 'PAGE_HTML',
      provider: 'FIRECRAWL',
      sizeBytes: 10_000,
      storageReady: true,
    }], new Set(['run_old']))).toBe(false);
    expect(pageHasCurrentGoldCaptureEvidence(page, [{
      pageId: page.id,
      runId: 'run_current',
      kind: 'PAGE_HTML',
      provider: 'SCRAPINGDOG',
      sizeBytes: 0,
      storageReady: true,
    }], successfulRunIds)).toBe(false);
    expect(pageHasCurrentGoldCaptureEvidence(page, [{
      pageId: page.id,
      runId: 'run_current',
      kind: 'PAGE_MARKDOWN',
      provider: 'SCRAPINGDOG',
      sizeBytes: 1_024,
      storageReady: true,
    }], successfulRunIds)).toBe(true);
  });

  it('accepts stored robots evidence for a disallowed page', () => {
    const page = {
      id: 'page_blocked',
      intakeId: 'intake_1',
      role: 'LISTING',
      robotsStatus: 'DISALLOWED',
      robotsNotes: 'Disallow: /private',
    };

    expect(pageHasCurrentGoldCaptureEvidence(page, [{
      pageId: page.id,
      runId: 'run_failed_after_policy_check',
      kind: 'ROBOTS',
      provider: 'DIRECT',
      sizeBytes: 24,
      storageReady: true,
    }], new Set())).toBe(true);
  });

  it('accepts explicit authentication evidence for a registration action', () => {
    const page = {
      id: 'page_registration',
      intakeId: 'intake_1',
      role: 'REGISTRATION',
      robotsStatus: 'ALLOWED',
      robotsNotes: null,
    };

    expect(pageHasCurrentGoldCaptureEvidence(page, [{
      pageId: page.id,
      runId: 'run_access',
      kind: 'PAGE_ACCESS_STATUS',
      provider: 'DIRECT',
      sizeBytes: 72,
      storageReady: true,
    }], new Set(['run_access']))).toBe(true);
  });

  it('rejects content whose backing object is not in the active storage provider', () => {
    const page = {
      id: 'page_missing_object',
      intakeId: 'intake_1',
      role: 'DETAIL',
      robotsStatus: 'ALLOWED',
      robotsNotes: null,
    };

    expect(pageHasCurrentGoldCaptureEvidence(page, [{
      pageId: page.id,
      runId: 'run_current',
      kind: 'PAGE_HTML',
      provider: 'SCRAPINGDOG',
      sizeBytes: 1_024,
      storageReady: false,
    }], new Set(['run_current']))).toBe(false);
  });

  it('flags certificate failures for policy review instead of repeated capture', () => {
    expect(goldCapturePageNeedsRobotsReview({
      id: 'page_tls',
      intakeId: 'intake_1',
      role: 'HOME',
      robotsStatus: 'UNCLEAR',
      robotsNotes: 'certificate has expired',
    })).toBe(true);
    expect(goldCapturePageNeedsRobotsReview({
      id: 'page_timeout',
      intakeId: 'intake_1',
      role: 'HOME',
      robotsStatus: 'UNCLEAR',
      robotsNotes: 'Source request timed out.',
    })).toBe(false);
  });

  it('verifies a saved proposal independently of the current repository commit', () => {
    const proposal = planAffiliateGoldTestCohort({
      candidates: Array.from({ length: 45 }, (_, index) => cohortCandidate(index)),
      repositoryCommit: 'historical-commit',
    });

    expect(() => assertAffiliateGoldCohortProposalIntegrity(
      JSON.parse(JSON.stringify(proposal)),
    )).not.toThrow();
  });

  it('rejects a saved proposal whose selected examples changed after hashing', () => {
    const proposal = planAffiliateGoldTestCohort({
      candidates: Array.from({ length: 45 }, (_, index) => cohortCandidate(index)),
      repositoryCommit: 'historical-commit',
    });
    const changedProposal = JSON.parse(JSON.stringify(proposal));
    changedProposal.examples[0].sourceKey = 'changed-after-approval';

    expect(() => assertAffiliateGoldCohortProposalIntegrity(changedProposal))
      .toThrow('Cohort proposal hash mismatch');
  });

  it('selects the same quota-complete 35-example test cohort regardless of input order', () => {
    const candidates = Array.from({ length: 45 }, (_, index) => cohortCandidate(index));
    const first = planAffiliateGoldTestCohort({
      candidates,
      repositoryCommit: 'abc123',
    });
    const second = planAffiliateGoldTestCohort({
      candidates: [...candidates].reverse(),
      repositoryCommit: 'abc123',
    });

    expect(first).toEqual(second);
    expect(first.readyToLock).toBe(true);
    expect(first.deficits).toEqual([]);
    expect(first.summary).toEqual(expect.objectContaining({
      exampleCount: 35,
      registrableDomainCount: 35,
      detailOrJavascriptCount: expect.any(Number),
      refusalOrInsufficiencyCount: 5,
      customExtractorReviewCount: 2,
      databaseWrites: 0,
      publicRequests: 0,
    }));
    expect(first.summary.targetKinds.CLUB).toBeGreaterThanOrEqual(5);
    expect(first.summary.targetKinds.RENTAL).toBeGreaterThanOrEqual(5);
    expect(first.summary.historicalMappingModes.SELECTOR).toBeGreaterThanOrEqual(12);
    expect(first.summary.historicalMappingModes.MANUAL_CANDIDATES).toBeGreaterThanOrEqual(8);
    expect(first.summary.detailOrJavascriptCount).toBeGreaterThanOrEqual(4);
  });

  it('uses one scarce TEAM domain for test and reserves the other outside the split', () => {
    const proposal = planAffiliateGoldTestCohort({
      candidates: Array.from({ length: 45 }, (_, index) => cohortCandidate(index)),
      repositoryCommit: 'abc123',
    });
    const selectedTeams = proposal.examples.filter((example) => example.targetKind === 'TEAM');
    expect(selectedTeams).toHaveLength(1);
    expect(proposal.reservedForLater).toHaveLength(1);
    expect(proposal.reservedForLater[0]).toEqual(expect.objectContaining({
      reason: expect.stringContaining('TEAM coverage has only two known domains'),
    }));
    expect(proposal.lockedDomainAssignments).not.toContainEqual({
      registrableDomain: proposal.reservedForLater[0].registrableDomain,
      split: 'test',
    });
    expect(proposal.lockedDomainAssignments).toContainEqual({
      registrableDomain: selectedTeams[0].registrableDomain,
      split: 'test',
    });
  });

  it('reports deficits instead of silently weakening a small inventory', () => {
    const proposal = planAffiliateGoldTestCohort({
      candidates: Array.from({ length: 12 }, (_, index) => cohortCandidate(index)),
      repositoryCommit: 'abc123',
    });
    expect(proposal.readyToLock).toBe(false);
    expect(proposal.deficits).toEqual(expect.arrayContaining([
      expect.stringContaining('test examples: required 35'),
      expect.stringContaining('registrable domains: required 30'),
    ]));
  });
});
