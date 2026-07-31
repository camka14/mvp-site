import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  ENY_ODP_MAPPING,
  ENY_ODP_SOURCE_EVIDENCE,
  ENY_ODP_STATIC_PAGE_CLIENT,
  ENY_ODP_TRYOUTS_URL,
} from '../easternNewYorkYouthSoccerSource';

describe('Eastern New York ODP source', () => {
  it('emits the club and four future tryout events while withholding past and announced-later rows', async () => {
    const mapping = parseAffiliateScrapeMapping(ENY_ODP_MAPPING);
    const page = await ENY_ODP_STATIC_PAGE_CLIENT.fetchPage({ url: ENY_ODP_TRYOUTS_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(5);
    expect(candidates[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'Eastern New York Youth Soccer Association ODP' }));
    expect(candidates.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ listingKind: 'EVENT', title: 'Eastern New York ODP North Round One Tryout — Capelli Sports Complex', dateDisplayMode: 'SCHEDULED' }),
      expect.objectContaining({ listingKind: 'EVENT', title: 'Eastern New York ODP North Round One Tryout — Saxon Wood Fields', dateDisplayMode: 'SCHEDULED' }),
      expect.objectContaining({ listingKind: 'EVENT', title: 'Eastern New York ODP North Round One Tryout — Accelerate Sports Complex', dateDisplayMode: 'SCHEDULED' }),
      expect.objectContaining({ listingKind: 'EVENT', title: 'Eastern New York ODP North Round One Tryout — Wright National Soccer Campus', dateDisplayMode: 'SCHEDULED' }),
    ]));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(ENY_ODP_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '17cbcda0-9c14-432e-9db4-900dd0b58e01',
      runId: 'e70f566f-9d10-43ed-9dba-4e4001a56ed3',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(ENY_ODP_MAPPING);
    const first = await ENY_ODP_STATIC_PAGE_CLIENT.fetchPage({ url: ENY_ODP_TRYOUTS_URL });
    const second = await ENY_ODP_STATIC_PAGE_CLIENT.fetchPage({ url: ENY_ODP_TRYOUTS_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
