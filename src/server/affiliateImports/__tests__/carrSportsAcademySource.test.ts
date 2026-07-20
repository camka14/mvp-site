import { parseAffiliateScrapeMapping } from '../types';
import {
  CARR_SPORTS_ACADEMY_ADDRESS,
  CARR_SPORTS_ACADEMY_BOOKING_URL,
  CARR_SPORTS_ACADEMY_MANUAL_CANDIDATES,
  CARR_SPORTS_ACADEMY_MAPPING,
  CARR_SPORTS_ACADEMY_WITHHELD_ROWS,
} from '../carrSportsAcademySource';

describe('Carr Sports Academy affiliate source', () => {
  it('creates only reviewed future camp events with official booking URLs', () => {
    const mapping = parseAffiliateScrapeMapping(CARR_SPORTS_ACADEMY_MAPPING);
    const candidates = mapping.manualCandidates ?? [];

    expect(mapping.kind).toBe('EVENT');
    expect(candidates).toHaveLength(5);
    expect(candidates.every((candidate) => candidate.listingKind === 'EVENT')).toBe(true);
    expect(candidates.every((candidate) => candidate.startsAt && new Date(candidate.startsAt) > new Date('2026-07-15T00:00:00-07:00'))).toBe(true);
    expect(candidates.every((candidate) => candidate.officialActionUrl.startsWith('https://www.carrsportsacademy.com/service-page/'))).toBe(true);
  });

  it('preserves source address, schedule, capacity, tags, and division price', () => {
    expect(CARR_SPORTS_ACADEMY_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      address: CARR_SPORTS_ACADEMY_ADDRESS,
      startsAt: '2026-07-20T09:00:00-07:00',
      endsAt: '2026-07-24T12:00:00-07:00',
      tags: ['Camp'],
      divisions: [expect.objectContaining({ priceCents: 29900, maxParticipants: 50 })],
    }));
    expect(CARR_SPORTS_ACADEMY_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(CARR_SPORTS_ACADEMY_BOOKING_URL).toContain('/book-online');
  });

  it('withholds started programs, incomplete venue data, and roster-level teams', () => {
    expect(CARR_SPORTS_ACADEMY_WITHHELD_ROWS).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Youth Summer Tournament Teams Grades 3-8', reason: expect.stringContaining('past') }),
      expect.objectContaining({ title: expect.stringContaining('Tryouts'), reason: expect.stringContaining('SJB') }),
      expect.objectContaining({ title: 'CSA Elite team roster rows', reason: expect.stringContaining('stable roster-level') }),
    ]));
  });
});
