/** @jest-environment node */

import { resolveFieldIdsForCalendarHydration } from '@/app/organizations/[id]/fieldCalendarHydration';
import type { Field } from '@/types';

const field = (id: string): Field => ({
  $id: id,
  name: id,
  location: '',
  fieldNumber: 0,
  lat: 0,
  long: 0,
});

describe('resolveFieldIdsForCalendarHydration', () => {
  it('uses only selected fields for organization field management', () => {
    expect(resolveFieldIdsForCalendarHydration({
      canManage: true,
      fields: [field('field_1'), field('field_2')],
      selectedFieldIds: ['field_2'],
      rentalSelections: [],
    })).toEqual(['field_2']);
  });

  it('uses every visible field for public rental calendars', () => {
    expect(resolveFieldIdsForCalendarHydration({
      canManage: false,
      fields: [field('field_1'), field('field_2')],
      selectedFieldIds: [],
      rentalSelections: [{ scheduledFieldIds: ['field_1'] }],
    })).toEqual(['field_1', 'field_2']);
  });
});
