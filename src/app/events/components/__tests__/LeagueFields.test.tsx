import { fireEvent, screen } from '@testing-library/react';
import LeagueFields, { LeagueSlotForm } from '../LeagueFields';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import type { Field } from '@/types';

jest.mock('react-timezone-select', () => () => <div data-testid="timezone-select" />);

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
  field,
  dayOfWeek: 1,
  startTime: 9 * 60,
  endTime: 10 * 60,
  timezone: 'UTC',
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

    expect(onUpdateSlot).toHaveBeenCalledWith(0, expect.objectContaining({ startTime: 615 }));
  });

  it('renders conflict alert when conflicts are present', () => {
    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: false,
          matchDurationMinutes: 60,
        }}
        onLeagueDataChange={noop}
        slots={[
          {
            ...baseSlot,
            conflicts: [
              {
                schedule: baseSlot as any,
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
