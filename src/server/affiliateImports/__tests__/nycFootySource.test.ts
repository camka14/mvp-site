import { parseAffiliateScrapeMapping } from '../types';
import {
  NYC_FOOTY_LOGO_SOURCE_URL,
  NYC_FOOTY_MANUAL_CANDIDATES,
  NYC_FOOTY_MAPPING,
  NYC_FOOTY_SOURCE_EVIDENCE,
} from '../nycFootySource';

describe('NYC Footy affiliate source', () => {
  it('emits one ongoing CLUB candidate and withholds incomplete season rows', () => {
    expect(parseAffiliateScrapeMapping(NYC_FOOTY_MAPPING).kind).toBe('CLUB');
    expect(NYC_FOOTY_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'NYC Footy',
        officialActionUrl: 'https://www.nycfooty.com/register-for-leagues',
        dateDisplayMode: 'ONGOING',
        city: 'New York City metro area',
      }),
    ]);
    expect(NYC_FOOTY_MANUAL_CANDIDATES[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Fall Registration is Open')]),
    );
    expect(NYC_FOOTY_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(NYC_FOOTY_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'RENTAL')).toBe(false);
  });

  it('preserves stored provenance and the official NYC Footy logo source', () => {
    expect(NYC_FOOTY_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: '2ebbf184-937c-4637-a414-ce45abe31ec4',
        runId: 'aada2f6f-c390-4f66-b061-a372b7e78cfd',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NYC_FOOTY_SOURCE_EVIDENCE.artifacts.logoCandidates.primary).toBe(
      'dc563d4d5bce2935d47476fdf3dd6be898a4afb7a891766612724fad69759ca7',
    );
    expect(NYC_FOOTY_LOGO_SOURCE_URL).toContain('NYC-Footy_Final-Logo_With-Text_2022_Shrunk_White.png');
  });
});
