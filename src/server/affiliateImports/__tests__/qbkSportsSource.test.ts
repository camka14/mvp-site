import { parseAffiliateScrapeMapping } from '../types';
import {
  QBK_SPORTS_COURT_BOOKING_URL,
  QBK_SPORTS_MAPPING,
  QBK_SPORTS_MANUAL_CANDIDATES,
  QBK_SPORTS_SOURCE_EVIDENCE,
} from '../qbkSportsSource';

describe('QBK Sports affiliate source', () => {
  it('emits one ongoing CLUB and one ongoing RENTAL candidate without TEAM rows', () => {
    expect(parseAffiliateScrapeMapping(QBK_SPORTS_MAPPING).kind).toBe('CLUB');
    expect(QBK_SPORTS_MANUAL_CANDIDATES).toEqual(expect.arrayContaining([
      expect.objectContaining({ listingKind: 'CLUB', title: 'QBK Sports', dateDisplayMode: 'ONGOING' }),
      expect.objectContaining({ listingKind: 'RENTAL', officialActionUrl: QBK_SPORTS_COURT_BOOKING_URL, dateDisplayMode: 'ONGOING' }),
    ]));
    expect(QBK_SPORTS_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and the official-logo evidence', () => {
    expect(QBK_SPORTS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'b454276d-5f6f-4130-834c-ae6865f8d9a5',
      runId: 'fe966324-19d8-408b-84d7-0bf2cf5553d8',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(QBK_SPORTS_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 29 },
      { kind: 'PAGE_MARKDOWN', count: 10 },
      { kind: 'ROBOTS', count: 10 },
    ]));
  });
});
