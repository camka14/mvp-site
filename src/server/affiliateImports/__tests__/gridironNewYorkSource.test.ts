/** @jest-environment node */

import {
  GRIDIRON_NEW_YORK_MANUAL_CANDIDATES,
  GRIDIRON_NEW_YORK_MAPPING,
} from '@/server/affiliateImports/gridironNewYorkSource';
import { parseAffiliateScrapeMapping } from '@/server/affiliateImports/types';

describe('Gridiron New York affiliate source', () => {
  it('keeps the source as an ongoing club while source dates omit a year', () => {
    expect(parseAffiliateScrapeMapping(GRIDIRON_NEW_YORK_MAPPING)).toEqual(GRIDIRON_NEW_YORK_MAPPING);
    expect(GRIDIRON_NEW_YORK_MANUAL_CANDIDATES).toHaveLength(1);
    expect(GRIDIRON_NEW_YORK_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      dateDisplayMode: 'ONGOING',
      sportName: 'Football',
      officialActionUrl: 'https://portal.gridironfb.com/',
    }));
    expect(GRIDIRON_NEW_YORK_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('does not state a year'),
      expect.stringContaining('without a year'),
      expect.stringContaining('geocoding path returned no coordinates'),
    ]));
  });
});
