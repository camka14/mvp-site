import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  PRODIGY_VOLLEYBALL_HOME_URL,
  PRODIGY_VOLLEYBALL_MAPPING,
  PRODIGY_VOLLEYBALL_SOURCE_EVIDENCE,
  PRODIGY_VOLLEYBALL_STATIC_PAGE_CLIENT,
} from '../prodigyVolleyballAcademySource';

describe('Prodigy Volleyball Academy source', () => {
  it('emits one ongoing club and withholds unchecked program inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(PRODIGY_VOLLEYBALL_MAPPING);
    const page = await PRODIGY_VOLLEYBALL_STATIC_PAGE_CLIENT.fetchPage({ url: PRODIGY_VOLLEYBALL_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Prodigy Volleyball Academy',
      officialActionUrl: PRODIGY_VOLLEYBALL_HOME_URL,
      sportName: 'Volleyball',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(PRODIGY_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '7af705c5-abfe-4ac0-bbdf-2d610ab0d74f',
      runId: '08d32120-f818-4eb0-9c0f-3053964da7ad',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(PRODIGY_VOLLEYBALL_MAPPING);
    const first = await PRODIGY_VOLLEYBALL_STATIC_PAGE_CLIENT.fetchPage({ url: PRODIGY_VOLLEYBALL_HOME_URL });
    const second = await PRODIGY_VOLLEYBALL_STATIC_PAGE_CLIENT.fetchPage({ url: PRODIGY_VOLLEYBALL_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
