import { buildEvent } from '../../../test/factories';
import { buildEventDivisionDisplayLabels } from '../eventDivisionDisplay';

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
