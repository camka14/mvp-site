import { filterFieldCalendarItems, type FieldCalendarFilterItem } from '../FieldCalendarFilter';
import FieldCalendarFilter from '../FieldCalendarFilter';
import { getIndexedEntityColorPair } from '@/lib/entityColors';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

const items: FieldCalendarFilterItem[] = [
  { id: 'field_1', label: 'Court Alpha', detail: 'North Gym' },
  { id: 'field_2', label: 'Court Beta', detail: 'South Gym' },
  { id: 'pitch_1', label: 'Main Pitch', detail: 'Outdoor' },
];

describe('filterFieldCalendarItems', () => {
  it('returns all items when the query is blank', () => {
    expect(filterFieldCalendarItems(items, '   ')).toBe(items);
  });

  it('matches field labels case-insensitively', () => {
    expect(filterFieldCalendarItems(items, 'court').map((item) => item.id)).toEqual(['field_1', 'field_2']);
  });

  it('matches field details and ids', () => {
    expect(filterFieldCalendarItems(items, 'north').map((item) => item.id)).toEqual(['field_1']);
    expect(filterFieldCalendarItems(items, 'pitch_1').map((item) => item.id)).toEqual(['pitch_1']);
  });

  it('uses ordered reference colors for field swatches', () => {
    const { container } = renderWithMantine(
      <FieldCalendarFilter
        items={[
          { id: 'field_1', label: 'Court Alpha', colorMatchKey: 'field_1' },
          { id: 'field_2', label: 'Court Beta', colorMatchKey: 'field_2' },
        ]}
        selectedIds={['field_1']}
        onSelectedIdsChange={() => undefined}
        colorReferenceList={['field_1', 'field_2']}
      />,
    );

    const swatches = container.querySelectorAll('.field-calendar-filter__swatch');
    expect(swatches[0]).toHaveStyle(`background-color: ${getIndexedEntityColorPair(0).bg}`);
    expect(swatches[1]).toHaveStyle(`background-color: ${getIndexedEntityColorPair(1).bg}`);
  });
});
