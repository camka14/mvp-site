import { buildDivisionDisplayNameIndex, resolveDivisionDisplayName } from '@/lib/divisionDisplay';

describe('resolveDivisionDisplayName', () => {
  it('resolves division name from divisionDetails by id', () => {
    const divisionDetails = [
      {
        id: 'evt_1__division__c_skill_open',
        key: 'c_skill_open',
        name: 'Gold',
      },
    ];
    const index = buildDivisionDisplayNameIndex(divisionDetails);

    expect(resolveDivisionDisplayName({
      division: 'evt_1__division__c_skill_open',
      divisionNameIndex: index,
      sportInput: 'volleyball',
    })).toBe('Gold');
  });

  it('resolves division name from divisionDetails by token', () => {
    const divisionDetails = [
      {
        id: 'evt_1__division__c_skill_open',
        key: 'c_skill_open',
        name: 'Gold',
      },
    ];
    const index = buildDivisionDisplayNameIndex(divisionDetails);

    expect(resolveDivisionDisplayName({
      division: 'c_skill_open',
      divisionNameIndex: index,
      sportInput: 'volleyball',
    })).toBe('Gold');
  });

  it('falls back to inferred label when divisionDetails cannot resolve', () => {
    const index = buildDivisionDisplayNameIndex([]);

    expect(resolveDivisionDisplayName({
      division: 'open',
      divisionNameIndex: index,
      sportInput: 'volleyball',
    })).toBe('CoEd Open 18+');
  });

  it('uses simple pool labels for generated tournament pool rows', () => {
    const bracketId = 'evt_1__division__c_skill_open_age_18plus';
    const pool = {
      id: `${bracketId}_pool_a`,
      key: 'c_skill_open_age_18plus_pool_a',
      name: 'Open 18+ Pool A',
      playoffPlacementDivisionIds: [bracketId],
    };
    const index = buildDivisionDisplayNameIndex([pool]);

    expect(resolveDivisionDisplayName({
      division: pool as any,
      divisionNameIndex: index,
      sportInput: 'volleyball',
    })).toBe('Pool A');
    expect(resolveDivisionDisplayName({
      division: `${bracketId}_pool_a`,
      divisionNameIndex: index,
      sportInput: 'volleyball',
    })).toBe('Pool A');
  });

  it('cleans legacy metadata names before falling back to inferred labels', () => {
    expect(resolveDivisionDisplayName({
      division: {
        id: 'evt_1__division__c_skill_bb_age_18plus',
        key: 'c_skill_bb_age_18plus',
        name: 'CoEd Skill BB AGE 18plus',
      } as any,
      divisionDetails: [],
      sportInput: 'volleyball',
    })).toBe('CoEd BB 18+');
  });
});

