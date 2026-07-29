/** @jest-environment node */

import {
  buildAffiliateMappingAgentBaseline,
  listAffiliateSetupScripts,
} from '../agentBaseline';

const selectorMapping = {
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
};

describe('affiliate mapping agent baseline', () => {
  it('builds a redacted, deterministic readiness summary', () => {
    const baseline = buildAffiliateMappingAgentBaseline({
      capturedAt: new Date('2026-07-29T19:00:00.000Z'),
      environment: 'local',
      sources: [
        {
          id: 'source_1',
          sourceKey: 'river-city',
          targetKind: 'EVENT',
          status: 'ACTIVE',
          activeMappingId: 'mapping_1',
          metadata: {
            sourceEvidence: {
              intakeSourceKey: 'river-city',
              runId: 'run_1',
            },
          },
        },
        {
          id: 'source_2',
          sourceKey: 'summit-club',
          targetKind: 'CLUB',
          status: 'PAUSED',
          activeMappingId: 'mapping_2',
          metadata: null,
        },
      ],
      mappings: [
        {
          id: 'mapping_1',
          sourceId: 'source_1',
          isActive: true,
          mapping: selectorMapping,
          validatedAt: '2026-07-20T00:00:00.000Z',
        },
        {
          id: 'mapping_2',
          sourceId: 'source_2',
          isActive: true,
          mapping: {
            ...selectorMapping,
            kind: 'CLUB',
            manualCandidates: [{
              listingKind: 'CLUB',
              title: 'Summit Club',
              officialActionUrl: 'https://summit.example',
            }],
          },
          validatedAt: null,
        },
        {
          id: 'mapping_3',
          sourceId: 'source_2',
          isActive: false,
          mapping: { invalid: true },
          validatedAt: null,
        },
      ],
      intakes: [
        {
          id: 'intake_1',
          sourceKey: 'river-city',
          status: 'READY_FOR_MAPPING',
          complianceStatus: 'ALLOWED',
          affiliateSourceId: 'source_1',
          lastRunId: 'run_1',
        },
        {
          id: 'intake_2',
          sourceKey: 'unmatched',
          status: 'DRAFT',
          complianceStatus: 'UNREVIEWED',
          affiliateSourceId: null,
          lastRunId: null,
        },
      ],
      artifactGroups: [
        { intakeId: 'intake_1', kind: 'PAGE_HTML', count: 2 },
        { intakeId: 'intake_1', kind: 'PAGE_MARKDOWN', count: 1 },
      ],
      candidateStatusGroups: [
        { status: 'DISCOVERED', count: 5 },
        { status: 'PUBLISHED', count: 2 },
      ],
      mappingJobStatusGroups: [
        { status: 'QUEUED', count: 1 },
        { status: 'REVIEW_REQUIRED', count: 2 },
      ],
      setupScripts: [
        'scripts/setup-river-city-affiliate-source.ts',
        'scripts/setup-summit-affiliate-source.ts',
      ],
    });

    expect(baseline).toEqual({
      schemaVersion: 1,
      capturedAt: '2026-07-29T19:00:00.000Z',
      environment: 'local',
      readOnly: true,
      publicRequests: 0,
      databaseWrites: 0,
      sources: {
        total: 2,
        active: 1,
        byStatus: { ACTIVE: 1, PAUSED: 1 },
        byTargetKind: { CLUB: 1, EVENT: 1 },
        withActiveMappingId: 2,
        withSourceEvidence: 1,
        linkedToIntake: 1,
      },
      mappings: {
        total: 3,
        active: 2,
        validatedActive: 1,
        modes: {
          manualCandidates: 1,
          selectors: 1,
          invalid: 0,
        },
      },
      intakes: {
        total: 2,
        byStatus: { DRAFT: 1, READY_FOR_MAPPING: 1 },
        byComplianceStatus: { ALLOWED: 1, UNREVIEWED: 1 },
        linkedToAffiliateSource: 1,
        withSelectedRun: 1,
        withStoredArtifacts: 1,
      },
      artifacts: {
        total: 3,
        byKind: { PAGE_HTML: 2, PAGE_MARKDOWN: 1 },
      },
      candidates: {
        total: 7,
        byStatus: { DISCOVERED: 5, PUBLISHED: 2 },
      },
      mappingJobs: {
        total: 3,
        byStatus: { QUEUED: 1, REVIEW_REQUIRED: 2 },
      },
      setupScripts: {
        total: 2,
        files: [
          'scripts/setup-river-city-affiliate-source.ts',
          'scripts/setup-summit-affiliate-source.ts',
        ],
      },
    });
  });

  it('counts invalid active mappings separately', () => {
    const baseline = buildAffiliateMappingAgentBaseline({
      capturedAt: new Date('2026-07-29T19:00:00.000Z'),
      environment: 'live',
      sources: [],
      mappings: [{
        id: 'mapping_invalid',
        sourceId: 'source_invalid',
        isActive: true,
        mapping: { itemSelector: '.missing-contract' },
        validatedAt: null,
      }],
      intakes: [],
      artifactGroups: [],
      candidateStatusGroups: [],
      mappingJobStatusGroups: [],
      setupScripts: [],
    });
    expect(baseline.mappings.modes).toEqual({
      manualCandidates: 0,
      selectors: 0,
      invalid: 1,
    });
  });

  it('discovers only source setup scripts', async () => {
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const temporaryDirectory = await fs.mkdtemp('/tmp/affiliate-agent-baseline-');
    try {
      await Promise.all([
        fs.writeFile(`${temporaryDirectory}/setup-river-affiliate-source.ts`, ''),
        fs.writeFile(`${temporaryDirectory}/setup-summit-current-programs-source.ts`, ''),
        fs.writeFile(`${temporaryDirectory}/audit-source.ts`, ''),
      ]);
      expect(await listAffiliateSetupScripts(temporaryDirectory)).toEqual([
        'scripts/setup-river-affiliate-source.ts',
        'scripts/setup-summit-current-programs-source.ts',
      ]);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
