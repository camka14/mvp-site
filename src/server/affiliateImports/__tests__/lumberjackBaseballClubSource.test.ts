import { parseAffiliateScrapeMapping } from '../types';
import {
  LUMBERJACK_BASEBALL_CONTACT_URL,
  LUMBERJACK_BASEBALL_LOGO_SOURCE_URL,
  LUMBERJACK_BASEBALL_MANUAL_CANDIDATES,
  LUMBERJACK_BASEBALL_MAPPING,
} from '../lumberjackBaseballClubSource';

describe('Lumberjack Baseball Club affiliate source', () => {
  it('keeps the current public inventory to one ongoing club candidate', () => {
    const mapping = parseAffiliateScrapeMapping(LUMBERJACK_BASEBALL_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Lumberjack Baseball Club',
        officialActionUrl: LUMBERJACK_BASEBALL_CONTACT_URL,
        city: 'Lake Oswego, OR',
        sportName: 'Baseball',
        tags: ['Club'],
        dateDisplayMode: 'ONGOING',
      }),
    ]);
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(candidates.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('keeps source constraints and the official logo handoff explicit', () => {
    const candidate = LUMBERJACK_BASEBALL_MANUAL_CANDIDATES[0];

    expect(LUMBERJACK_BASEBALL_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(candidate.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('does not publish a fixed street address'),
      expect.stringContaining('No EVENT candidates'),
      expect.stringContaining('No TEAM candidates'),
    ]));
    expect(LUMBERJACK_BASEBALL_LOGO_SOURCE_URL).toContain('EMU031029-Lumberjacks-logo.png');
  });
});
