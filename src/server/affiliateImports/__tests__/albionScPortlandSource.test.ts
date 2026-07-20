import type { AffiliateScrapeMapping } from '../types';
import {
  ALBION_SC_PORTLAND_INTAKE_REFRESH_PAGES,
  ALBION_SC_PORTLAND_SOURCE_EVIDENCE,
  selectFutureAlbionCandidates,
} from '../albionScPortlandSource';

type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

const candidate = (title: string, startsAt: string | null): ManualCandidate => ({
  listingKind: 'EVENT',
  title,
  officialActionUrl: 'https://www.albionscportland.org/',
  sourceUrl: 'https://www.albionscportland.org/',
  startsAt,
});

describe('Albion SC Portland affiliate source', () => {
  it('keeps only source-dated events that start in the future', () => {
    const selected = selectFutureAlbionCandidates(
      [
        candidate('Past camp', '2026-07-14T09:00:00-07:00'),
        candidate('Closed registration', '2026-08-10T09:00:00-07:00'),
        candidate('Future camp', '2026-07-27T09:00:00-07:00'),
        candidate('Missing date', null),
        candidate('Invalid date', 'not-a-date'),
      ],
      new Date('2026-07-19T12:00:00-07:00'),
      { 'Closed registration': '2026-07-15T23:59:59-07:00' },
    );

    expect(selected.map((row) => row.title)).toEqual(['Future camp']);
  });

  it('records the exact live intake and the detail pages that need refresh', () => {
    expect(ALBION_SC_PORTLAND_SOURCE_EVIDENCE).toMatchObject({
      intakeSourceKey: 'site-albionscportland-org',
      runId: '938c9063-f10c-484b-87de-146955006ce2',
      provider: 'FIRECRAWL',
      runStatus: 'SUCCEEDED',
    });
    expect(ALBION_SC_PORTLAND_SOURCE_EVIDENCE.pages).toEqual([
      expect.objectContaining({
        url: 'https://www.albionscportland.org/',
        robotsStatus: 'ALLOWED',
      }),
    ]);
    expect(ALBION_SC_PORTLAND_INTAKE_REFRESH_PAGES).toContain(
      'https://www.albionscportland.org/juniors/juniors-camps/albion-portland-summer-camps',
    );
  });
});
