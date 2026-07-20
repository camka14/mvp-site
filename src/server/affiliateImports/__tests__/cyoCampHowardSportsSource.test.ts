import { parseAffiliateScrapeMapping } from '../types';
import {
  CYO_CAMP_HOWARD_ADDRESS,
  CYO_CAMP_HOWARD_BOYS_VOLLEYBALL_URL,
  CYO_CAMP_HOWARD_LOGO_SOURCE_URL,
  CYO_CAMP_HOWARD_MANUAL_CANDIDATES,
  CYO_CAMP_HOWARD_MAPPING,
  CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL,
} from '../cyoCampHowardSportsSource';

describe('CYO / Camp Howard Sports affiliate source', () => {
  it('creates one ongoing organization listing without inventing an event or team', () => {
    const mapping = parseAffiliateScrapeMapping(CYO_CAMP_HOWARD_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'CYO / Camp Howard Sports',
      officialActionUrl: CYO_CAMP_HOWARD_SPORTS_REGISTRATION_URL,
      address: CYO_CAMP_HOWARD_ADDRESS,
      dateDisplayMode: 'ONGOING',
      tags: ['Club'],
    }));
    expect(candidates.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('keeps the open-but-undated boys volleyball season visible for review instead of publishing it as an event', () => {
    const candidate = CYO_CAMP_HOWARD_MANUAL_CANDIDATES[0];

    expect(candidate.participantOptionsText).toContain('official CYO Sports registration hub');
    expect(candidate.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('2026-27 boys volleyball portal'),
      expect.stringContaining('No TEAM candidates'),
    ]));
    expect(CYO_CAMP_HOWARD_BOYS_VOLLEYBALL_URL).toContain('CYO-Boys-Volleyball-Portal-2627');
    expect(CYO_CAMP_HOWARD_LOGO_SOURCE_URL).toContain('47a89.png');
  });
});
