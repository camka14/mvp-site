/** @jest-environment node */

import {
  assignHistoricalDomainSplits,
  buildAffiliateHistoricalDatasetInventory,
  matchHistoricalSourceToIntake,
  planAffiliateSourceEvidenceBackfill,
  type HistoricalDatasetInput,
  type HistoricalIntakeRow,
  type HistoricalSourceRow,
} from '../agentDataset';

const HASH_HTML = 'a'.repeat(64);
const HASH_ROBOTS = 'b'.repeat(64);

const source = (overrides: Partial<HistoricalSourceRow> = {}): HistoricalSourceRow => ({
  id: 'source_1',
  sourceKey: 'river-city',
  name: 'River City Sports Club',
  listUrl: 'https://rivercity.example/events',
  baseUrl: 'https://rivercity.example',
  targetKind: 'EVENT',
  status: 'ACTIVE',
  activeMappingId: 'mapping_1',
  organizationId: 'org_1',
  organizationWebsite: 'https://rivercity.example',
  metadata: {
    sourceEvidence: {
      intakeSourceKey: 'river-city',
      runId: 'run_1',
    },
  },
  ...overrides,
});

const intake = (overrides: Partial<HistoricalIntakeRow> = {}): HistoricalIntakeRow => ({
  id: 'intake_1',
  sourceKey: 'river-city',
  baseUrl: 'https://rivercity.example',
  status: 'PROMOTED',
  complianceStatus: 'ALLOWED',
  affiliateSourceId: 'source_1',
  lastRunId: 'run_1',
  pages: [{
    url: 'https://rivercity.example/events',
    canonicalUrl: 'https://rivercity.example/events',
    role: 'LISTING',
    robotsStatus: 'ALLOWED',
  }],
  runs: [{
    id: 'run_1',
    status: 'SUCCEEDED',
    provider: 'FIRECRAWL',
    finishedAt: '2026-07-20T00:00:00.000Z',
  }],
  artifacts: [
    { runId: 'run_1', kind: 'PAGE_HTML', contentHash: HASH_HTML },
    { runId: 'run_1', kind: 'ROBOTS', contentHash: HASH_ROBOTS },
  ],
  ...overrides,
});

const mapping = {
  id: 'mapping_1',
  sourceId: 'source_1',
  version: 1,
  isActive: true,
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
  validatedAt: '2026-07-21T00:00:00.000Z',
};

const faithfulInput = (): HistoricalDatasetInput => ({
  capturedAt: new Date('2026-07-29T19:30:00.000Z'),
  environment: 'local',
  repositoryCommit: 'abc123',
  sources: [source()],
  mappings: [mapping],
  intakes: [intake()],
  candidates: [{
    sourceId: 'source_1',
    status: 'PUBLISHED',
    listingKind: 'EVENT',
    dedupeKey: 'river-summer',
    title: 'River City Summer League',
    officialActionUrl: 'https://rivercity.example/register',
    sourceUrl: 'https://rivercity.example/events',
    startsAt: '2026-09-01T18:00:00.000Z',
    city: 'Portland',
    venueName: 'River City Sports Complex',
    address: '100 Main Street',
  }],
  mappingJobs: [{
    intakeId: 'intake_1',
    status: 'APPROVED',
    finishedAt: '2026-07-22T00:00:00.000Z',
    resultSummary: {
      humanApproval: {
        approvedByUserId: 'user_1',
        approvedAt: '2026-07-22T00:00:00.000Z',
      },
    },
  }],
  setupScripts: [{
    path: 'scripts/setup-river-city-affiliate-source.ts',
    sourceText: 'const SOURCE_KEY = "river-city";',
  }],
});

describe('affiliate mapping historical dataset', () => {
  it('matches evidence in precedence order and refuses shared-host domain guesses', () => {
    expect(matchHistoricalSourceToIntake(source(), [intake()])).toEqual(expect.objectContaining({
      status: 'MATCHED',
      method: 'AFFILIATE_SOURCE_ID',
      intakeId: 'intake_1',
    }));

    const sharedSource = source({
      id: 'shared_source',
      sourceKey: 'unmatched-wix-club',
      listUrl: 'https://club-one.wixsite.com/events',
      baseUrl: 'https://club-one.wixsite.com',
      organizationWebsite: null,
    });
    const sharedIntake = intake({
      id: 'shared_intake',
      sourceKey: 'different-wix-key',
      baseUrl: 'https://club-two.wixsite.com',
      affiliateSourceId: null,
      pages: [],
    });
    expect(matchHistoricalSourceToIntake(sharedSource, [sharedIntake])).toEqual(expect.objectContaining({
      status: 'UNMATCHED',
      method: 'NONE',
      reason: expect.stringContaining('shared platform'),
    }));
  });

  it('assigns each domain to exactly one deterministic split with a held-out floor', () => {
    const domains = Array.from({ length: 50 }, (_, index) => `club-${index}.example`);
    const first = assignHistoricalDomainSplits(domains);
    const second = assignHistoricalDomainSplits([...domains].reverse());
    expect(first).toEqual(second);
    expect(Array.from(first.values()).filter((split) => split === 'test')).toHaveLength(30);
    expect(Array.from(first.values()).filter((split) => split === 'validation')).toHaveLength(7);
    expect(Array.from(first.values()).filter((split) => split === 'train')).toHaveLength(13);
  });

  it('promotes only fully linked, human-approved evidence to FAITHFUL', () => {
    const result = buildAffiliateHistoricalDatasetInventory(faithfulInput());
    expect(result.summary).toEqual({
      total: 1,
      byEvidenceLabel: { FAITHFUL: 1 },
      bySplit: { test: 1 },
      trainEligible: 0,
    });
    expect(result.rows[0]).toEqual(expect.objectContaining({
      evidenceLabel: 'FAITHFUL',
      artifactKinds: ['PAGE_HTML', 'ROBOTS'],
      mappingId: 'mapping_1',
      intakeSourceKey: 'river-city',
      setupScriptPath: 'scripts/setup-river-city-affiliate-source.ts',
      trainingExample: expect.objectContaining({
        evidenceLabel: 'FAITHFUL',
        humanApproval: {
          approvedByUserId: 'user_1',
          approvedAt: '2026-07-22T00:00:00.000Z',
        },
      }),
    }));
  });

  it('keeps validated mappings without reproducible evidence as LEGACY_PARTIAL', () => {
    const input = faithfulInput();
    input.intakes = [];
    input.mappingJobs = [];
    const result = buildAffiliateHistoricalDatasetInventory(input);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      evidenceLabel: 'LEGACY_PARTIAL',
      trainEligible: false,
      trainingExample: null,
      labelReasons: expect.arrayContaining([
        'No unambiguous intake match exists.',
        'Source metadata does not cite the matched intake and run.',
      ]),
    }));
  });

  it('labels blocked and replaced sources without treating them as gold mappings', () => {
    const input = faithfulInput();
    input.sources = [
      source({ id: 'blocked', sourceKey: 'blocked', status: 'POLICY_BLOCKED' }),
      source({ id: 'stale', sourceKey: 'stale', status: 'REPLACED' }),
    ];
    input.mappings = [];
    input.intakes = [];
    input.candidates = [];
    input.mappingJobs = [];
    input.setupScripts = [];
    const result = buildAffiliateHistoricalDatasetInventory(input);
    expect(result.rows.map((row) => [row.sourceKey, row.evidenceLabel])).toEqual([
      ['blocked', 'BLOCKED'],
      ['stale', 'STALE'],
    ]);
    expect(result.trainingExamples).toHaveLength(0);
  });

  it('plans intake pages without fetching them and leaves ambiguous matches for review', () => {
    const sources = [
      source({ id: 'source_new', sourceKey: 'new-source', activeMappingId: 'mapping_new' }),
      source({ id: 'source_blocked', sourceKey: 'blocked-source', status: 'POLICY_BLOCKED' }),
    ];
    const mappings = [{
      ...mapping,
      id: 'mapping_new',
      sourceId: 'source_new',
      mapping: {
        ...mapping.mapping,
        manualCandidates: [{
          title: 'Program',
          officialActionUrl: 'https://rivercity.example/register',
          sourceUrl: 'https://rivercity.example/program',
        }],
      },
    }];
    const plan = planAffiliateSourceEvidenceBackfill(sources, [], mappings);
    expect(plan[0]).toEqual(expect.objectContaining({
      sourceKey: 'blocked-source',
      action: 'RECORD_BLOCKED',
      proposedPages: [],
    }));
    expect(plan[1]).toEqual(expect.objectContaining({
      sourceKey: 'new-source',
      action: 'PROPOSE_INTAKE',
      proposedPages: expect.arrayContaining([
        { url: 'https://rivercity.example/', role: 'HOME' },
        { url: 'https://rivercity.example/events', role: 'LISTING' },
        { url: 'https://rivercity.example/program', role: 'DETAIL' },
        { url: 'https://rivercity.example/register', role: 'REGISTRATION' },
      ]),
    }));
  });
});
