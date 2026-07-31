import { parseAffiliateScrapeMapping } from '../types';
import { DISCNY_EVENT_CANDIDATES, DISCNY_MANUAL_CANDIDATES, DISCNY_MAPPING, DISCNY_SOURCE_EVIDENCE } from '../discnyAllEventsSource';

describe('DiscNY all-events affiliate source', () => {
  it('emits one CLUB and the twelve visible current/future EVENT rows', () => {
    expect(parseAffiliateScrapeMapping(DISCNY_MAPPING).kind).toBe('EVENT');
    expect(DISCNY_EVENT_CANDIDATES).toHaveLength(12);
    expect(DISCNY_MANUAL_CANDIDATES.filter((candidate) => candidate.listingKind === 'CLUB')).toHaveLength(1);
    expect(DISCNY_EVENT_CANDIDATES.every((candidate) => candidate.listingKind === 'EVENT' && candidate.dateDisplayMode === 'NO_FIXED_DATE')).toBe(true);
    expect(DISCNY_EVENT_CANDIDATES.find((candidate) => candidate.title.startsWith('Manhattan Beginner'))).toEqual(expect.objectContaining({
      venueName: 'Gansevoort Field',
      priceText: expect.stringContaining('$160'),
      scheduleText: expect.stringContaining('7:00–8:30 PM'),
    }));
  });

  it('preserves stored provenance and withheld-row limits', () => {
    expect(DISCNY_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'a77c7e76-eed4-4050-adbb-83cb5a465f06',
      runId: 'd110bf4a-0b10-427b-b93c-167fcd35aa86',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(DISCNY_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 3 },
      { kind: 'PAGE_MARKDOWN', count: 2 },
      { kind: 'ROBOTS', count: 2 },
    ]));
    expect(DISCNY_MANUAL_CANDIDATES).toHaveLength(13);
  });
});
