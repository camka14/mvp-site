import { fireEvent, screen } from '@testing-library/react';
import LeagueFields, { LeagueSlotForm } from '../LeagueFields';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import type { Field } from '@/types';

const field: Field = {
  $id: 'field_1',
  name: 'Court A',
  location: '',
  lat: 0,
  long: 0,
  type: 'indoor',
  fieldNumber: 1,
};

const baseSlot: LeagueSlotForm = {
  key: 'slot-1',
  scheduledFieldId: field.$id,
  dayOfWeek: 1,
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  repeating: true,
  conflicts: [],
  checking: false,
};

const noop = () => {};

describe('LeagueFields', () => {
  it('converts time input to minutes when updating slot', () => {
    const onUpdateSlot = jest.fn();

    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        onLeagueDataChange={noop}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={onUpdateSlot}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    const startTimeInput = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeInput, { target: { value: '10:15' } });

    expect(onUpdateSlot).toHaveBeenCalledWith(0, expect.objectContaining({ startTimeMinutes: 615 }));
  });

  it('toggles repeating flag via switch', () => {
    const onUpdateSlot = jest.fn();

    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        onLeagueDataChange={noop}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={onUpdateSlot}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    const switchInput = screen.getByLabelText(/Repeats weekly/i);
    fireEvent.click(switchInput);

    expect(onUpdateSlot).toHaveBeenCalledWith(0, expect.objectContaining({ repeating: false }));
  });

  it('renders conflict alert when conflicts are present', () => {
    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        onLeagueDataChange={noop}
        slots={[
          {
            ...baseSlot,
            conflicts: [
              {
                schedule: { $id: 'slot-1' } as any,
                event: { $id: 'evt_1', name: 'Other Event' } as any,
              },
            ],
          },
        ]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    expect(screen.getByText(/Conflicts detected/i)).toBeInTheDocument();
    expect(screen.getByText(/Other Event/)).toBeInTheDocument();
  });
});
