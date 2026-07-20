import { parseAffiliateScrapeMapping } from '../types';
import {
  CASCADE_GRESHAM_CLUB_AUTOMATION_URL,
  CASCADE_GRESHAM_LOGO_SOURCE_URL,
  CASCADE_GRESHAM_MANUAL_CANDIDATES,
  CASCADE_GRESHAM_MAPPING,
  CASCADE_GRESHAM_SOURCE_EVIDENCE,
  CASCADE_GRESHAM_WITHHELD_ROWS,
} from '../cascadeAthleticClubsGreshamSource';

describe('Cascade Athletic Clubs Gresham affiliate source', () => {
  it('keeps five reviewed programs and one real court-rental link', () => {
    const mapping = parseAffiliateScrapeMapping(CASCADE_GRESHAM_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(candidates).toHaveLength(6);
    expect(candidates.filter((candidate) => candidate.listingKind === 'EVENT')).toHaveLength(5);
    expect(candidates.filter((candidate) => candidate.listingKind === 'RENTAL')).toHaveLength(1);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
    expect(candidates.every((candidate) => candidate.startsAt == null)).toBe(true);
    expect(candidates.every((candidate) => ['NO_FIXED_DATE', 'ONGOING'].includes(candidate.dateDisplayMode ?? ''))).toBe(true);
  });

  it('preserves current source schedules, categories, capacities, and strict divisions', () => {
    expect(CASCADE_GRESHAM_MANUAL_CANDIDATES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Cascade Gresham Men's 4-on-4 Basketball League",
        priceText: '$20-$90',
        tags: ['League'],
        divisions: [expect.objectContaining({ gender: 'M', skillDivisionTypeId: 'rec', ageCutoffLabel: '18+' })],
      }),
      expect.objectContaining({
        title: 'Cascade Gresham Pickleball Leagues',
        officialActionUrl: CASCADE_GRESHAM_CLUB_AUTOMATION_URL,
        maxParticipantsText: '48 players',
        priceText: '$20-$30',
        tags: ['League'],
      }),
      expect.objectContaining({
        title: 'Cascade Gresham Racquetball Singles Open Play',
        dateDisplayText: 'Mondays at 6:30 PM',
        maxParticipantsText: '20 players',
        tags: ['Open Play'],
      }),
      expect.objectContaining({
        title: "Cascade Gresham Men's 4.0 Tennis Doubles Flights",
        dateDisplayText: 'Tuesdays 6:45-8:45 PM; monthly signup',
        divisions: [expect.objectContaining({ gender: 'M', skillDivisionTypeId: '4_0' })],
      }),
    ]));
  });

  it('uses stored live intake provenance and records unsupported rows', () => {
    expect(CASCADE_GRESHAM_SOURCE_EVIDENCE).toMatchObject({
      evidenceSystem: 'AffiliateSourceIntakes',
      environment: 'live',
      intakeSourceKey: 'site-cascadeac-com',
      runId: 'ee59cc84-2887-4530-9ba3-d93f57a7104c',
      runStatus: 'SUCCEEDED',
      provider: 'FIRECRAWL',
    });
    expect(CASCADE_GRESHAM_SOURCE_EVIDENCE.artifactKinds).toContainEqual({ kind: 'PAGE_SCREENSHOT', count: 2 });
    expect(CASCADE_GRESHAM_WITHHELD_ROWS).toHaveLength(4);
    expect(CASCADE_GRESHAM_LOGO_SOURCE_URL).toBe('https://cascadeac.com/wp-content/uploads/2024/04/logo-blue.png');
  });

  it('uses a stable candidate identity for repeat scrapes', () => {
    expect(CASCADE_GRESHAM_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'dateDisplayMode']);
    expect(new Set(CASCADE_GRESHAM_MANUAL_CANDIDATES.map((candidate) => candidate.title)).size).toBe(6);
  });
});
