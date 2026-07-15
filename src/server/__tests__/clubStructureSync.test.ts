import {
  buildClubStructurePlan,
  isReviewedTryoutEvent,
  normalizeLegacyClubDivision,
  resolveStrictClubSkillId,
  type ClubEventSyncRow,
  type LegacyClubDivisionRow,
} from '@/server/clubStructureSync';

const event = (overrides: Partial<ClubEventSyncRow> = {}): ClubEventSyncRow => ({
  id: 'event-1',
  organizationId: 'org-1',
  name: 'Girls U14 Tryouts',
  eventType: 'EVENT',
  sourceUrl: 'https://club.example/tryouts',
  affiliateUrl: 'https://club.example/register',
  sportId: 'Indoor Volleyball',
  start: '2026-11-01T17:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  tagSlugs: ['tryouts'],
  ...overrides,
});

const division = (overrides: Partial<LegacyClubDivisionRow> = {}): LegacyClubDivisionRow => ({
  id: 'division-1',
  eventId: 'event-1',
  name: 'Girls U14',
  key: 'f_u14',
  sportId: 'Indoor Volleyball',
  price: 2500,
  maxParticipants: null,
  divisionTypeId: 'u14',
  ratingType: 'AGE',
  gender: 'F',
  ...overrides,
});

describe('clubStructureSync', () => {
  it('classifies title and source-page tryouts without trusting an incorrect tag alone', () => {
    expect(isReviewedTryoutEvent(event())).toBe(true);
    expect(isReviewedTryoutEvent(event({ name: 'Ready to Compete?', sourceUrl: 'https://club.example/tryouts' }))).toBe(true);
    expect(isReviewedTryoutEvent(event({
      name: 'Fall Recreational Soccer',
      eventType: 'LEAGUE',
      sourceUrl: 'https://club.example/rec',
      tagSlugs: ['tryouts'],
    }))).toBe(false);
    expect(isReviewedTryoutEvent(event({
      name: 'Junior Academy',
      sourceUrl: 'https://club.example/fall-junior-academy',
      affiliateUrl: 'https://registration.example/tryouts/signup',
      tagSlugs: ['clinic'],
    }))).toBe(false);
  });

  it('normalizes legacy age divisions into explicit skill and age ids', () => {
    expect(normalizeLegacyClubDivision(division())).toEqual(expect.objectContaining({
      gender: 'F',
      ratingType: 'SKILL',
      skillDivisionTypeId: 'open',
      ageDivisionTypeId: 'u14',
      divisionTypeId: 'skill_open_age_u14',
      key: 'f_skill_open_age_u14',
    }));
    expect(normalizeLegacyClubDivision(division({
      name: 'Coed 12U-14U',
      key: 'c_12u_14u',
      divisionTypeId: 'youth',
      gender: 'C',
    }))).toEqual(expect.objectContaining({ ageDivisionTypeId: 'u14' }));
  });

  it('keeps custom division names while resolving strict sport skill ids', () => {
    expect(normalizeLegacyClubDivision(division({
      name: 'Girls Advanced Competition Group U16',
      divisionTypeId: 'girls_advanced_competition_group_u16',
      skillDivisionTypeId: 'advanced_and_competition_focused',
      ageDivisionTypeId: 'u16',
    }))).toEqual(expect.objectContaining({
      name: 'Girls Advanced Competition Group U16',
      skillDivisionTypeId: 'competitive',
      ageDivisionTypeId: 'u16',
    }));

    expect(resolveStrictClubSkillId({
      sportId: 'Indoor Volleyball',
      candidate: 'custom-premier-pathway',
      divisionName: '14 Premier',
    })).toBe('premier');
    expect(resolveStrictClubSkillId({
      sportId: 'Indoor Soccer',
      candidate: 'coed',
      divisionName: 'Adult Coed League',
    })).toBe('open');
    expect(resolveStrictClubSkillId({
      sportId: 'Other',
      candidate: 'beginner_and_intermediate',
      divisionName: 'Beginner and Intermediate Academy',
    })).toBe('open');
    expect(resolveStrictClubSkillId({
      sportId: 'Indoor Volleyball',
      candidate: 'first_team',
      divisionName: 'Vancouver 14.1',
    })).toBe('open');
  });

  it('keeps custom division names as separate tiers when their strict filters match', () => {
    const plan = buildClubStructurePlan(
      [event()],
      [
        division({
          id: 'division-14-1',
          name: 'Girls 14-1',
          skillDivisionTypeId: 'competitive',
          ageDivisionTypeId: 'u14',
        }),
        division({
          id: 'division-14-2',
          name: 'Girls 14-2',
          skillDivisionTypeId: 'competitive',
          ageDivisionTypeId: 'u14',
        }),
      ],
    );

    expect(plan.organizationDivisions).toHaveLength(2);
    expect(plan.organizationDivisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Girls 14-1', skillDivisionTypeId: 'competitive' }),
      expect.objectContaining({ name: 'Girls 14-2', skillDivisionTypeId: 'competitive' }),
    ]));
    expect(plan.organizationDivisions[0].id).not.toBe(plan.organizationDivisions[1].id);
  });

  it('uses a non-tryout division price for season dues and links the tryout snapshot', () => {
    const tryout = event();
    const season = event({
      id: 'season-event',
      name: 'Girls U14 Club Season',
      eventType: 'LEAGUE',
      sourceUrl: 'https://club.example/u14',
      affiliateUrl: 'https://club.example/u14/register',
      updatedAt: '2026-07-05T00:00:00.000Z',
      tagSlugs: ['league'],
    });
    const plan = buildClubStructurePlan(
      [tryout, season],
      [division(), division({ id: 'season-division', eventId: season.id, price: 180000 })],
    );

    expect(plan.tryoutEventIds).toEqual(['event-1']);
    expect(plan.organizationDivisions).toHaveLength(1);
    expect(plan.organizationDivisions[0]).toEqual(expect.objectContaining({
      price: 180000,
      seasonPriceSourceEventId: 'season-event',
    }));
    expect(plan.sourceDivisionIdByEventDivisionId.get('division-1')).toBe(plan.organizationDivisions[0].id);
  });

  it('keeps an unknown season price null instead of copying the tryout fee', () => {
    const plan = buildClubStructurePlan([event()], [division({ price: 2500 })]);
    expect(plan.organizationDivisions[0].price).toBeNull();
    expect(plan.organizationDivisions[0].description).toContain('Season price is not specified');
  });

  it('does not promote standalone camps or tournaments into club divisions', () => {
    const camp = event({
      id: 'camp-event',
      name: 'Summer Skills Camp',
      sourceUrl: 'https://club.example/camps/summer',
      affiliateUrl: 'https://club.example/camps/summer/register',
      tagSlugs: ['camp'],
    });
    const tournament = event({
      id: 'tournament-event',
      name: 'Summer Cup U14',
      eventType: 'TOURNAMENT',
      sourceUrl: 'https://club.example/tournaments/summer-cup',
      affiliateUrl: 'https://club.example/tournaments/summer-cup/register',
      tagSlugs: ['tournament'],
    });

    const plan = buildClubStructurePlan(
      [camp, tournament],
      [
        division({ id: 'camp-division', eventId: camp.id, price: 17500 }),
        division({ id: 'tournament-division', eventId: tournament.id, price: 69500 }),
      ],
    );

    expect(plan.tryoutEventIds).toEqual([]);
    expect(plan.organizationDivisions).toEqual([]);
    expect(plan.sourceDivisionIdByEventDivisionId.size).toBe(0);
  });
});
