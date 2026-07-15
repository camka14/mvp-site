import { buildSportSkillFilterOptions } from '../DivisionDiscoveryFilters';

const groups = [
  {
    sportId: 'Grass Soccer',
    sportName: 'Grass Soccer',
    skills: [
      { id: 'premier', name: 'Premier' },
      { id: 'open', name: 'Open' },
    ],
  },
  {
    sportId: 'Indoor Volleyball',
    sportName: 'Indoor Volleyball',
    skills: [
      { id: 'aa', name: 'AA' },
      { id: 'open', name: 'Open' },
    ],
  },
];

describe('buildSportSkillFilterOptions', () => {
  it('only returns skills for the selected sport', () => {
    expect(buildSportSkillFilterOptions(groups, ['Grass Soccer'])).toEqual([
      { value: 'open', label: 'Open' },
      { value: 'premier', label: 'Premier' },
    ]);
  });

  it('labels and sorts skills by their sports when multiple sports are selected', () => {
    expect(buildSportSkillFilterOptions(groups, ['Indoor Volleyball', 'Grass Soccer'])).toEqual([
      { value: 'open', label: 'Grass Soccer, Indoor Volleyball · Open' },
      { value: 'premier', label: 'Grass Soccer · Premier' },
      { value: 'aa', label: 'Indoor Volleyball · AA' },
    ]);
  });
});
