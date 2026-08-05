/** @jest-environment node */

import {
  classifyLegacyAffiliateCoverageHumanReview,
  claimNextAffiliateCoverageJob,
  completeAffiliateCoverageJob,
  createAffiliateCoverageCampaign,
  reconcileAffiliateCoverageJobs,
  storeAffiliateManualBrowserEvidence,
  summarizeAffiliateCoverageQueue,
} from '@/server/affiliateImports/coverageAgentQueue';

const now = new Date('2026-08-03T16:30:00.000Z');

const database = (overrides: Record<string, any> = {}) => ({
  jobs: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  campaigns: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  discoveryRuns: { findMany: jest.fn().mockResolvedValue([]) },
  discoveryResults: { findMany: jest.fn().mockResolvedValue([]) },
  intakes: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
  pages: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  intakeRuns: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  artifacts: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  mappingJobs: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  policies: { findUnique: jest.fn() },
  sports: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  ...overrides,
});

describe('affiliate coverage agent queue', () => {
  it('classifies only identity conflicts as legacy human decisions', () => {
    expect(classifyLegacyAffiliateCoverageHumanReview({
      subjectType: 'MARKET_COVERAGE',
      result: { summary: 'The market still has unresolved leads.', reasonCodes: ['UNRESOLVED_LEADS'] },
    })).toEqual(expect.objectContaining({ status: 'WAITING_FOR_PIPELINE' }));
    expect(classifyLegacyAffiliateCoverageHumanReview({
      subjectType: 'FAILED_INTAKE_CAPTURE',
      result: { summary: 'The public page requires login credentials.', reasonCodes: [] },
    })).toEqual(expect.objectContaining({
      status: 'EXCLUDED',
      reasonCodes: ['LOGIN_REQUIRED'],
    }));
    expect(classifyLegacyAffiliateCoverageHumanReview({
      subjectType: 'FAILED_INTAKE_CAPTURE',
      attemptCount: 1,
      result: { summary: 'The TLS certificate failed during the public request.', reasonCodes: [] },
    })).toEqual(expect.objectContaining({
      status: 'RETRY_SCHEDULED',
      reasonCodes: ['TLS_ERROR'],
    }));
    expect(classifyLegacyAffiliateCoverageHumanReview({
      subjectType: 'FAILED_INTAKE_CAPTURE',
      attemptCount: 1,
      result: {
        summary: 'No explicit robots prohibition was found, but robots evidence remained unavailable.',
        reasonCodes: [],
      },
    })).toEqual(expect.objectContaining({
      status: 'RETRY_SCHEDULED',
      reasonCodes: ['ROBOTS_EVIDENCE_UNAVAILABLE'],
    }));
    expect(classifyLegacyAffiliateCoverageHumanReview({
      subjectType: 'FAILED_INTAKE_CAPTURE',
      attemptCount: 1,
      result: { summary: 'Readable HTML exceeded the artifact byte limit.', reasonCodes: [] },
    })).toEqual(expect.objectContaining({
      status: 'RETRY_SCHEDULED',
      reasonCodes: ['EVIDENCE_SIZE_LIMIT'],
    }));
    expect(classifyLegacyAffiliateCoverageHumanReview({
      subjectType: 'FAILED_INTAKE_CAPTURE',
      result: { summary: 'The page contains a conflicting organization identity.', reasonCodes: [] },
    })).toEqual(expect.objectContaining({
      status: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: ['CONFLICTING_SOURCE_IDENTITY'],
    }));
  });

  it('reconciles template markets and only the latest failed or useful partial capture once', async () => {
    const db = database();
    db.campaigns.findMany.mockResolvedValue([
      { id: 'market_1', name: 'Portland', region: 'Portland, Oregon', metadata: { template: true } },
      { id: 'focused_1', name: 'Portland leagues', region: 'Portland, Oregon', metadata: { coverageAgent: true } },
    ]);
    db.intakeRuns.findMany.mockResolvedValue([
      { id: 'run_new', intakeId: 'intake_1', status: 'PARTIAL', createdAt: new Date('2026-08-03'), summary: { failedPages: [{ url: 'https://one.example' }] } },
      { id: 'run_old', intakeId: 'intake_1', status: 'FAILED', createdAt: new Date('2026-08-02'), summary: {} },
      { id: 'run_ok', intakeId: 'intake_2', status: 'SUCCEEDED', createdAt: new Date('2026-08-03'), summary: {} },
    ]);
    const existing = new Set<string>();
    db.jobs.findUnique.mockImplementation(async ({ where }: any) => {
      const key = where.subjectType_subjectKey;
      return existing.has(`${key.subjectType}:${key.subjectKey}`) ? { id: 'existing' } : null;
    });
    db.jobs.create.mockImplementation(async ({ data }: any) => {
      existing.add(`${data.subjectType}:${data.subjectKey}`);
      return data;
    });
    let id = 0;
    const first = await reconcileAffiliateCoverageJobs({ now }, {
      database: db as any,
      createIdentifier: () => `job_${++id}`,
    });
    const second = await reconcileAffiliateCoverageJobs({ now }, {
      database: db as any,
      createIdentifier: () => `job_${++id}`,
    });

    expect(first).toEqual(expect.objectContaining({
      marketJobsCreated: 1,
      failedCaptureJobsCreated: 1,
      totalCreated: 2,
    }));
    expect(second.totalCreated).toBe(0);
    expect(db.jobs.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        subjectType: 'FAILED_INTAKE_CAPTURE',
        subjectKey: 'intake:intake_1',
      }),
    }));
    expect(db.jobs.create).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ subjectKey: 'run_old' }),
    }));
  });

  it('claims concurrent failed-capture jobs once and reports the queue state', async () => {
    const jobs = [
      { id: 'job_1', subjectType: 'FAILED_INTAKE_CAPTURE', subjectKey: 'run_1', status: 'QUEUED', context: { intakeId: 'intake_1', runId: 'run_1' }, createdAt: new Date('2026-08-01') },
      { id: 'job_2', subjectType: 'FAILED_INTAKE_CAPTURE', subjectKey: 'run_2', status: 'QUEUED', context: { intakeId: 'intake_2', runId: 'run_2' }, createdAt: new Date('2026-08-02') },
    ];
    const db = database();
    db.jobs.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.workerId) {
        return jobs.find((job: any) => job.status === 'CLAIMED' && job.workerId === where.workerId) ?? null;
      }
      return jobs.find((job) => job.status === 'QUEUED') ?? null;
    });
    db.jobs.updateMany.mockImplementation(async ({ where, data }: any) => {
      const job = jobs.find((candidate) => candidate.id === where.id) as any;
      if (!job || job.status !== 'QUEUED') return { count: 0 };
      Object.assign(job, data, { attemptCount: 1 });
      return { count: 1 };
    });
    db.intakes.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, sourceKey: where.id }));
    db.intakeRuns.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, intakeId: where.id === 'run_1' ? 'intake_1' : 'intake_2', status: 'FAILED' }));
    db.pages.findMany.mockResolvedValue([]);
    db.artifacts.findMany.mockResolvedValue([]);

    const claims = await Promise.all([
      claimNextAffiliateCoverageJob({ agentId: 'coverage-1', now }, { database: db as any }),
      claimNextAffiliateCoverageJob({ agentId: 'coverage-2', now }, { database: db as any }),
    ]);
    expect(claims.map((claim) => claim?.job.id).sort()).toEqual(['job_1', 'job_2']);

    db.jobs.findMany.mockResolvedValue(jobs);
    const summary = await summarizeAffiliateCoverageQueue({ now }, { database: db as any });
    expect(summary).toEqual(expect.objectContaining({
      claimableJobs: 0,
      activeLeases: 2,
      claimedWithoutLease: 0,
    }));
  });

  it('deduplicates new failed-capture work by canonical intake target', async () => {
    const db = database();
    db.intakeRuns.findMany.mockResolvedValue([
      { id: 'run_1', intakeId: 'intake_1', status: 'FAILED', createdAt: now, summary: {} },
      { id: 'run_2', intakeId: 'intake_2', status: 'FAILED', createdAt: now, summary: {} },
    ]);
    db.intakes.findMany.mockResolvedValue([
      { id: 'intake_1', baseUrl: 'https://www.official.example/' },
      { id: 'intake_2', baseUrl: 'https://official.example' },
    ]);
    db.jobs.findUnique.mockResolvedValue(null);
    db.jobs.create.mockImplementation(async ({ data }: any) => data);

    const result = await reconcileAffiliateCoverageJobs({ now }, {
      database: db as any,
      createIdentifier: () => 'coverage_job',
    });

    expect(result.failedCaptureJobsCreated).toBe(1);
    expect(db.jobs.create).toHaveBeenCalledTimes(1);
    expect(db.jobs.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        context: expect.objectContaining({ captureTargetKey: expect.stringMatching(/^url:/) }),
      }),
    }));
  });

  it('returns legacy market reviews to the queue when no automatic lead remains unresolved', async () => {
    const job = {
      id: 'market_job',
      subjectType: 'MARKET_COVERAGE',
      subjectKey: 'market_1:v5',
      status: 'HUMAN_REVIEW_REQUIRED',
      context: { campaignId: 'market_1' },
      result: {
        summary: 'Focused campaigns ran, but review-only leads remain.',
        reasonCodes: ['UNRESOLVED_LEADS'],
      },
      createdAt: now,
    };
    const db = database();
    db.jobs.findMany.mockResolvedValue([job]);
    db.campaigns.findUnique.mockResolvedValue({ id: 'market_1', region: 'Portland, Oregon' });
    db.discoveryResults.findMany.mockResolvedValue([{
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['MANUAL_REVIEW_ONLY'],
      reasonDetails: { autoPromotionEligible: false },
      matchingIntakeId: null,
      matchingSourceId: null,
      matchingOrganizationId: null,
    }]);
    db.jobs.update.mockResolvedValue({});

    const result = await reconcileAffiliateCoverageJobs({ now }, { database: db as any });

    expect(result.legacyHumanReviewsReclassified).toBe(1);
    expect(result.waitingJobsRequeued).toBe(1);
    expect(db.jobs.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'market_job' },
      data: expect.objectContaining({ status: 'QUEUED' }),
    }));
  });

  it('schedules a delayed retry when reconciliation migrates a transient legacy review', async () => {
    const job = {
      id: 'capture_job',
      subjectType: 'FAILED_INTAKE_CAPTURE',
      subjectKey: 'failed_run',
      status: 'HUMAN_REVIEW_REQUIRED',
      attemptCount: 1,
      context: { intakeId: 'intake_1', runId: 'failed_run' },
      result: {
        summary: 'The TLS certificate check failed before public evidence was captured.',
        reasonCodes: ['TLS_FAILURE'],
      },
      createdAt: now,
    };
    const db = database();
    db.jobs.findMany.mockResolvedValue([job]);
    db.intakes.findMany.mockResolvedValue([{
      id: 'intake_1', baseUrl: 'https://official.example/',
    }]);
    db.jobs.update.mockResolvedValue({});

    const result = await reconcileAffiliateCoverageJobs({ now }, { database: db as any });

    expect(result.legacyRetriesScheduled).toBe(1);
    expect(result.retryJobsRequeued).toBe(0);
    expect(db.jobs.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'capture_job' },
      data: expect.objectContaining({
        status: 'RETRY_SCHEDULED',
        result: expect.objectContaining({
          retryAt: '2026-08-03T17:00:00.000Z',
          reasonCodes: ['TLS_FAILURE', 'TLS_ERROR'],
        }),
      }),
    }));
  });

  it('includes focused campaign runs and results when a market job is reclaimed', async () => {
    const job = {
      id: 'market_job',
      subjectType: 'MARKET_COVERAGE',
      subjectKey: 'market_1:v5',
      status: 'QUEUED',
      context: { campaignId: 'market_1' },
      createdAt: now,
    };
    const db = database();
    db.jobs.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(job);
    db.jobs.updateMany.mockResolvedValue({ count: 1 });
    db.campaigns.findUnique.mockResolvedValue({
      id: 'market_1',
      region: 'Portland, Oregon',
      sportIds: ['sport_volleyball'],
    });
    db.campaigns.findMany.mockResolvedValue([
      { id: 'market_1', region: 'Portland, Oregon', metadata: { template: true } },
      {
        id: 'focused_1',
        region: 'Portland, Oregon',
        metadata: { coverageParentCampaignId: 'market_1' },
      },
    ]);
    db.discoveryRuns.findMany.mockResolvedValue([
      { id: 'run_focused', campaignId: 'focused_1', status: 'SUCCEEDED' },
    ]);
    db.discoveryResults.findMany.mockResolvedValue([
      {
        campaignId: 'focused_1',
        status: 'INTAKE_CREATED',
        sourceTypeHints: ['TOURNAMENT'],
        sportHints: ['Volleyball'],
        policyKey: 'operator.example',
        matchingIntakeId: 'intake_1',
        matchingSourceId: null,
        matchingOrganizationId: null,
      },
    ]);

    const claim = await claimNextAffiliateCoverageJob(
      { agentId: 'coverage-1', now },
      { database: db as any },
    );

    expect(claim?.context.assessedCampaignIds).toEqual(['market_1', 'focused_1']);
    expect(claim?.context.recentRuns).toEqual([
      expect.objectContaining({ campaignId: 'focused_1' }),
    ]);
    expect(db.discoveryResults.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { campaignId: { in: ['market_1', 'focused_1'] } },
    }));
  });

  it('creates and queues one idempotent focused campaign for a claimed market', async () => {
    const db = database();
    const job = {
      id: 'coverage_job',
      subjectType: 'MARKET_COVERAGE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
      context: { campaignId: 'market_1' },
    };
    const parent = {
      id: 'market_1',
      region: 'San Francisco Bay Area, California',
      location: 'San Francisco, California',
      sportIds: ['sport_volleyball', 'sport_soccer'],
      metadata: { anchorState: 'California' },
    };
    let focused: any = null;
    db.jobs.findUnique.mockResolvedValue(job);
    db.campaigns.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'market_1') return parent;
      if (where.coverageFingerprint) return focused;
      return null;
    });
    db.sports.count.mockResolvedValue(1);
    db.campaigns.create.mockImplementation(async ({ data }: any) => {
      focused = data;
      return data;
    });
    const queueCampaignRun = jest.fn().mockResolvedValue({ id: 'discovery_run_1' });
    const proposal = {
      schemaVersion: 1 as const,
      jobId: 'coverage_job',
      agentId: 'coverage-1',
      name: 'San Francisco Volleyball Tournament Operators',
      region: 'San Francisco Bay Area, California',
      location: 'San Francisco, California',
      sportIds: ['sport_volleyball'],
      sourceTypeHints: ['TOURNAMENT'] as const,
      coverageArchetypes: ['COMPETITION_OPERATOR'] as const,
      rationale: 'The market has tournament events but no focused operator discovery campaign.',
      searchIntervalMinutes: 10_080,
      maxQueriesPerRun: 10,
      maxResultsPerQuery: 10,
    };

    const first = await createAffiliateCoverageCampaign(proposal, {
      database: db as any,
      now: () => now,
      createIdentifier: () => 'focused_1',
      queueCampaignRun,
    });
    const second = await createAffiliateCoverageCampaign(proposal, {
      database: db as any,
      now: () => now,
      createIdentifier: () => 'focused_2',
      queueCampaignRun,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.campaign.id).toBe('focused_1');
    expect(db.campaigns.create).toHaveBeenCalledTimes(1);
    expect(queueCampaignRun).toHaveBeenCalledTimes(2);
    expect(focused.metadata).toEqual(expect.objectContaining({
      coverageParentCampaignId: 'market_1',
      coverageArchetypes: ['COMPETITION_OPERATOR'],
    }));
  });

  it('stores durable manual browser evidence and returns an intake to mapping', async () => {
    const db = database();
    const job = {
      id: 'repair_job',
      subjectType: 'FAILED_INTAKE_CAPTURE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
      context: { intakeId: 'intake_1', runId: 'failed_run' },
    };
    db.jobs.findUnique.mockResolvedValue(job);
    db.intakes.findUnique.mockResolvedValue({
      id: 'intake_1', complianceStatus: 'ALLOWED', affiliateSourceId: null,
    });
    db.pages.findUnique.mockResolvedValue({
      id: 'page_1',
      intakeId: 'intake_1',
      canonicalUrl: 'https://official.example/programs',
      robotsStatus: 'ALLOWED',
    });
    db.intakeRuns.findUnique.mockResolvedValue(null);
    db.intakeRuns.create.mockResolvedValue({});
    db.intakeRuns.update.mockResolvedValue({});
    db.intakes.update.mockResolvedValue({});
    db.mappingJobs.findFirst.mockResolvedValue(null);
    db.mappingJobs.create.mockResolvedValue({ id: 'mapping_job_1' });
    const persistArtifact = jest.fn().mockImplementation(async (input: any) => ({
      id: `artifact_${input.kind}`,
      kind: input.kind,
    }));
    const html = Buffer.from(`<!doctype html><html><head><title>Official League</title></head><body>
      <main><h1>Official Community Volleyball League</h1>
      <p>${'Public league registration, schedules, divisions, locations, and organizer information. '.repeat(12)}</p>
      <a href="/register">Register for the current volleyball season</a></main>
      </body></html>`);

    const result = await storeAffiliateManualBrowserEvidence({
      jobId: 'repair_job',
      agentId: 'coverage-1',
      pageId: 'page_1',
      sourceUrl: 'https://www.official.example/programs',
      finalUrl: 'https://www.official.example/programs',
      html,
      notes: 'One public browser navigation rendered the official page without authentication.',
    }, {
      database: db as any,
      now: () => now,
      createIdentifier: () => 'mapping_job_1',
      persistArtifact,
    });

    expect(result).toEqual(expect.objectContaining({
      intakeId: 'intake_1',
      mappingJobId: 'mapping_job_1',
    }));
    expect(persistArtifact).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'PAGE_HTML',
      provider: 'MANUAL_BROWSER',
      sourceUrl: 'https://www.official.example/programs',
      finalUrl: 'https://www.official.example/programs',
    }));
    expect(db.intakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: expect.objectContaining({ status: 'READY_FOR_MAPPING' }),
    });
  });

  it('requires concrete evidence before a market can be completed as covered', async () => {
    const db = database();
    db.jobs.findUnique.mockResolvedValue({
      id: 'job_1',
      subjectType: 'MARKET_COVERAGE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
    });

    await expect(completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'job_1',
      agentId: 'coverage-1',
      decision: 'COVERED',
      summary: 'The market appears complete.',
      campaignIds: [],
      coverageEvidence: {
        sourceFamilies: ['provider search'],
        completedQueryProfiles: [],
        recentNewDomainYields: [],
        unresolvedLeadCount: 1,
        notes: [],
      },
      reasonCodes: [],
    }, { database: db as any, now: () => now })).rejects.toThrow('COVERED requires');
  });

  it('returns a market job to the queue after its created campaigns finish', async () => {
    const db = database();
    db.jobs.findUnique.mockResolvedValue({
      id: 'job_1',
      subjectType: 'MARKET_COVERAGE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      claimedAt: now,
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
    });
    db.campaigns.findMany.mockResolvedValue([{
      id: 'campaign_1',
      metadata: { coverageJobId: 'job_1' },
    }]);
    db.discoveryRuns.findMany.mockResolvedValue([{
      campaignId: 'campaign_1',
      status: 'SUCCEEDED',
    }]);
    db.jobs.update.mockResolvedValue({ id: 'job_1', status: 'QUEUED' });

    await completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'job_1',
      agentId: 'coverage-1',
      decision: 'CAMPAIGNS_CREATED',
      summary: 'Created and ran a focused tournament operator campaign.',
      campaignIds: ['campaign_1'],
      coverageEvidence: null,
      reasonCodes: [],
    }, { database: db as any, now: () => now });

    expect(db.jobs.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: expect.objectContaining({
        status: 'QUEUED',
        claimedAt: null,
        workerId: null,
        leaseExpiresAt: null,
        finishedAt: null,
      }),
    });
  });

  it('does not return a market job to the queue while its latest campaign run is active', async () => {
    const db = database();
    db.jobs.findUnique.mockResolvedValue({
      id: 'job_1',
      subjectType: 'MARKET_COVERAGE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      claimedAt: now,
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
    });
    db.campaigns.findMany.mockResolvedValue([{
      id: 'campaign_1',
      metadata: { coverageJobId: 'job_1' },
    }]);
    db.discoveryRuns.findMany.mockResolvedValue([
      { campaignId: 'campaign_1', status: 'QUEUED' },
      { campaignId: 'campaign_1', status: 'SUCCEEDED' },
    ]);

    await expect(completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'job_1',
      agentId: 'coverage-1',
      decision: 'CAMPAIGNS_CREATED',
      summary: 'The focused campaign was created and is still queued.',
      campaignIds: ['campaign_1'],
      coverageEvidence: null,
      reasonCodes: [],
    }, { database: db as any, now: () => now })).rejects.toThrow('Run each created campaign');
  });

  it('creates a queued mapper repair with the coverage failure context', async () => {
    const db = database();
    db.jobs.findUnique.mockResolvedValue({
      id: 'capture_job',
      subjectType: 'FAILED_INTAKE_CAPTURE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      claimedAt: now,
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
      context: { intakeId: 'intake_1' },
    });
    db.mappingJobs.findFirst.mockResolvedValue(null);
    db.mappingJobs.create.mockResolvedValue({ id: 'mapping_repair_1' });
    db.intakes.update.mockResolvedValue({});
    db.jobs.update.mockResolvedValue({ id: 'capture_job', status: 'COMPLETED' });

    await completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'capture_job',
      agentId: 'coverage-1',
      decision: 'MAPPER_REPAIR_REQUIRED',
      summary: 'The official page renders, but the approved source selectors no longer match it.',
      campaignIds: [],
      coverageEvidence: null,
      reasonCodes: ['SELECTOR_DRIFT'],
    }, {
      database: db as any,
      now: () => now,
      createIdentifier: () => 'mapping_repair_1',
    });

    expect(db.mappingJobs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'mapping_repair_1',
        intakeId: 'intake_1',
        status: 'QUEUED',
        resultSummary: expect.objectContaining({
          mappingRepairHistory: [expect.objectContaining({
            coverageJobId: 'capture_job',
            repairReasons: ['SELECTOR_DRIFT'],
          })],
        }),
      }),
    });
    expect(db.intakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { status: 'READY_FOR_MAPPING' },
    });
    expect(db.jobs.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        result: expect.objectContaining({ repairMappingJobId: 'mapping_repair_1' }),
      }),
    }));
  });

  it('checks current unresolved leads and executed query profiles before marking coverage complete', async () => {
    const db = database();
    db.jobs.findUnique.mockResolvedValue({
      id: 'job_1',
      subjectType: 'MARKET_COVERAGE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      claimedAt: now,
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
      context: { campaignId: 'market_1' },
    });
    db.discoveryResults.findMany.mockResolvedValue([{
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['MANUAL_REVIEW_ONLY'],
      reasonDetails: { autoPromotionEligible: false },
      matchingIntakeId: null,
      matchingSourceId: null,
      matchingOrganizationId: null,
    }]);
    db.discoveryRuns.findMany.mockResolvedValue([{
      summary: {
        queries: [
          { templateKey: 'PROFILE:league-operators' },
          { templateKey: 'PROFILE:tournament-operators' },
        ],
      },
    }]);
    db.jobs.update.mockResolvedValue({ id: 'job_1', status: 'COMPLETED' });

    await completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'job_1',
      agentId: 'coverage-1',
      decision: 'COVERED',
      summary: 'Focused operator searches are complete and no unresolved leads remain.',
      campaignIds: [],
      coverageEvidence: {
        sourceFamilies: ['provider search', 'governing association directory'],
        completedQueryProfiles: ['league-operators', 'tournament-operators'],
        recentNewDomainYields: [1, 0],
        unresolvedLeadCount: 0,
        notes: [],
      },
      reasonCodes: [],
    }, { database: db as any, now: () => now });

    expect(db.jobs.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: expect.objectContaining({ status: 'COMPLETED', finishedAt: now }),
    });
  });

  it('schedules a bounded transient retry and excludes an exhausted retry', async () => {
    const baseJob = {
      id: 'capture_job',
      subjectType: 'FAILED_INTAKE_CAPTURE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      claimedAt: now,
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
      context: { intakeId: 'intake_1' },
    };
    const db = database();
    db.jobs.findUnique.mockResolvedValue({ ...baseJob, attemptCount: 1 });
    db.jobs.update.mockResolvedValue({ id: 'capture_job', status: 'RETRY_SCHEDULED' });
    await completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'capture_job',
      agentId: 'coverage-1',
      decision: 'RETRY_LATER',
      summary: 'A transient TLS failure prevented the bounded public capture.',
      campaignIds: [],
      coverageEvidence: null,
      reasonCodes: ['TLS_ERROR'],
    }, { database: db as any, now: () => now });
    expect(db.jobs.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'RETRY_SCHEDULED',
        result: expect.objectContaining({ retryAt: '2026-08-03T17:00:00.000Z' }),
        claimedAt: null,
        workerId: null,
      }),
    }));

    db.jobs.findUnique.mockResolvedValue({ ...baseJob, attemptCount: 3 });
    await completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'capture_job',
      agentId: 'coverage-1',
      decision: 'RETRY_LATER',
      summary: 'The public endpoint still returns a transient network error.',
      campaignIds: [],
      coverageEvidence: null,
      reasonCodes: ['NETWORK_ERROR'],
    }, { database: db as any, now: () => now });
    expect(db.jobs.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'EXCLUDED',
        result: expect.objectContaining({
          decision: 'SOURCE_EXCLUDED',
          reasonCodes: ['NETWORK_ERROR', 'RETRY_EXHAUSTED'],
        }),
        finishedAt: now,
      }),
    }));
  });

  it('rejects generic human-review completion without a human decision reason', async () => {
    const db = database();
    db.jobs.findUnique.mockResolvedValue({
      id: 'capture_job',
      subjectType: 'FAILED_INTAKE_CAPTURE',
      status: 'CLAIMED',
      workerId: 'coverage-1',
      leaseExpiresAt: new Date('2026-08-03T18:30:00.000Z'),
    });
    await expect(completeAffiliateCoverageJob({
      schemaVersion: 1,
      jobId: 'capture_job',
      agentId: 'coverage-1',
      decision: 'HUMAN_REVIEW_REQUIRED',
      summary: 'The website returned an inconclusive public access response.',
      campaignIds: [],
      coverageEvidence: null,
      reasonCodes: ['INACCESSIBLE_EVIDENCE'],
    }, { database: db as any, now: () => now })).rejects.toThrow(
      'HUMAN_REVIEW_REQUIRED requires conflicting identity',
    );
  });
});
