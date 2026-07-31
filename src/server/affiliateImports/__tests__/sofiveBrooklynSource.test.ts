import { parseAffiliateScrapeMapping } from '../types';
import { SOFIVE_BROOKLYN_MAPPING, SOFIVE_BROOKLYN_MANUAL_CANDIDATES, SOFIVE_BROOKLYN_SOURCE_EVIDENCE, SOFIVE_BROOKLYN_SOURCE_URL } from '../sofiveBrooklynSource';

describe('Sofive Brooklyn affiliate source', () => {
  it('keeps the partial intake to one ongoing rental candidate', () => {
    expect(parseAffiliateScrapeMapping(SOFIVE_BROOKLYN_MAPPING).kind).toBe('RENTAL');
    expect(SOFIVE_BROOKLYN_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'RENTAL', title: 'Sofive Brooklyn Indoor Soccer Field Rental', officialActionUrl: SOFIVE_BROOKLYN_SOURCE_URL, dateDisplayMode: 'ONGOING' })]);
  });
  it('preserves stored provenance', () => {
    expect(SOFIVE_BROOKLYN_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: 'ec980607-fd14-44a4-8f42-c3de8e281cff', runId: 'e8829750-f248-4e8b-8911-84fb2b36d591', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
  });
});
