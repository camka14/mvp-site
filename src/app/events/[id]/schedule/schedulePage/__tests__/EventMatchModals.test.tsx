import type { Event } from '@/types';

import { getMatchEditorDivisions } from '../EventMatchModals';

describe('getMatchEditorDivisions', () => {
  it('uses hydrated division names when the event division list contains only ids', () => {
    const event = {
      divisions: ['event_1__division__m_skill_open_age_16plus'],
      divisionDetails: [
        {
          id: 'event_1__division__m_skill_open_age_16plus',
          name: 'Men\'s Open 16+',
        },
      ],
    } as Event;

    expect(getMatchEditorDivisions(event)).toEqual([
      {
        id: 'event_1__division__m_skill_open_age_16plus',
        name: 'Men\'s Open 16+',
      },
    ]);
  });

  it('includes playoff details and ignores raw id entries', () => {
    const playoffDivision = {
      id: 'event_1__division__playoff_gold',
      name: 'Gold Bracket',
    };
    const event = {
      divisions: ['event_1__division__playoff_gold', 'event_1__division__missing'],
      playoffDivisionDetails: [playoffDivision],
    } as Event;

    expect(getMatchEditorDivisions(event)).toEqual([playoffDivision]);
  });
});
