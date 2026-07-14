/** @jest-environment node */

import path from 'node:path';
import {
  buildDuplicateRelationshipAudit,
  parseAuditCliArgs,
  parseClassificationLedger,
  reconcileClassifications,
  resolveData007ArtifactPath,
  type LegacyOnlyLiveTeamLink,
} from '../audit-duplicate-relationship-arrays';

const liveLink: LegacyOnlyLiveTeamLink = {
  userId: 'user_1',
  legacyTeamId: 'event_team_1',
  canonicalTeamId: 'team_1',
};

const validEntry = {
  ...liveLink,
  disposition: 'STALE_CONFIRMED',
  reviewedAt: '2026-07-14T00:00:00.000Z',
  reviewedBy: 'operator_1',
  reason: 'Confirmed through the team-management workflow.',
};

describe('duplicate relationship array audit classifications', () => {
  it('accepts an empty versioned ledger', () => {
    expect(parseClassificationLedger({ version: 1, entries: [] })).toEqual({
      entries: [],
      invalidEntries: [],
    });
  });

  it('classifies an exact current stale link', () => {
    const ledger = parseClassificationLedger({ version: 1, entries: [validEntry] });

    expect(reconcileClassifications([liveLink], ledger)).toEqual({
      classified: [liveLink],
      unclassified: [],
      invalidEntries: [],
    });
  });

  it('reports a ledger entry that does not match a current link as invalid', () => {
    const ledger = parseClassificationLedger({
      version: 1,
      entries: [{ ...validEntry, canonicalTeamId: 'team_unknown' }],
    });
    const result = reconcileClassifications([liveLink], ledger);

    expect(result.classified).toEqual([]);
    expect(result.unclassified).toEqual([liveLink]);
    expect(result.invalidEntries).toEqual([
      expect.objectContaining({
        index: 0,
        reason: expect.stringContaining('does not match'),
      }),
    ]);
  });

  it('rejects duplicate exact classification keys', () => {
    const ledger = parseClassificationLedger({
      version: 1,
      entries: [validEntry, { ...validEntry, reason: 'Duplicate review.' }],
    });

    expect(ledger.entries).toHaveLength(1);
    expect(ledger.invalidEntries).toEqual([
      { index: 1, reason: 'Duplicate classification key.' },
    ]);
  });

  it('reports malformed ledger entries without accepting them', () => {
    const ledger = parseClassificationLedger({
      version: 1,
      entries: [{ ...validEntry, disposition: 'IGNORE', reviewedAt: 'not-a-date' }],
    });

    expect(ledger.entries).toEqual([]);
    expect(ledger.invalidEntries).toEqual([
      { index: 0, reason: 'Disposition must be STALE_CONFIRMED.' },
    ]);
  });

  it('leaves newly appearing links unclassified', () => {
    const result = reconcileClassifications(
      [liveLink, { userId: 'user_2', legacyTeamId: 'team_2', canonicalTeamId: 'team_2' }],
      parseClassificationLedger({ version: 1, entries: [validEntry] }),
    );

    expect(result.classified).toEqual([liveLink]);
    expect(result.unclassified).toEqual([
      { userId: 'user_2', legacyTeamId: 'team_2', canonicalTeamId: 'team_2' },
    ]);
    expect(result.invalidEntries).toEqual([]);
  });
});

describe('duplicate relationship array audit comparison', () => {
  it('compares normalized ownership and membership while resolving event-team parents', () => {
    const ledger = parseClassificationLedger({ version: 1, entries: [validEntry] });
    const report = buildDuplicateRelationshipAudit({
      organizations: [
        { id: 'org_exact', productIds: ['product_exact'] },
        { id: 'org_drift', productIds: ['product_orphan', 'product_foreign'] },
        { id: 'org_foreign_owner', productIds: ['product_foreign'] },
      ],
      products: [
        { id: 'product_exact', organizationId: 'org_exact' },
        { id: 'product_normalized_only', organizationId: 'org_drift' },
        { id: 'product_foreign', organizationId: 'org_foreign_owner' },
      ],
      users: [
        { id: 'user_exact', teamIds: ['team_exact'] },
        { id: 'user_1', teamIds: ['event_team_1'] },
        { id: 'user_contradicted', teamIds: ['team_contradicted'] },
        { id: 'user_orphan', teamIds: ['missing_team'] },
      ],
      canonicalTeams: [
        { id: 'team_exact' },
        { id: 'team_1' },
        { id: 'team_contradicted' },
        { id: 'team_normalized_only' },
      ],
      eventTeams: [{ id: 'event_team_1', parentTeamId: 'team_1' }],
      teamRegistrations: [
        { userId: 'user_exact', teamId: 'team_exact', status: 'ACTIVE' },
        { userId: 'user_normalized', teamId: 'team_normalized_only', status: 'ACTIVE' },
        { userId: 'user_contradicted', teamId: 'team_contradicted', status: 'LEFT' },
      ],
      teamStaffAssignments: [
        { userId: 'user_exact', teamId: 'team_exact', status: 'ACTIVE' },
      ],
    }, ledger, '2026-07-14T00:00:00.000Z');

    expect(report.products).toMatchObject({
      exactOrganizations: 2,
      normalizedOnlyIds: 1,
      legacyOnlyOrphanIds: 1,
      legacyForeignOwnerIds: 1,
    });
    expect(report.userTeams).toMatchObject({
      exactUsers: 1,
      normalizedOnlyLinks: 1,
      legacyOnlyLiveTeamLinks: 1,
      classifiedStaleLiveTeamLinks: 1,
      unclassifiedLegacyOnlyLiveTeamLinks: 0,
      contradictedLinks: 1,
      orphanIds: 1,
      invalidClassificationEntries: 0,
    });
    expect(report.userTeams?.details.classifiedStale).toEqual([liveLink]);
  });
});

describe('duplicate relationship array audit CLI boundaries', () => {
  it('parses strict mode and both artifact paths', () => {
    expect(parseAuditCliArgs([
      '--strict',
      '--output',
      'output/data007/report.json',
      '--classifications',
      'output/data007/classifications.json',
    ])).toEqual({
      strict: true,
      outputPath: 'output/data007/report.json',
      classificationsPath: 'output/data007/classifications.json',
    });
  });

  it('rejects artifact paths outside the ignored DATA-007 directory', () => {
    const cwd = path.join(path.sep, 'tmp', 'mvp-site');

    expect(resolveData007ArtifactPath('output/data007/report.json', cwd)).toBe(
      path.join(cwd, 'output', 'data007', 'report.json'),
    );
    expect(() => resolveData007ArtifactPath('output/report.json', cwd)).toThrow(
      'Artifact paths must be files inside output/data007/.',
    );
    expect(() => resolveData007ArtifactPath('output/data007/../report.json', cwd)).toThrow(
      'Artifact paths must be files inside output/data007/.',
    );
  });
});
