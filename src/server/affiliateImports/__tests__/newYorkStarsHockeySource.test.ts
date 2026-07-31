import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  NEW_YORK_STARS_HOCKEY_HOME_URL,
  NEW_YORK_STARS_HOCKEY_MAPPING,
  NEW_YORK_STARS_HOCKEY_SOURCE_EVIDENCE,
  NEW_YORK_STARS_HOCKEY_STATIC_PAGE_CLIENT,
} from '../newYorkStarsHockeySource';

describe('New York Stars Hockey source', () => {
  it('emits one ongoing club and withholds yearless schedule rows', async () => {
    const mapping = parseAffiliateScrapeMapping(NEW_YORK_STARS_HOCKEY_MAPPING);
    const page = await NEW_YORK_STARS_HOCKEY_STATIC_PAGE_CLIENT.fetchPage({ url: NEW_YORK_STARS_HOCKEY_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'New York Stars Hockey',
      city: 'Brooklyn, NY',
      sportName: 'Ice Hockey',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(NEW_YORK_STARS_HOCKEY_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'bce99276-fd32-4050-980c-3748f698ac2d',
      runId: 'ca50c6ed-3af7-4a7d-8edc-fef2ff064774',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(NEW_YORK_STARS_HOCKEY_MAPPING);
    const first = await NEW_YORK_STARS_HOCKEY_STATIC_PAGE_CLIENT.fetchPage({ url: NEW_YORK_STARS_HOCKEY_HOME_URL });
    const second = await NEW_YORK_STARS_HOCKEY_STATIC_PAGE_CLIENT.fetchPage({ url: NEW_YORK_STARS_HOCKEY_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
