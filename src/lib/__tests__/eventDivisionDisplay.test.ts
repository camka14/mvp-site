import { buildEvent } from '../../../test/factories';
import { buildEventDivisionCardLabel, buildEventDivisionDisplayLabels } from '../eventDivisionDisplay';

describe('buildEventDivisionDisplayLabels', () => {
  it('shows bracket divisions instead of generated pools for tournament pool play', () => {
    const bracketId = 'event_pool__division__c_skill_open_age_18plus';
    const poolA = `${bracketId}_pool_a`;
    const poolB = `${bracketId}_pool_b`;
    const event = buildEvent({
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      divisions: [poolA, poolB],
      divisionDetails: [
        {
          id: poolA,
          key: 'c_skill_open_age_18plus_pool_a',
          name: 'CoEd Open 18+ Pool A',
          playoffPlacementDivisionIds: [bracketId],
        },
        {
          id: poolB,
          key: 'c_skill_open_age_18plus_pool_b',
          name: 'CoEd Open 18+ Pool B',
          playoffPlacementDivisionIds: [bracketId],
        },
      ] as any,
      playoffDivisionDetails: [
        {
          id: bracketId,
          key: 'c_skill_open_age_18plus',
          kind: 'PLAYOFF',
          name: 'CoEd Open 18+',
        },
      ] as any,
    });

    expect(buildEventDivisionDisplayLabels(event)).toEqual(['CoEd Open 18+']);
  });

  it('infers bracket division labels when generated pools have simple pool names', () => {
    const bracketId = 'event_pool__division__c_skill_open_age_18plus';
    const poolA = `${bracketId}_pool_a`;
    const poolB = `${bracketId}_pool_b`;
    const event = buildEvent({
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      includePlayoffsOrPools: true,
      divisions: [poolA, poolB],
      divisionDetails: [
        {
          id: poolA,
          key: 'c_skill_open_age_18plus_pool_a',
          name: 'Pool A',
          playoffPlacementDivisionIds: [bracketId],
        },
        {
          id: poolB,
          key: 'c_skill_open_age_18plus_pool_b',
          name: 'Pool B',
          playoffPlacementDivisionIds: [bracketId],
        },
      ] as any,
      playoffDivisionDetails: [],
    });

    expect(buildEventDivisionDisplayLabels(event)).toEqual(['CoEd Open 18+']);
  });

  it('shows league divisions instead of playoff divisions for league playoffs', () => {
    const event = buildEvent({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      divisions: ['league_open', 'playoff_gold'],
      divisionDetails: [
        {
          id: 'league_open',
          key: 'league_open',
          name: 'Open League',
          playoffPlacementDivisionIds: ['playoff_gold'],
        },
        {
          id: 'playoff_gold',
          key: 'playoff_gold',
          kind: 'PLAYOFF',
          name: 'Gold Playoff',
        },
      ] as any,
    });

    expect(buildEventDivisionDisplayLabels(event)).toEqual(['Open League']);
  });
});

describe('buildEventDivisionCardLabel', () => {
  it('keeps explicit labels for two divisions', () => {
    const event = buildEvent({
      divisions: ['division_a', 'division_b'],
      divisionDetails: [
        { id: 'division_a', name: 'Girls U12' },
        { id: 'division_b', name: 'Girls U14' },
      ] as any,
    });

    expect(buildEventDivisionCardLabel(event)).toBe('Girls U12, Girls U14');
  });

  it('shows gender age skill ranges and the canonical count', () => {
    const divisionDetails = ['M', 'F'].flatMap((gender) => (
      ['u6', 'u18'].flatMap((age) => (
        ['recreational', 'premier'].map((skill) => {
          const id = `${gender.toLowerCase()}_skill_${skill}_age_${age}`;
          return {
            id,
            key: id,
            name: `${gender} ${skill} ${age}`,
            gender,
            ageDivisionTypeId: age,
            skillDivisionTypeId: skill,
          };
        })
      ))
    ));
    const event = buildEvent({
      divisions: divisionDetails.map((division) => division.id),
      divisionDetails: divisionDetails as any,
    });

    expect(buildEventDivisionCardLabel(event)).toBe(
      'Men/Women · U6–U18 · Rec–Premier · 8 divisions',
    );
  });

  it('normalizes age-only affiliate division names into an age range', () => {
    const event = buildEvent({
      divisions: ['c_u16', 'c_u14', 'c_u9'],
      divisionDetails: [
        { id: 'c_u16', name: '16U', gender: 'C' },
        { id: 'c_u14', name: '14U', gender: 'C' },
        { id: 'c_u9', name: '9U', gender: 'C' },
      ] as any,
    });

    expect(buildEventDivisionCardLabel(event)).toBe('Coed · U9–U16 · 3 divisions');
  });

  it('preserves explicit skill labels when division names only contain ages', () => {
    const event = buildEvent({
      divisions: ['14u', '16u', '18u'],
      divisionDetails: [
        { id: '14u', name: '14U', skillDivisionTypeName: 'Beginner' },
        { id: '16u', name: '16U', skillDivisionTypeName: 'Intermediate' },
        { id: '18u', name: '18U', skillDivisionTypeName: 'Advanced' },
      ] as any,
    });

    expect(buildEventDivisionCardLabel(event)).toBe(
      'U14–U18 · Beginner–Advanced · 3 divisions',
    );
  });
});
