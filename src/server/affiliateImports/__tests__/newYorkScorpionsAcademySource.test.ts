import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  NEW_YORK_SCORPIONS_ACADEMY_URL,
  NEW_YORK_SCORPIONS_MAPPING,
  NEW_YORK_SCORPIONS_SOURCE_EVIDENCE,
  NEW_YORK_SCORPIONS_STATIC_PAGE_CLIENT,
} from '../newYorkScorpionsAcademySource';

describe('New York Scorpions Academy source', () => {
  it('emits one ongoing academy club and withholds month-range inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(NEW_YORK_SCORPIONS_MAPPING);
    const page = await NEW_YORK_SCORPIONS_STATIC_PAGE_CLIENT.fetchPage({ url: NEW_YORK_SCORPIONS_ACADEMY_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'New York Scorpions Academy',
      sportName: 'Baseball',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(NEW_YORK_SCORPIONS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '0184d532-1c5b-431c-a62f-f90b0582ebbe',
      runId: 'd1344a0f-e4c0-41f9-ac6d-e1140d887136',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(NEW_YORK_SCORPIONS_MAPPING);
    const first = await NEW_YORK_SCORPIONS_STATIC_PAGE_CLIENT.fetchPage({ url: NEW_YORK_SCORPIONS_ACADEMY_URL });
    const second = await NEW_YORK_SCORPIONS_STATIC_PAGE_CLIENT.fetchPage({ url: NEW_YORK_SCORPIONS_ACADEMY_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
