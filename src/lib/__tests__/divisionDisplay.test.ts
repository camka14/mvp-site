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
    })).toBe('CoEd Open');
  });
});

