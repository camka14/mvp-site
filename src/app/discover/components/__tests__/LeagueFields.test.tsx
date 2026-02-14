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
  type: 'INDOOR',
  fieldNumber: 1,
};

const baseSlot: LeagueSlotForm = {
  key: 'slot-1',
  scheduledFieldId: field.$id,
  dayOfWeek: 1,
  daysOfWeek: [1],
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  repeating: true,
  conflicts: [],
  checking: false,
};

const noop = () => {};

const getLabeledInput = (label: RegExp): HTMLElement => {
  const input = screen.getAllByLabelText(label).find((element) => element.tagName === 'INPUT');
  if (!input) {
    throw new Error(`Expected an input for label ${String(label)}.`);
  }
  return input as HTMLElement;
};

describe('LeagueFields', () => {
  it('converts selected start time option to minutes when updating slot', () => {
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

    const startTimeInput = getLabeledInput(/Start Time/i);
    fireEvent.click(startTimeInput);
    fireEvent.click(screen.getAllByText('10:15 AM')[0]);

    expect(onUpdateSlot).toHaveBeenCalledWith(0, expect.objectContaining({ startTimeMinutes: 615 }));
  });

  it('updates days of week as a multi-select', () => {
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

    const daysInput = getLabeledInput(/Days of Week/i);
    fireEvent.click(daysInput);
    fireEvent.click(screen.getByText('Thursday'));

    expect(onUpdateSlot).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ dayOfWeek: 1, daysOfWeek: [1, 3] }),
    );
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

  it('requires playoff team count when playoffs are enabled', () => {
    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: true,
          playoffTeamCount: undefined,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        onLeagueDataChange={noop}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    expect(screen.getByText(/Playoff team count is required/i)).toBeInTheDocument();
  });
});
