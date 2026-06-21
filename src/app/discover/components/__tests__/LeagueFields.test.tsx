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
    fireEvent.change(startTimeInput, { target: { value: '10:15' } });

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

  it('renders conflict warning when conflicts are present', () => {
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
                schedule: {
                  $id: 'slot-1',
                  repeating: true,
                  startDate: '2026-03-18T00:00:00',
                  endDate: '2026-03-25T00:00:00',
                  startTimeMinutes: 9 * 60,
                  endTimeMinutes: 17 * 60,
                } as any,
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

    expect(screen.getByText(/Field conflict warning/i)).toBeInTheDocument();
    expect(screen.getByText(/scheduler will avoid the overlap/i)).toBeInTheDocument();
    expect(screen.getByText(/Other Event/)).toBeInTheDocument();
    expect(screen.getByText(/9:00 AM-5:00 PM overlaps this slot/i)).toBeInTheDocument();
  });

  it('groups weekly slot resources by facility and lets managers select another resource', () => {
    const onUpdateSlot = jest.fn();
    const annexField: Field = {
      $id: 'field_2',
      name: 'Annex Court',
      location: 'Annex Gym',
      lat: 0,
      long: 0,
      facilityId: 'facility_annex',
      facility: {
        $id: 'facility_annex',
        organizationId: 'org_1',
        name: 'Annex Facility',
        location: 'Annex Gym',
      } as any,
    };
    const mainField: Field = {
      ...field,
      facilityId: 'facility_main',
      facility: {
        $id: 'facility_main',
        organizationId: 'org_1',
        name: 'Main Facility',
        location: 'Main Gym',
      } as any,
    };

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
        slots={[{ ...baseSlot, scheduledFieldId: undefined, scheduledFieldIds: [] }]}
        onAddSlot={noop}
        onUpdateSlot={onUpdateSlot}
        onRemoveSlot={noop}
        fields={[mainField, annexField]}
        fieldsLoading={false}
      />,
    );

    expect(screen.getByText('Main Facility')).toBeInTheDocument();
    expect(screen.getByText('Annex Facility')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Annex Court/i }));

    expect(onUpdateSlot).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        scheduledFieldId: 'field_2',
        scheduledFieldIds: ['field_2'],
      }),
    );
  });

  it('shows an error when a selected rental does not match the timeslot window', () => {
    const onUpdateSlot = jest.fn();
    const rentalField: Field = {
      ...field,
      $id: 'rental_field_1',
      name: 'Example Club Court 1',
      facilityId: 'facility_rental',
      facility: {
        $id: 'facility_rental',
        organizationId: 'rental_org',
        name: 'Example Clubhouse',
        location: '800 Waterfront Way',
      } as any,
    };

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
        slots={[{
          ...baseSlot,
          scheduledFieldId: undefined,
          scheduledFieldIds: [],
          repeating: true,
        }]}
        onAddSlot={noop}
        onUpdateSlot={onUpdateSlot}
        onRemoveSlot={noop}
        fields={[rentalField]}
        fieldsLoading={false}
        fieldOptions={[{
          value: 'rental:booking_item_1',
          fieldId: 'rental_field_1',
          label: 'Example Club Court 1 - Jun 24, 2026 5:30 AM-11:00 AM',
          rentalBookingId: 'rental_booking_1',
          rentalBookingItemId: 'booking_item_1',
          rentalStart: '2026-06-24T05:30:00',
          rentalEnd: '2026-06-24T11:00:00',
          rentalTimeZone: 'America/Los_Angeles',
          rentalPriceCents: 27500,
        }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Example Club Court 1 - Jun 24/i }));

    expect(onUpdateSlot).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        error: expect.stringContaining('This rental resource is only available for 06/24/2026 5:30 AM - 11:00 AM'),
      }),
    );
    expect(onUpdateSlot).not.toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        scheduledFieldId: 'rental_field_1',
        sourceType: 'RENTAL_BOOKING',
      }),
    );
  });

  it('locks a matching one-time slot to the selected rental booking item window', () => {
    const onUpdateSlot = jest.fn();
    const rentalField: Field = {
      ...field,
      $id: 'rental_field_1',
      name: 'Example Club Court 1',
      facilityId: 'facility_rental',
      facility: {
        $id: 'facility_rental',
        organizationId: 'rental_org',
        name: 'Example Clubhouse',
        location: '800 Waterfront Way',
      } as any,
    };

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
        slots={[{
          ...baseSlot,
          scheduledFieldId: undefined,
          scheduledFieldIds: [],
          repeating: false,
          dayOfWeek: 2,
          daysOfWeek: [2],
          startDate: '2026-06-24T05:30:00',
          endDate: '2026-06-24T11:00:00',
          startTimeMinutes: 330,
          endTimeMinutes: 660,
        }]}
        onAddSlot={noop}
        onUpdateSlot={onUpdateSlot}
        onRemoveSlot={noop}
        fields={[rentalField]}
        fieldsLoading={false}
        fieldOptions={[{
          value: 'rental:booking_item_1',
          fieldId: 'rental_field_1',
          label: 'Example Club Court 1 - Jun 24, 2026 5:30 AM-11:00 AM',
          rentalBookingId: 'rental_booking_1',
          rentalBookingItemId: 'booking_item_1',
          rentalStart: '2026-06-24T05:30:00',
          rentalEnd: '2026-06-24T11:00:00',
          rentalTimeZone: 'America/Los_Angeles',
          rentalPriceCents: 27500,
        }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Example Club Court 1 - Jun 24/i }));

    expect(onUpdateSlot).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        scheduledFieldId: 'rental_field_1',
        scheduledFieldIds: ['rental_field_1'],
        sourceType: 'RENTAL_BOOKING',
        rentalBookingId: 'rental_booking_1',
        rentalBookingItemId: 'booking_item_1',
        rentalLocked: true,
        repeating: false,
        dayOfWeek: 2,
        daysOfWeek: [2],
        startDate: '2026-06-24T05:30:00',
        endDate: '2026-06-24T11:00:00',
        startTimeMinutes: 330,
        endTimeMinutes: 660,
        price: 27500,
      }),
    );
  });

  it('does not offer a rental booking item on another timeslot once it is selected', () => {
    const rentalField: Field = {
      ...field,
      $id: 'rental_field_1',
      name: 'Example Club Court 1',
      facilityId: 'facility_rental',
      facility: {
        $id: 'facility_rental',
        organizationId: 'rental_org',
        name: 'Example Clubhouse',
        location: '800 Waterfront Way',
      } as any,
    };

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
            key: 'slot-1',
            scheduledFieldId: 'rental_field_1',
            scheduledFieldIds: ['rental_field_1'],
            repeating: false,
            dayOfWeek: 2,
            daysOfWeek: [2],
            startDate: '2026-06-24T05:30:00',
            endDate: '2026-06-24T11:00:00',
            startTimeMinutes: 330,
            endTimeMinutes: 660,
            sourceType: 'RENTAL_BOOKING',
            rentalBookingId: 'rental_booking_1',
            rentalBookingItemId: 'booking_item_1',
            rentalLocked: true,
          },
          {
            ...baseSlot,
            key: 'slot-2',
            scheduledFieldId: undefined,
            scheduledFieldIds: [],
            repeating: false,
            dayOfWeek: 2,
            daysOfWeek: [2],
            startDate: '2026-06-24T12:00:00',
            endDate: '2026-06-24T13:00:00',
            startTimeMinutes: 720,
            endTimeMinutes: 780,
          },
        ]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[rentalField]}
        fieldsLoading={false}
        fieldOptions={[{
          value: 'rental:booking_item_1',
          fieldId: 'rental_field_1',
          label: 'Example Club Court 1 - Jun 24, 2026 5:30 AM-11:00 AM',
          rentalBookingId: 'rental_booking_1',
          rentalBookingItemId: 'booking_item_1',
          rentalStart: '2026-06-24T05:30:00',
          rentalEnd: '2026-06-24T11:00:00',
          rentalTimeZone: 'America/Los_Angeles',
          rentalPriceCents: 27500,
        }]}
      />,
    );

    expect(screen.getAllByRole('button', { name: /Example Club Court 1 - Jun 24/i })).toHaveLength(1);
  });

  it('shows the first actual overlap date for recurring conflicts', () => {
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
            dayOfWeek: 5,
            daysOfWeek: [5, 6],
            startDate: '2026-05-04T00:00:00',
            startTimeMinutes: 9 * 60,
            endTimeMinutes: 21 * 60,
            conflicts: [
              {
                schedule: {
                  $id: 'slot-1',
                  repeating: true,
                  dayOfWeek: 5,
                  daysOfWeek: [5],
                  startDate: '2026-04-20T00:00:00',
                  startTimeMinutes: 9 * 60,
                  endTimeMinutes: 17 * 60,
                  scheduledFieldId: field.$id,
                  scheduledFieldIds: [field.$id],
                } as any,
                event: { $id: 'evt_1', name: 'TEST DOC' } as any,
              },
            ],
          },
        ]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
        eventStartDate="2026-05-04T09:00:00"
      />,
    );

    expect(screen.getByText(/05\/09\/2026, 9:00 AM-5:00 PM overlaps this slot/i)).toBeInTheDocument();
  });

  it('allows auto-resolving a conflicted slot', () => {
    const onAutoResolveSlotConflict = jest.fn();

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
        onAutoResolveSlotConflict={onAutoResolveSlotConflict}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Auto Resolve/i }));
    expect(onAutoResolveSlotConflict).toHaveBeenCalledWith(0);
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

  it('allows zero and blank match duration values while warning', () => {
    const onLeagueDataChange = jest.fn();

    const warningRender = renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: false,
          matchDurationMinutes: 0,
          restTimeMinutes: 0,
        }}
        onLeagueDataChange={onLeagueDataChange}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    expect(screen.getByText(/Match duration should be greater than 0/i)).toBeInTheDocument();
    warningRender.unmount();

    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        onLeagueDataChange={onLeagueDataChange}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    const matchDurationInput = getLabeledInput(/Match Duration \(minutes\)/i);
    fireEvent.change(matchDurationInput, { target: { value: '0' } });
    expect(onLeagueDataChange).toHaveBeenLastCalledWith({ matchDurationMinutes: 0 });

    fireEvent.change(matchDurationInput, { target: { value: '' } });
    expect(onLeagueDataChange).toHaveBeenLastCalledWith({ matchDurationMinutes: undefined });
  });

  it('allows zero and blank set duration values while warning', () => {
    const onLeagueDataChange = jest.fn();

    const warningRender = renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: true,
          restTimeMinutes: 0,
          setDurationMinutes: 0,
          setsPerMatch: 1,
          pointsToVictory: [21],
        }}
        sport={{ usePointsPerSetWin: true } as any}
        onLeagueDataChange={onLeagueDataChange}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    expect(screen.getByText(/Set duration should be greater than 0/i)).toBeInTheDocument();
    warningRender.unmount();

    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          usesSets: true,
          restTimeMinutes: 0,
          setDurationMinutes: 20,
          setsPerMatch: 1,
          pointsToVictory: [21],
        }}
        sport={{ usePointsPerSetWin: true } as any}
        onLeagueDataChange={onLeagueDataChange}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    const setDurationInput = getLabeledInput(/Set Duration \(minutes\)/i);
    fireEvent.change(setDurationInput, { target: { value: '0' } });
    expect(onLeagueDataChange).toHaveBeenLastCalledWith({ setDurationMinutes: 0 });

    fireEvent.change(setDurationInput, { target: { value: '' } });
    expect(onLeagueDataChange).toHaveBeenLastCalledWith({ setDurationMinutes: undefined });
  });

  it('defaults playoff team count from participants each time playoffs are enabled', () => {
    const onLeagueDataChange = jest.fn();
    const participantCount = 12;

    const firstRender = renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          playoffTeamCount: undefined,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        participantCount={participantCount}
        onLeagueDataChange={onLeagueDataChange}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Include Playoffs/i));
    expect(onLeagueDataChange).toHaveBeenLastCalledWith({
      includePlayoffs: true,
      playoffTeamCount: participantCount,
    });

    firstRender.unmount();
    onLeagueDataChange.mockClear();

    const secondRender = renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: true,
          playoffTeamCount: 6,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        participantCount={participantCount}
        onLeagueDataChange={onLeagueDataChange}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Include Playoffs/i));
    expect(onLeagueDataChange).toHaveBeenLastCalledWith({
      includePlayoffs: false,
      playoffTeamCount: undefined,
    });

    secondRender.unmount();
    onLeagueDataChange.mockClear();

    renderWithMantine(
      <LeagueFields
        leagueData={{
          gamesPerOpponent: 1,
          includePlayoffs: false,
          playoffTeamCount: 6,
          usesSets: false,
          matchDurationMinutes: 60,
          restTimeMinutes: 0,
        }}
        participantCount={participantCount}
        onLeagueDataChange={onLeagueDataChange}
        slots={[baseSlot]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Include Playoffs/i));
    expect(onLeagueDataChange).toHaveBeenLastCalledWith({
      includePlayoffs: true,
      playoffTeamCount: participantCount,
    });
  });

  it('locks slot divisions when single division mode is enabled', () => {
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
        slots={[{ ...baseSlot, divisions: ['beginner'] }]}
        onAddSlot={noop}
        onUpdateSlot={onUpdateSlot}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
        divisionOptions={[
          { value: 'beginner', label: 'Beginner' },
          { value: 'advanced', label: 'Advanced' },
        ]}
        lockSlotDivisions
        lockedDivisionKeys={['beginner', 'advanced']}
      />,
    );

    const divisionsInput = getLabeledInput(/Divisions/i) as HTMLInputElement;
    expect(divisionsInput).toBeDisabled();
  });

  it('shows selected division labels instead of raw ids', () => {
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
        slots={[{ ...baseSlot, divisions: ['DIVISION_ABC_123'] }]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[field]}
        fieldsLoading={false}
        divisionOptions={[
          { value: 'division_abc_123', label: 'Grass Volleyball - Beginner' },
        ]}
      />,
    );

    expect(screen.getAllByText('Grass Volleyball - Beginner').length).toBeGreaterThan(0);
    expect(screen.queryByText('DIVISION_ABC_123')).not.toBeInTheDocument();
  });

  it('renders a custom empty-fields message when provided', () => {
    const customMessage = 'No fields found. Create a field on the Organizations page first, then return here to attach weekly availability.';

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
        slots={[]}
        onAddSlot={noop}
        onUpdateSlot={noop}
        onRemoveSlot={noop}
        fields={[]}
        fieldsLoading={false}
        emptyFieldsMessage={customMessage}
      />,
    );

    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });
});
