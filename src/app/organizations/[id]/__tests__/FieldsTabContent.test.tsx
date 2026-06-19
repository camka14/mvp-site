import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import FieldsTabContent from '../FieldsTabContent';

const pushMock = jest.fn();
const getOrganizationByIdMock = jest.fn();
const getOrganizationsByOwnerMock = jest.fn();
const getFieldEventsMatchesMock = jest.fn();
const updateFieldMock = jest.fn();
const updateRentalSlotMock = jest.fn();
const getNextRentalOccurrenceMock = jest.fn();
const createFacilityMock = jest.fn();
const updateFacilityMock = jest.fn();
const mockShowNotification = jest.fn();
let mockCreateRentalSlotModalProps: any = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('react-big-calendar', () => {
  const React = require('react');
  const MS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

  const Calendar = ({ date, events = [], resources, onNavigate, onEventDrop, draggableAccessor }: any) => {
    const resolvedDate = date instanceof Date ? date : new Date(date);
    return (
      <div>
        <button
          type="button"
          onClick={() => onNavigate?.(new Date(resolvedDate.getTime() + MS_IN_WEEK))}
        >
          Next Week
        </button>
        <div data-testid="calendar-date">{resolvedDate.toISOString()}</div>
        <div data-testid="calendar-resource-count">{Array.isArray(resources) ? resources.length : 'none'}</div>
        {events.map((event: any) => {
          const canDrag = typeof draggableAccessor === 'function' ? Boolean(draggableAccessor(event)) : false;
          const resourceId = event.resource?.$id ?? event.id;
          return (
            <div key={event.id}>
              <button
                type="button"
                disabled={!canDrag}
                onClick={() => onEventDrop?.({
                  event,
                  start: new Date('2026-03-11T12:00:00.000Z'),
                  end: new Date('2026-03-11T13:00:00.000Z'),
                  resourceId: event.resourceId,
                })}
              >
                Drag {event.title}
              </button>
              <div data-testid={`event-range-${resourceId}`}>
                {event.start.toISOString()}|{event.end.toISOString()}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return {
    Calendar,
    dateFnsLocalizer: () => ({}),
  };
});

jest.mock('react-big-calendar/lib/addons/dragAndDrop', () => (Component: any) => Component);
jest.mock('react-big-calendar/lib/css/react-big-calendar.css', () => ({}));
jest.mock('react-big-calendar/lib/addons/dragAndDrop/styles.css', () => ({}));
jest.mock('@/components/ui/CreateFieldModal', () => () => null);
jest.mock('@/components/ui/CreateRentalSlotModal', () => {
  const React = require('react');
  return (props: any) => {
    mockCreateRentalSlotModalProps = props;
    return props.opened
      ? React.createElement('div', { 'data-testid': 'create-rental-slot-modal' })
      : null;
  };
});
jest.mock('@/components/location/LocationSelector', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ value, label = 'Location', onChange, required, errorMessage, isValid }: any) =>
      React.createElement('input', {
        'aria-label': label,
        value: value ?? '',
        required,
        'aria-invalid': isValid === false ? 'true' : undefined,
        'aria-errormessage': isValid === false ? errorMessage : undefined,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          onChange?.(event.target.value, 0, 0, event.target.value);
        },
      }),
  };
});

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationById: (...args: any[]) => getOrganizationByIdMock(...args),
    getOrganizationsByOwner: (...args: any[]) => getOrganizationsByOwnerMock(...args),
  },
}));

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    getFieldEventsMatches: (...args: any[]) => getFieldEventsMatchesMock(...args),
    updateField: (...args: any[]) => updateFieldMock(...args),
    updateRentalSlot: (...args: any[]) => updateRentalSlotMock(...args),
  },
}));

jest.mock('@/lib/facilityService', () => ({
  facilityService: {
    createFacility: (...args: any[]) => createFacilityMock(...args),
    updateFacility: (...args: any[]) => updateFacilityMock(...args),
  },
}));

jest.mock('@/app/discover/utils/rentals', () => ({
  getNextRentalOccurrence: (...args: any[]) => getNextRentalOccurrenceMock(...args),
}));

jest.mock('@mantine/notifications', () => ({
  notifications: {
    show: (...args: any[]) => mockShowNotification(...args),
  },
}));

const buildOrganizationWithRentalSlot = () => ({
  $id: 'org_test',
  name: 'Test',
  ownerId: 'owner_1',
  hasStripeAccount: false,
  fieldIds: ['field_main'],
  fields: [
    {
      $id: 'field_main',
      name: 'Main',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: ['slot_1'],
      rentalSlots: [
        {
          $id: 'slot_1',
          repeating: true,
          dayOfWeek: 1,
          daysOfWeek: [1],
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-12-31T23:59:00.000Z',
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          scheduledFieldId: 'field_main',
          scheduledFieldIds: ['field_main'],
        },
      ],
    },
  ],
}) as any;

const buildOrganizationWithTwoRentalFields = () => ({
  $id: 'org_test',
  name: 'Test',
  ownerId: 'owner_1',
  hasStripeAccount: false,
  fieldIds: ['field_main', 'field_2'],
  fields: [
    {
      $id: 'field_main',
      name: 'Main',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: ['slot_1'],
      rentalSlots: [
        {
          $id: 'slot_1',
          repeating: false,
          dayOfWeek: 1,
          daysOfWeek: [1],
          startDate: '2026-07-21T10:00:00.000Z',
          endDate: '2026-07-21T11:00:00.000Z',
          scheduledFieldId: 'field_main',
          scheduledFieldIds: ['field_main'],
        },
      ],
    },
    {
      $id: 'field_2',
      name: 'Field 2',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: ['slot_2'],
      rentalSlots: [
        {
          $id: 'slot_2',
          repeating: false,
          dayOfWeek: 1,
          daysOfWeek: [1],
          startDate: '2026-07-21T12:00:00.000Z',
          endDate: '2026-07-21T13:00:00.000Z',
          scheduledFieldId: 'field_2',
          scheduledFieldIds: ['field_2'],
        },
      ],
    },
  ],
}) as any;

const buildOrganizationWithFacilityRentalFields = () => {
  const organization = buildOrganizationWithTwoRentalFields();
  organization.fields[0] = {
    ...organization.fields[0],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  organization.fields[1] = {
    ...organization.fields[1],
    createdAt: '2026-01-02T00:00:00.000Z',
  };
  organization.facilities = [
    {
      $id: 'facility_river_city',
      organizationId: 'org_test',
      name: 'River City Sports Complex',
      location: '100 River City Way',
      address: '100 River City Way, Portland, OR 97201, USA',
      coordinates: [-122.676, 45.523],
      operatingHours: {
        version: 1,
        weekly: [
          { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 2, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 3, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 4, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 5, closed: true, intervals: [] },
          { dayOfWeek: 6, closed: true, intervals: [] },
        ],
      },
      isDefault: true,
      sortOrder: 0,
    },
  ];
  organization.fields[0] = {
    ...organization.fields[0],
    facilityId: 'facility_river_city',
    facility: {
      $id: 'facility_river_city',
      organizationId: 'org_test',
      name: 'River City Sports Complex',
      location: '100 River City Way',
      address: '100 River City Way, Portland, OR 97201, USA',
      coordinates: [-122.676, 45.523],
      operatingHours: {
        version: 1,
        weekly: [
          { dayOfWeek: 0, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 1, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 2, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 3, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 4, closed: false, intervals: [{ openMinutes: 480, closeMinutes: 1320 }] },
          { dayOfWeek: 5, closed: true, intervals: [] },
          { dayOfWeek: 6, closed: true, intervals: [] },
        ],
      },
    },
  };
  return organization;
};

const originalRentalRangeText = [
  new Date(2026, 2, 10, 10, 0, 0, 0).toISOString(),
  new Date(2026, 2, 10, 11, 0, 0, 0).toISOString(),
].join('|');

const draggedRentalRangeText = [
  new Date('2026-03-11T12:00:00.000Z').toISOString(),
  new Date('2026-03-11T13:00:00.000Z').toISOString(),
].join('|');

describe('FieldsTabContent calendar navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRentalSlotModalProps = null;
    getOrganizationByIdMock.mockResolvedValue(null);
    getOrganizationsByOwnerMock.mockResolvedValue([]);
    updateRentalSlotMock.mockImplementation(async (field, slot) => ({
      field: {
        ...field,
        rentalSlots: [{ ...slot }],
      },
      slot,
    }));
  });

  it('keeps the selected week after field hydration updates', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    const nextWeekDate = new Date(rentalDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);

    let resolveHydration: ((value: any) => void) | null = null;
    getFieldEventsMatchesMock.mockImplementation(
      (field: any) =>
        new Promise((resolve) => {
          resolveHydration = resolve;
        }).then((hydrated: any) => ({ ...field, ...hydrated })),
    );

    const organization = {
      $id: 'org_test',
      name: 'Test',
      ownerId: 'owner_1',
      hasStripeAccount: false,
      fieldIds: ['field_main'],
      fields: [
        {
          $id: 'field_main',
          name: 'Main',
          location: '',
          lat: 0,
          long: 0,
          rentalSlotIds: ['slot_1'],
          rentalSlots: [
            {
              $id: 'slot_1',
              repeating: false,
              dayOfWeek: 1,
              daysOfWeek: [1],
              startDate: '2026-03-10T10:00:00.000Z',
              endDate: '2026-03-10T11:00:00.000Z',
              startTimeMinutes: 600,
              endTimeMinutes: 660,
              scheduledFieldId: 'field_main',
              scheduledFieldIds: ['field_main'],
            },
          ],
        },
      ],
    } as any;

    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={organization}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(getFieldEventsMatchesMock).toHaveBeenCalledTimes(1);
    });
    expect(getFieldEventsMatchesMock.mock.calls[0]?.[2]).toBeUndefined();
    await waitFor(() => {
      expect(screen.getByTestId('calendar-date')).toHaveTextContent(rentalDate.toISOString());
    });

    await user.click(screen.getByRole('button', { name: 'Next Week' }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-date')).toHaveTextContent(nextWeekDate.toISOString());
    });

    expect(resolveHydration).not.toBeNull();
    await act(async () => {
      resolveHydration?.({
        events: [],
        matches: [
          {
            $id: 'match_1',
            start: '2026-03-19T07:00:00.000Z',
            end: '2026-03-19T08:00:00.000Z',
          },
        ],
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('calendar-date')).toHaveTextContent(nextWeekDate.toISOString());
    });
  });

  it('keeps rental selection conflicts when navigating to another week', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    const nextWeekDate = new Date(rentalDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (
      field: any,
      range: { start: string; end?: string | null },
      options?: { rentalOverlapOnly?: boolean },
    ) => {
      if (options !== undefined) {
        expect(options).toEqual({ rentalOverlapOnly: true, includeMatches: false });
      }
      const start = new Date(range.start);
      const end = range.end ? new Date(range.end) : new Date(start.getTime() + 60 * 60 * 1000);
      return {
        ...field,
        events: [
          {
            $id: `event_conflict_${field.$id}`,
            eventType: 'EVENT',
            start: start.toISOString(),
            end: end.toISOString(),
          },
        ],
        matches: [],
      };
    });

    const organization = {
      $id: 'org_test',
      name: 'Test',
      ownerId: 'owner_1',
      hasStripeAccount: false,
      fieldIds: ['field_main'],
      fields: [
        {
          $id: 'field_main',
          name: 'Main',
          location: '',
          lat: 0,
          long: 0,
          rentalSlotIds: ['slot_1'],
          rentalSlots: [
            {
              $id: 'slot_1',
              repeating: true,
              dayOfWeek: ((rentalDate.getDay() + 6) % 7),
              daysOfWeek: [((rentalDate.getDay() + 6) % 7)],
              startDate: '2026-01-01T00:00:00.000Z',
              endDate: '2026-12-31T23:59:00.000Z',
              startTimeMinutes: 0,
              endTimeMinutes: 1439,
              scheduledFieldId: 'field_main',
              scheduledFieldIds: ['field_main'],
            },
          ],
        },
      ],
    } as any;

    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={organization}
          organizationId="org_test"
          currentUser={{ $id: 'user_2' } as any}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Selection 1/i).length).toBeGreaterThan(0);
      expect(getFieldEventsMatchesMock).toHaveBeenCalled();
    });

    const getSelectionScopedCalls = () => getFieldEventsMatchesMock.mock.calls.filter(([, range]) => {
      const start = new Date(range?.start);
      const end = range?.end ? new Date(range.end) : new Date(start.getTime() + 60 * 60 * 1000);
      const durationMs = end.getTime() - start.getTime();
      return durationMs > 0 && durationMs <= 2 * 24 * 60 * 60 * 1000;
    });

    const selectionScopedCallsBeforeNavigation = getSelectionScopedCalls().length;
    expect(selectionScopedCallsBeforeNavigation).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Next Week' }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-date')).toHaveTextContent(nextWeekDate.toISOString());
    });

    const selectionScopedCallsAfterNavigation = getSelectionScopedCalls().length;
    expect(selectionScopedCallsAfterNavigation).toBe(selectionScopedCallsBeforeNavigation);
  });

  it('uses the field filter to show and hide readonly rental slots on one calendar', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));

    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithTwoRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'user_2' } as any}
        />
      </MantineProvider>,
    );

    expect(await screen.findByTestId('event-range-slot_1')).toBeInTheDocument();
    expect(screen.queryByTestId('event-range-slot_2')).not.toBeInTheDocument();
    expect(screen.getByTestId('calendar-resource-count')).toHaveTextContent('none');

    await user.click(screen.getByRole('button', { name: /Field 2/i }));

    await waitFor(() => {
      expect(screen.getByTestId('event-range-slot_2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('event-range-slot_1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Field 2/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('event-range-slot_2')).not.toBeInTheDocument();
    });
  });

  it('shows public booked overlaps as unavailable rental inventory without event details', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: field.$id === 'field_main'
        ? [
            {
              $id: 'event_booked_private',
              name: 'Private Practice',
              start: '2026-07-21T10:15:00.000Z',
              end: '2026-07-21T10:45:00.000Z',
              eventType: 'EVENT',
            },
          ]
        : [],
      matches: [],
    }));

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithTwoRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'user_2' } as any}
        />
      </MantineProvider>,
    );

    const unavailableBlock = await screen.findByRole('button', { name: 'Drag Unavailable' });
    expect(unavailableBlock).toBeDisabled();
    expect(screen.queryByText('Private Practice')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Drag Booked' })).not.toBeInTheDocument();
  });

  it('keeps booked events visible when saving a rental slot returns a lean field payload', async () => {
    const organization = buildOrganizationWithRentalSlot();
    const originalField = organization.fields[0];
    const bookedEvent = {
      $id: 'booking_1',
      name: 'League Night',
      eventType: 'EVENT',
      start: '2026-03-10T09:00:00.000Z',
      end: '2026-03-10T09:30:00.000Z',
    };
    const bookedMatch = {
      $id: 'match_1',
      matchId: 1,
      start: '2026-03-10T09:30:00.000Z',
      end: '2026-03-10T10:00:00.000Z',
    };
    const newSlot = {
      $id: 'slot_new',
      repeating: false,
      dayOfWeek: 1,
      daysOfWeek: [1],
      startDate: '2026-03-10T12:00:00.000Z',
      endDate: '2026-03-10T13:00:00.000Z',
      scheduledFieldId: 'field_main',
      scheduledFieldIds: ['field_main'],
    };
    organization.fields[0] = {
      ...originalField,
      events: [bookedEvent],
      matches: [bookedMatch],
    };

    const leanUpdatedField = {
      ...originalField,
      rentalSlotIds: ['slot_1', 'slot_new'],
      rentalSlots: [...(originalField.rentalSlots ?? []), newSlot],
    };
    delete (leanUpdatedField as any).events;
    delete (leanUpdatedField as any).matches;

    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    getOrganizationByIdMock.mockResolvedValue({
      ...organization,
      fields: [leanUpdatedField],
    });

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={organization}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    expect(await screen.findByTestId('event-range-booking_1')).toBeInTheDocument();
    expect(screen.getByTestId('event-range-match_1')).toBeInTheDocument();
    expect(mockCreateRentalSlotModalProps?.onSaved).toEqual(expect.any(Function));

    await act(async () => {
      await mockCreateRentalSlotModalProps.onSaved([leanUpdatedField]);
    });

    expect(screen.getByTestId('event-range-booking_1')).toBeInTheDocument();
    expect(screen.getByTestId('event-range-match_1')).toBeInTheDocument();
    expect(screen.getByTestId('event-range-slot_new')).toBeInTheDocument();
  });

  it('labels rental inventory with facility context', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'user_2' } as any}
        />
      </MantineProvider>,
    );

    expect(await screen.findAllByText('River City Sports Complex - Main')).not.toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Facilities' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /River City Sports Complex • .* • River City Sports Complex - Main • 100 River City Way/,
    );
    const bookingAccountSelect = screen
      .getAllByLabelText('Book rental as')
      .find((element) => element.tagName === 'INPUT') as HTMLInputElement | undefined;
    if (!bookingAccountSelect) {
      throw new Error('Book rental as input was not rendered');
    }
    expect(bookingAccountSelect).toHaveDisplayValue('My personal account');
    expect(screen.queryByLabelText('Host Event As')).not.toBeInTheDocument();
    const laterFacilitySelect = screen
      .getAllByLabelText('Facility')
      .filter((element) => element.tagName === 'INPUT')
      .find((element) => Boolean(bookingAccountSelect.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(laterFacilitySelect).toBeDefined();
  });

  it('passes facility context through public rental checkout', async () => {
    const selectionReadyMock = jest.fn();
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'user_2' } as any}
          onRentalSelectionReady={selectionReadyMock}
        />
      </MantineProvider>,
    );

    const createEventButton = await screen.findByRole('button', { name: 'Reserve resources' });
    await waitFor(() => {
      expect(createEventButton).toBeEnabled();
    });
    await user.click(createEventButton);

    await waitFor(() => {
      expect(selectionReadyMock).toHaveBeenCalledTimes(1);
    });
    const payload = selectionReadyMock.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({
      organizationId: 'org_test',
      renterOrganizationId: null,
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      facilityLocation: '100 River City Way',
      facilityAddress: '100 River City Way, Portland, OR 97201, USA',
      primaryFieldId: 'field_main',
      primaryFieldName: 'River City Sports Complex - Main',
      location: '100 River City Way',
      coordinates: [-122.676, 45.523],
      fieldIds: ['field_main'],
    }));

    const manageEventUrl = new URL(payload.manageEventUrl, 'http://localhost');
    expect(manageEventUrl.searchParams.get('rentalFacilityId')).toBe('facility_river_city');
    expect(manageEventUrl.searchParams.get('rentalFacilityName')).toBe('River City Sports Complex');
    expect(manageEventUrl.searchParams.get('rentalFacilityLocation')).toBe('100 River City Way');
    expect(manageEventUrl.searchParams.get('rentalFacilityAddress')).toBe('100 River City Way, Portland, OR 97201, USA');
    expect(manageEventUrl.searchParams.get('rentalLat')).toBe('45.523');
    expect(manageEventUrl.searchParams.get('rentalLng')).toBe('-122.676');
  });

  it('passes organization-page rental reservations to the checkout handler instead of navigating', async () => {
    const selectionReadyMock = jest.fn();
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={{
            ...buildOrganizationWithFacilityRentalFields(),
            publicSlug: 'test-slug',
          }}
          organizationId="org_test"
          currentUser={{ $id: 'user_2' } as any}
          onRentalSelectionReady={selectionReadyMock}
        />
      </MantineProvider>,
    );

    const reserveResourcesButton = await screen.findByRole('button', { name: 'Reserve resources' });
    await waitFor(() => {
      expect(reserveResourcesButton).toBeEnabled();
    });
    await user.click(reserveResourcesButton);

    await waitFor(() => {
      expect(selectionReadyMock).toHaveBeenCalledTimes(1);
    });
    expect(selectionReadyMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      organizationId: 'org_test',
      organizationName: 'Test',
    }));
    expect(pushMock).not.toHaveBeenCalledWith('/o/test-slug/rentals');
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringContaining('/events/'));
  });

  it('shows facility operations metrics for managers', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    expect(await screen.findByText('Facilities')).toBeInTheDocument();
    expect(screen.queryByText('Resource assignments')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show assignments' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Facility' })).toBeInTheDocument();
    expect(screen.getByText('Weekdays 08:00-22:00')).toBeInTheDocument();
    expect(screen.getByText('Facility operations summary')).toBeInTheDocument();
    expect(screen.getByText('Utilization')).not.toBeVisible();
    expect(screen.getAllByText('Unassigned resources')).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Show summary' }));

    await waitFor(() => {
      expect(screen.getByText('Utilization')).toBeVisible();
    });
    expect(screen.getByRole('button', { name: '+ Resource' })).toBeInTheDocument();
    expect(screen.getByText('Revenue / court-hour')).toBeInTheDocument();
    expect(screen.getByText('Open inventory')).toBeInTheDocument();
    expect(screen.getByText('Unresolved conflicts')).toBeInTheDocument();
    expect(screen.getByText('No conflicts')).toBeInTheDocument();
  });

  it('opens the facility creation modal for managers', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: '+ Facility' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Create Facility' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Downtown Sports Center')).toBeInTheDocument();
    expect(screen.getByText('Operating hours')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday opens')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday closes')).toBeInTheDocument();
    expect(screen.getByText('Resources in this facility')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show resources' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Search facility assignment resources')).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Show resources' }));

    expect(screen.getByRole('button', { name: 'Hide resources' })).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(screen.getByLabelText('Search facility assignment resources')).toBeVisible();
    });
    expect(within(dialog).queryByText('Resource assignment')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Add selected' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Add unassigned' })).not.toBeInTheDocument();
  });

  it('saves facility operating hours from the edit modal', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    updateFacilityMock.mockImplementation(async (id: string, data: any) => ({
      $id: id,
      organizationId: 'org_test',
      isDefault: true,
      sortOrder: 0,
      ...data,
    }));
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(await screen.findByRole('heading', { name: 'Edit Facility' })).toBeInTheDocument();
    const opensInput = screen.getByLabelText('Monday opens');
    const closesInput = screen.getByLabelText('Monday closes');
    expect(opensInput).toHaveValue('08:00');
    expect(closesInput).toHaveValue('22:00');

    await user.clear(opensInput);
    await user.type(opensInput, '07:00');
    await user.clear(closesInput);
    await user.type(closesInput, '21:30');
    await user.click(screen.getByRole('button', { name: 'Save Facility' }));

    await waitFor(() => {
      expect(updateFacilityMock).toHaveBeenCalledWith('facility_river_city', expect.objectContaining({
        operatingHours: expect.objectContaining({
          version: 1,
          weekly: expect.arrayContaining([
            {
              dayOfWeek: 0,
              closed: false,
              intervals: [{ openMinutes: 420, closeMinutes: 1290 }],
            },
          ]),
        }),
      }));
    });
  });

  it('assigns resources from the facility edit modal through field updates', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    updateFacilityMock.mockImplementation(async (id: string, data: any) => ({
      $id: id,
      organizationId: 'org_test',
      isDefault: true,
      sortOrder: 0,
      ...data,
    }));
    updateFieldMock.mockImplementation(async (data: any) => ({
      $id: data.$id,
      name: data.$id === 'field_2' ? 'Field 2' : 'Main',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: [],
      rentalSlots: [],
      facilityId: data.facilityId,
    }));
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('heading', { name: 'Edit Facility' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Show resources' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Search facility assignment resources')).toBeVisible();
    });
    await user.click(within(dialog).getByRole('button', { name: /Field 2/i }));
    await user.click(screen.getByRole('button', { name: 'Save Facility' }));

    await waitFor(() => {
      expect(updateFieldMock).toHaveBeenCalledWith({
        $id: 'field_2',
        facilityId: 'facility_river_city',
      });
    });
  });

  it('can hide the discover back action for organization members', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithRentalSlot()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
          showBackButton={false}
        />
      </MantineProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Back to Discover' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add Rental Slot' })).toBeInTheDocument();
  });

  it('allows managers to drag existing rental slots to a new time', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));

    const organization = {
      $id: 'org_test',
      name: 'Test',
      ownerId: 'owner_1',
      hasStripeAccount: false,
      fieldIds: ['field_main'],
      fields: [
        {
          $id: 'field_main',
          name: 'Main',
          location: '',
          lat: 0,
          long: 0,
          rentalSlotIds: ['slot_1'],
          rentalSlots: [
            {
              $id: 'slot_1',
              repeating: true,
              dayOfWeek: 1,
              daysOfWeek: [1],
              startDate: '2026-01-01T00:00:00.000Z',
              endDate: '2026-12-31T23:59:00.000Z',
              startTimeMinutes: 600,
              endTimeMinutes: 660,
              scheduledFieldId: 'field_main',
              scheduledFieldIds: ['field_main'],
            },
          ],
        },
      ],
    } as any;

    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={organization}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Drag Rental Slot' }));

    await waitFor(() => {
      expect(updateRentalSlotMock).toHaveBeenCalledTimes(1);
    });

    expect(updateRentalSlotMock.mock.calls[0]?.[0]?.$id).toBe('field_main');
    const expectedStart = new Date('2026-03-11T12:00:00.000Z');
    const expectedEnd = new Date('2026-03-11T13:00:00.000Z');
    const expectedStartMinutes = expectedStart.getHours() * 60 + expectedStart.getMinutes();
    const expectedEndMinutes = expectedEnd.getHours() * 60 + expectedEnd.getMinutes();
    expect(updateRentalSlotMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      $id: 'slot_1',
      dayOfWeek: 2,
      daysOfWeek: [2],
      scheduledFieldId: 'field_main',
      scheduledFieldIds: ['field_main'],
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:00.000Z',
      startTimeMinutes: expectedStartMinutes,
      endTimeMinutes: expectedEndMinutes,
    }));
  });

  it('updates dragged rental slots locally while the edit request is pending', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));

    let resolveUpdate: (() => void) | null = null;
    updateRentalSlotMock.mockImplementation((field, slot) => new Promise((resolve) => {
      resolveUpdate = () => resolve({
        field: {
          ...field,
          rentalSlots: [{ ...slot }],
        },
        slot,
      });
    }));

    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithRentalSlot()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    expect(await screen.findByTestId('event-range-slot_1')).toHaveTextContent(originalRentalRangeText);

    await user.click(screen.getByRole('button', { name: 'Drag Rental Slot' }));

    await waitFor(() => {
      expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(draggedRentalRangeText);
    });
    expect(updateRentalSlotMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate?.();
      await Promise.resolve();
    });
  });

  it('rolls back a dragged rental slot when the edit request fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));

    let rejectUpdate: ((error: Error) => void) | null = null;
    updateRentalSlotMock.mockImplementation(() => new Promise((_, reject) => {
      rejectUpdate = reject;
    }));

    const user = userEvent.setup();

    try {
      render(
        <MantineProvider>
          <FieldsTabContent
            organization={buildOrganizationWithRentalSlot()}
            organizationId="org_test"
            currentUser={{ $id: 'owner_1' } as any}
          />
        </MantineProvider>,
      );

      expect(await screen.findByTestId('event-range-slot_1')).toHaveTextContent(originalRentalRangeText);

      await user.click(screen.getByRole('button', { name: 'Drag Rental Slot' }));

      await waitFor(() => {
        expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(draggedRentalRangeText);
      });

      await act(async () => {
        rejectUpdate?.(new Error('Network down'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(originalRentalRangeText);
      });
      expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({
        color: 'yellow',
        message: expect.stringContaining('returned to its previous time'),
      }));
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
