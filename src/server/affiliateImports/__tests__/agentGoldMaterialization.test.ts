/** @jest-environment node */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildAffiliateTrainingValidationSplitAssignments,
  materializeAffiliateMappingGoldExample,
} from '../agentGoldMaterialization';
import type { AffiliateMappingJobContext } from '../agentModelClient';
import type { AffiliateScrapeMapping } from '../types';

describe('affiliate mapping gold materialization', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'affiliate-gold-materialize-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  const prepareFixture = async (body: string) => {
    const hash = createHash('sha256').update(body).digest('hex');
    await fs.mkdir(path.join(directory, 'fixtures'), { recursive: true });
    await fs.writeFile(path.join(directory, 'fixtures', 'events.html'), body, 'utf8');
    const page = {
      url: 'https://river.example/events',
      finalUrl: 'https://river.example/events',
      statusCode: 200,
      file: 'fixtures/events.html',
      byteLength: Buffer.byteLength(body),
      sha256: hash,
      fetchedAt: '2026-07-29T19:00:00.000Z',
    };
    await fs.writeFile(path.join(directory, 'pages.json'), JSON.stringify({
      schemaVersion: 1,
      pages: [page],
    }), 'utf8');
    return { hash, page };
  };

  const contextFor = (
    hash: string,
    policyDisposition: AffiliateMappingJobContext['policyDisposition'] = 'ALLOWED',
  ): AffiliateMappingJobContext => ({
    jobId: 'job_river',
    intakeId: 'intake_river',
    sourceKey: 'river-source',
    runId: 'run_river',
    evidenceRunIds: ['run_river'],
    policyDisposition,
    targetKindHints: ['EVENT'],
    artifacts: [{
      kind: policyDisposition === 'BLOCKED' ? 'POLICY_NOTE' : 'PAGE_HTML',
      sha256: hash,
      pageUrl: 'https://river.example/events',
      byteLength: 100,
      intakeId: 'intake_river',
      runId: 'run_river',
    }],
    instructionsRevision: 'affiliate-source-mapping-contract-v1',
  });

  const mappingFor = (startsAt: string): AffiliateScrapeMapping => ({
    kind: 'EVENT',
    listUrl: 'https://river.example/events',
    itemSelector: 'body',
    fields: {
      title: { selector: 'body' },
      officialActionUrl: {
        selector: 'body',
        mode: 'literal',
        value: 'https://register.river.example/summer',
      },
    },
    manualCandidates: [{
      title: 'River City Summer League',
      officialActionUrl: 'https://register.river.example/summer',
      sourceUrl: 'https://river.example/events',
      sportName: 'Grass Soccer',
      startsAt,
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'September 1, 2026',
      divisions: [{ name: 'Adult' }],
    }],
  });

  const baseInput = async (startsAt = '2026-09-01T18:00:00.000Z') => {
    const { hash, page } = await prepareFixture([
      '<main>',
      '<h1>River City Summer League</h1>',
      '<p>September 1, 2026</p>',
      '<a href="https://register.river.example/summer">Register</a>',
      '</main>',
    ].join(''));
    return {
      cohortId: 'affiliate-mapping-test-example',
      proposalSourceKey: 'river-source',
      registrableDomain: 'river.example',
      platformFamily: null,
      split: 'test' as const,
      targetKind: 'EVENT' as const,
      scenarioIntent: 'EXECUTABLE_MAPPING' as const,
      context: contextFor(hash),
      mapping: mappingFor(startsAt),
      fixtureDirectory: directory,
      fixturePages: [page],
      organization: {
        name: 'River City Sports',
        website: 'https://river.example',
        description: null,
        city: 'Portland',
        address: null,
      },
      approval: {
        approvedByUserId: 'admin_1',
        approvedAt: '2026-07-29T20:00:00.000Z',
        proposalSha256: 'a'.repeat(64),
      },
    };
  };

  it('turns an approved exact fixture and mapping into an executable gold example', async () => {
    const result = await materializeAffiliateMappingGoldExample(await baseInput());

    expect(result.outcome).toBe('MANUAL_CANDIDATES');
    expect(result.example.expectedPersistedCandidates).toEqual([
      expect.objectContaining({
        title: 'River City Summer League',
        startsAt: '2026-09-01T18:00:00.000Z',
        divisions: ['Adult'],
      }),
    ]);
    expect(result.example.approvedDraft.evidence).toEqual([
      expect.objectContaining({
        supports: expect.arrayContaining(['expectedCandidates.0.startsAt']),
      }),
    ]);
  });

  it('downgrades an intended executable when its only candidate is already past', async () => {
    const input = await baseInput('2026-07-01T18:00:00.000Z');
    const result = await materializeAffiliateMappingGoldExample(input);

    expect(result.outcome).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.example.target).toEqual({
      type: 'REFUSAL',
      refusalClass: 'INSUFFICIENT_EVIDENCE',
    });
    expect(result.example.expectedPersistedCandidates).toEqual([]);
  });

  it('prunes stale manual rows while preserving a current executable mapping', async () => {
    const input = await baseInput();
    input.mapping.manualCandidates?.push({
      title: 'River City Spring League',
      officialActionUrl: 'https://register.river.example/spring',
      sourceUrl: 'https://river.example/events',
      startsAt: '2026-04-01T18:00:00.000Z',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'April 1, 2026',
    });
    const result = await materializeAffiliateMappingGoldExample(input);

    expect(result.outcome).toBe('MANUAL_CANDIDATES');
    expect(result.example.approvedDraft.mapping?.manualCandidates).toHaveLength(1);
    expect(result.warnings).toContain(
      'Pruned 1 stale or unsupported manual candidate(s) from the approved mapping.',
    );
  });

  it('excludes candidates whose actions contain direct contact data', async () => {
    const input = await baseInput();
    input.mapping.manualCandidates?.push({
      title: 'River City Summer League',
      officialActionUrl: 'https://calendar.google.com/calendar?cid=coach@river.example',
      sourceUrl: 'https://river.example/events',
      startsAt: '2026-09-01T18:00:00.000Z',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'September 1, 2026',
    });
    const result = await materializeAffiliateMappingGoldExample(input);

    expect(result.example.expectedPersistedCandidates).toHaveLength(1);
    expect(result.warnings).toContain(
      'Excluded 1 candidate(s) containing private or credentialed data.',
    );
  });

  it('preserves explicit blocked and custom-extractor outcomes without executable mappings', async () => {
    const input = await baseInput();
    const blocked = await materializeAffiliateMappingGoldExample({
      ...input,
      scenarioIntent: 'BLOCKED_REFUSAL',
      context: contextFor(input.context.artifacts[0].sha256, 'BLOCKED'),
      mapping: null,
      fixturePages: [],
    });
    const custom = await materializeAffiliateMappingGoldExample({
      ...input,
      scenarioIntent: 'CUSTOM_EXTRACTOR_REVIEW',
    });

    expect(blocked.outcome).toBe('BLOCKED');
    expect(blocked.example.approvedDraft.mapping).toBeNull();
    expect(custom.outcome).toBe('CUSTOM_EXTRACTOR_REQUIRED');
    expect(custom.example.approvedDraft.mapping).toBeNull();
  });

  it('preserves frozen domain splits and reserves new selector domains for validation', () => {
    const frozenExamples = Array.from({ length: 15 }, (_, index) => ({
      registrableDomain: `frozen-validation-${index}.example`,
      split: 'validation' as const,
      targetKind: index === 0 ? 'CLUB' as const : index === 1 ? 'RENTAL' as const : 'EVENT' as const,
      mappingMode: 'MANUAL_CANDIDATES' as const,
    })).concat([{
      registrableDomain: 'frozen-train.example',
      split: 'train' as const,
      targetKind: 'EVENT' as const,
      mappingMode: 'SELECTOR' as const,
    }]);
    const assignments = buildAffiliateTrainingValidationSplitAssignments({
      frozenExamples,
      candidates: [
        {
          registrableDomain: 'frozen-train.example',
          sourceKey: 'same-frozen-domain',
          targetKind: 'EVENT',
          mappingMode: 'SELECTOR',
        },
        ...['a', 'b', 'c', 'd'].map((key) => ({
          registrableDomain: `selector-${key}.example`,
          sourceKey: `selector-${key}`,
          targetKind: 'EVENT' as const,
          mappingMode: 'SELECTOR' as const,
        })),
      ],
    });

    expect(assignments.get('frozen-train.example')).toBe('train');
    expect(assignments.get('selector-a.example')).toBe('validation');
    expect(assignments.get('selector-b.example')).toBe('validation');
    expect(assignments.get('selector-c.example')).toBe('validation');
    expect(assignments.get('selector-d.example')).toBe('train');
  });

  it('rejects conflicting frozen split assignments', () => {
    expect(() => buildAffiliateTrainingValidationSplitAssignments({
      candidates: [],
      frozenExamples: [
        {
          registrableDomain: 'same.example',
          split: 'train',
          targetKind: 'EVENT',
          mappingMode: 'SELECTOR',
        },
        {
          registrableDomain: 'same.example',
          split: 'validation',
          targetKind: 'EVENT',
          mappingMode: 'SELECTOR',
        },
      ],
    })).toThrow('leaks across');
  });
});
