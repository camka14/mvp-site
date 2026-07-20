import { parseAffiliateScrapeMapping } from '../types';
import {
  PSB_PORTLAND_LOGO_SOURCE_URL,
  PSB_PORTLAND_MAPPING,
  PSB_PORTLAND_MANUAL_CANDIDATES,
  PSB_PORTLAND_VENUE_ADDRESS,
} from '../proSkillsBasketballPortlandSource';

describe('Pro Skills Basketball Portland Teams affiliate source', () => {
  it('keeps the public club and only future dated tryouts', () => {
    const mapping = parseAffiliateScrapeMapping(PSB_PORTLAND_MAPPING);
    const candidates = mapping.manualCandidates ?? [];
    const clubs = candidates.filter((candidate) => candidate.listingKind === 'CLUB');
    const events = candidates.filter((candidate) => candidate.listingKind === 'EVENT');

    expect(mapping.kind).toBe('CLUB');
    expect(candidates).toHaveLength(7);
    expect(clubs).toHaveLength(1);
    expect(events).toHaveLength(6);
    expect(candidates.every((candidate) => candidate.listingKind !== 'TEAM')).toBe(true);
    expect(candidates.some((candidate) => candidate.title.includes('Interest Form'))).toBe(false);
    expect(events.every((candidate) => candidate.startsAt?.startsWith('2026-08-22'))).toBe(true);
    expect(events.every((candidate) => candidate.dateDisplayText === 'August 22-23, 2026')).toBe(true);
  });

  it('preserves official action URLs, venue details, prices, genders, and source logo handoff', () => {
    const candidates = PSB_PORTLAND_MANUAL_CANDIDATES;
    const events = candidates.filter((candidate) => candidate.listingKind === 'EVENT');

    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      officialActionUrl: 'https://proskillsbasketball.com/portland/teams/',
      dateDisplayMode: 'ONGOING',
    }));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 2nd- 4th',
        officialActionUrl: expect.stringContaining('/events/5033390-'),
        venueName: 'Lake Oswego High School Field House',
        address: PSB_PORTLAND_VENUE_ADDRESS,
        skillLevel: null,
        priceText: '$30',
        divisions: [expect.objectContaining({ gender: 'M', skillDivisionTypeId: 'open', ageCutoffLabel: 'Grades 2nd-4th', priceCents: 3000 })],
      }),
      expect.objectContaining({
        title: '2026 Portland Girls Fall Club Team Tryouts/Evaluations- Grades 9th- 11th',
        officialActionUrl: expect.stringContaining('/events/5033429-'),
        divisions: [expect.objectContaining({ gender: 'F', ageCutoffLabel: 'Grades 9th-11th', priceCents: 3000 })],
      }),
    ]));
    expect(candidates.every((candidate) => !candidate.logoUrl && !candidate.logoSourceUrl)).toBe(true);
    expect(PSB_PORTLAND_LOGO_SOURCE_URL).toBe(
      'https://proskillsbasketball.com/wp-content/uploads/2021/10/proskills_logo_web_2x.png',
    );
  });

  it('uses stable dedupe fields for repeatable local runs', () => {
    expect(PSB_PORTLAND_MAPPING.dedupe?.fields).toEqual(['officialActionUrl', 'title', 'startsAt']);
    expect(PSB_PORTLAND_MANUAL_CANDIDATES.map((candidate) => `${candidate.title}|${candidate.startsAt ?? ''}`)).toEqual([
      'Pro Skills Basketball Portland|',
      '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 2nd- 4th|2026-08-22T09:00:00-07:00',
      '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 5th- 6th|2026-08-22T09:00:00-07:00',
      '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 7th- 8th|2026-08-22T10:30:00-07:00',
      '2026 Portland Boys Fall Club Team Tryouts/Evaluations- Grades 9th- 11th|2026-08-22T12:00:00-07:00',
      '2026 Portland Girls Fall Club Team Tryouts/Evaluations- Grades 5th- 8th|2026-08-22T13:45:00-07:00',
      '2026 Portland Girls Fall Club Team Tryouts/Evaluations- Grades 9th- 11th|2026-08-22T13:45:00-07:00',
    ]);
  });
});
