import {
  rankEventSearchCandidates,
  type EventRankingCandidate,
  type OrganizationRankingMetadata,
} from '@/server/events/recommendedEventRanking';

const start = new Date('2026-08-10T18:00:00.000Z');

const candidate = (
  id: string,
  overrides: Partial<EventRankingCandidate> = {},
): EventRankingCandidate => ({
  id,
  name: `Event ${id}`,
  start,
  coordinates: [-122.6784, 45.5152],
  organizationId: null,
  sourceType: null,
  ...overrides,
});

const organizations = (
  rows: Array<[string, OrganizationRankingMetadata]>,
): Map<string, OrganizationRankingMetadata> => new Map(rows);

describe('rankEventSearchCandidates', () => {
  it('prefers BracketIQ-powered events over otherwise equal affiliate imports', () => {
    const ranked = rankEventSearchCandidates([
      candidate('affiliate', { sourceType: 'AFFILIATE_IMPORT' }),
      candidate('native'),
    ], {
      sort: 'RECOMMENDED',
      userLocation: { lat: 45.5152, lng: -122.6784 },
    });

    expect(ranked.map((event) => event.id)).toEqual(['native', 'affiliate']);
  });

  it('prefers claimed organizations over otherwise equal unclaimed organizations', () => {
    const ranked = rankEventSearchCandidates([
      candidate('unclaimed', { organizationId: 'org-unclaimed', sourceType: 'AFFILIATE_IMPORT' }),
      candidate('claimed', { organizationId: 'org-claimed', sourceType: 'AFFILIATE_IMPORT' }),
    ], {
      sort: 'RECOMMENDED',
      userLocation: { lat: 45.5152, lng: -122.6784 },
      organizationsById: organizations([
        ['org-unclaimed', { ownershipStatus: 'UNCLAIMED' }],
        ['org-claimed', { ownershipStatus: 'CLAIMED', claimVerificationLevel: 'AFFILIATION' }],
      ]),
    });

    expect(ranked.map((event) => event.id)).toEqual(['claimed', 'unclaimed']);
  });

  it('adds other organizations before allowing one organization to flood the order', () => {
    const ranked = rankEventSearchCandidates([
      ...Array.from({ length: 8 }, (_, index) => candidate(`recs-${index + 1}`, {
        name: index < 5 ? 'Round Robin' : `RECS Event ${index + 1}`,
        organizationId: 'recs',
      })),
      candidate('other-1', { organizationId: 'other-1' }),
      candidate('other-2', { organizationId: 'other-2' }),
      candidate('other-3', { organizationId: 'other-3' }),
    ], {
      sort: 'RECOMMENDED',
      userLocation: { lat: 45.5152, lng: -122.6784 },
    });

    const firstSixOrganizationIds = ranked.slice(0, 6).map((event) => event.organizationId);
    expect(firstSixOrganizationIds).toEqual(expect.arrayContaining(['other-1', 'other-2', 'other-3']));
    expect(ranked.map((event) => event.id).sort()).toEqual([
      'other-1',
      'other-2',
      'other-3',
      'recs-1',
      'recs-2',
      'recs-3',
      'recs-4',
      'recs-5',
      'recs-6',
      'recs-7',
      'recs-8',
    ]);
  });

  it('uses nearest and soonest as deterministic explicit orders', () => {
    const rows = [
      candidate('near-late', {
        start: new Date('2026-09-10T18:00:00.000Z'),
        coordinates: [-122.68, 45.5152],
      }),
      candidate('far-soon', {
        start: new Date('2026-08-05T18:00:00.000Z'),
        coordinates: [-122.85, 45.5152],
      }),
    ];

    expect(rankEventSearchCandidates(rows, {
      sort: 'NEAREST',
      userLocation: { lat: 45.5152, lng: -122.6784 },
    }).map((event) => event.id)).toEqual(['near-late', 'far-soon']);

    expect(rankEventSearchCandidates(rows, {
      sort: 'SOONEST',
      userLocation: { lat: 45.5152, lng: -122.6784 },
    }).map((event) => event.id)).toEqual(['far-soon', 'near-late']);
  });

  it('is stable for the same candidate set', () => {
    const rows = [
      candidate('b', { organizationId: 'org' }),
      candidate('a', { organizationId: 'org' }),
      candidate('c', { organizationId: 'another' }),
    ];
    const options = {
      sort: 'RECOMMENDED' as const,
      userLocation: { lat: 45.5152, lng: -122.6784 },
    };

    expect(rankEventSearchCandidates(rows, options).map((event) => event.id)).toEqual(
      rankEventSearchCandidates(rows, options).map((event) => event.id),
    );
  });
});
