import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import FieldsTabContent from '../FieldsTabContent';

const pushMock = jest.fn();
const getOrganizationByIdMock = jest.fn();
const getOrganizationsByOwnerMock = jest.fn();
const getFieldEventsMatchesMock = jest.fn();
const createFieldMock = jest.fn();
const updateFieldMock = jest.fn();
const updateRentalSlotMock = jest.fn();
const getNextRentalOccurrenceMock = jest.fn();
const createFacilityMock = jest.fn();
const updateFacilityMock = jest.fn();
const createRentalSlotMock = jest.fn();
const apiRequestMock = jest.fn();
const mockShowNotification = jest.fn();
let mockCreateRentalSlotModalProps: any = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('react-big-calendar', () => {
  const React = require('react');
  const MS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;

  const Calendar = ({
    date,
    events = [],
    resources,
    onNavigate,
    onEventDrop,
    onEventResize,
    onSelectEvent,
    draggableAccessor,
    resizableAccessor,
  }: any) => {
    const resolvedDate = date instanceof Date ? date : new Date(date);
    const contentRef = React.useRef(null);
    const daySlotRefs = React.useRef([]);
    React.useEffect(() => {
      if (contentRef.current) {
        contentRef.current.getBoundingClientRect = () => ({
          left: 0,
          right: 700,
          top: 0,
          bottom: 700,
          width: 700,
          height: 700,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        });
      }
      daySlotRefs.current.forEach((slot, index) => {
        if (!slot) return;
        slot.getBoundingClientRect = () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 700,
          width: 100,
          height: 700,
          x: index * 100,
          y: 0,
          toJSON: () => ({}),
        });
      });
    }, []);
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
        <div ref={contentRef} className="rbc-time-content" data-testid="calendar-drop-zone">
          {Array.from({ length: 7 }, (_, index) => (
            <div
              key={index}
              ref={(node) => {
                daySlotRefs.current[index] = node;
              }}
              className="rbc-day-slot"
              data-testid={`calendar-day-slot-${index}`}
            />
          ))}
        </div>
        {events.map((event: any) => {
          const canDrag = typeof draggableAccessor === 'function' ? Boolean(draggableAccessor(event)) : false;
          const canResize = typeof resizableAccessor === 'function' ? Boolean(resizableAccessor(event)) : false;
          const resourceId = event.resource?.$id ?? event.id;
          const shouldSelectAfterMutation = event.metaType === 'facility-feed'
            && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment');
          return (
            <div key={event.id}>
              <button
                type="button"
                disabled={!canDrag}
                onClick={() => {
                  onEventDrop?.({
                    event,
                    start: new Date('2026-03-11T12:00:00.000Z'),
                    end: new Date('2026-03-11T13:00:00.000Z'),
                    resourceId: event.resourceId,
                  });
                  if (shouldSelectAfterMutation) {
                    onSelectEvent?.(event);
                  }
                }}
              >
                Drag {event.title}
              </button>
              <button
                type="button"
                disabled={!canResize}
                onClick={() => {
                  onEventResize?.({
                    event,
                    start: new Date('2026-03-11T12:00:00.000Z'),
                    end: new Date('2026-03-11T14:00:00.000Z'),
                  });
                  if (shouldSelectAfterMutation) {
                    onSelectEvent?.(event);
                  }
                }}
              >
                Resize {event.title}
              </button>
              <div data-testid={`event-range-${resourceId}`}>
                {event.start.toISOString()}|{event.end.toISOString()}
              </div>
              <button
                type="button"
                onClick={() => onSelectEvent?.(event)}
              >
                Select {event.title}
              </button>
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
          onChange?.(
            event.target.value,
            45.523,
            -122.676,
            event.target.value,
            { selected: true, source: 'manual' },
          );
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
    createField: (...args: any[]) => createFieldMock(...args),
    updateField: (...args: any[]) => updateFieldMock(...args),
    createRentalSlot: (...args: any[]) => createRentalSlotMock(...args),
    updateRentalSlot: (...args: any[]) => updateRentalSlotMock(...args),
  },
}));

jest.mock('@/lib/facilityService', () => ({
  facilityService: {
    createFacility: (...args: any[]) => createFacilityMock(...args),
    updateFacility: (...args: any[]) => updateFacilityMock(...args),
  },
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
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

const buildOrganizationWithUnifiedFacilityCalendarFeed = () => {
  const organization = buildOrganizationWithFacilityRentalFields();
  organization.fields[0] = {
    ...organization.fields[0],
    events: [
      {
        $id: 'event_league_night',
        name: 'League night',
        eventType: 'EVENT',
        start: '2026-07-21T10:15:00.000Z',
        end: '2026-07-21T10:45:00.000Z',
        eventOfficials: [
          {
            id: 'event_official_1',
            userId: 'official_1',
            positionIds: ['referee'],
            fieldIds: ['field_main'],
            isActive: true,
          },
        ],
        staffAssignments: [
          {
            id: 'event_staff_1',
            userId: 'staff_user_1',
            staffMemberId: 'staff_member_1',
            role: 'Court lead',
            plannedStart: '2026-07-21T10:00:00.000Z',
            plannedEnd: '2026-07-21T11:00:00.000Z',
            status: 'PLANNED',
          },
        ],
      },
    ],
    matches: [
      {
        $id: 'match_1',
        matchId: 7,
        eventId: 'event_league_night',
        fieldId: 'field_main',
        start: '2026-07-21T11:00:00.000Z',
        end: '2026-07-21T12:00:00.000Z',
        team1Points: [],
        team2Points: [],
        setResults: [],
        officialIds: [
          {
            userId: 'official_2',
            positionIds: ['scorekeeper'],
          },
        ],
      },
    ],
    maintenanceBlocks: [
      {
        id: 'maintenance_1',
        title: 'Net repair',
        start: '2026-07-21T12:30:00.000Z',
        end: '2026-07-21T13:00:00.000Z',
        status: 'PLANNED',
      },
    ],
  };
  return organization;
};

const originalRentalRangeText = [
  new Date(2026, 2, 10, 10, 0, 0, 0).toISOString(),
  new Date(2026, 2, 10, 11, 0, 0, 0).toISOString(),
].join('|');

const draggedRentalRangeText = [
  new Date('2026-03-10T12:00:00.000Z').toISOString(),
  new Date('2026-03-10T13:00:00.000Z').toISOString(),
].join('|');

describe('FieldsTabContent calendar navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(
      'bracketiq.facilities.managerResourceSelection:org_test',
      JSON.stringify({ fieldIds: ['field_main'], updatedAt: '2026-06-20T00:00:00.000Z' }),
    );
    mockCreateRentalSlotModalProps = null;
    getOrganizationByIdMock.mockResolvedValue(null);
    getOrganizationsByOwnerMock.mockResolvedValue([]);
    createFacilityMock.mockImplementation(async (data: any) => ({
      $id: data.$id ?? 'facility_created',
      organizationId: data.organizationId ?? 'org_test',
      isDefault: false,
      sortOrder: 0,
      ...data,
    }));
    updateFacilityMock.mockImplementation(async (id: string, data: any) => ({
      $id: id,
      organizationId: 'org_test',
      isDefault: true,
      sortOrder: 0,
      ...data,
    }));
    createFieldMock.mockImplementation(async (data: any) => ({
      $id: data.$id ?? 'field_created',
      name: data.name,
      location: data.location ?? '',
      lat: data.lat ?? 0,
      long: data.long ?? 0,
      facilityId: data.facilityId ?? null,
      sportIds: data.sportIds ?? [],
      rentalSlotIds: [],
      rentalSlots: [],
    }));
    updateFieldMock.mockImplementation(async (data: any) => ({
      $id: data.$id,
      name: data.name ?? 'Updated resource',
      location: data.location ?? '',
      lat: data.lat ?? 0,
      long: data.long ?? 0,
      facilityId: data.facilityId ?? null,
      sportIds: data.sportIds ?? [],
      rentalSlotIds: [],
      rentalSlots: [],
    }));
    updateRentalSlotMock.mockImplementation(async (field, slot) => ({
      field: {
        ...field,
        rentalSlots: [{ ...slot }],
      },
      slot,
    }));
    createRentalSlotMock.mockImplementation(async (field, slot) => ({
      field: {
        ...field,
        rentalSlots: [{ ...slot, $id: 'created_slot_1' }],
      },
      slot: { ...slot, $id: 'created_slot_1' },
    }));
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/staff/schedule')) {
        return { assignments: [], staffMembers: [] };
      }
      return {};
    });
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
    const user = userEvent.setup();

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

  it('defaults manager facility resource selection to every resource when nothing is saved locally', async () => {
    window.localStorage.removeItem('bracketiq.facilities.managerResourceSelection:org_test');
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(within(screen.getByLabelText('Facility resources')).getByText('2 of 2 selected')).toBeInTheDocument();
    });

    await waitFor(() => {
      const storedSelection = JSON.parse(
        window.localStorage.getItem('bracketiq.facilities.managerResourceSelection:org_test') ?? '{}',
      );
      expect(storedSelection.fieldIds).toEqual(['field_main', 'field_2']);
    });
  });

  it('restores manager facility resource selection from local storage', async () => {
    window.localStorage.setItem(
      'bracketiq.facilities.managerResourceSelection:org_test',
      JSON.stringify({ fieldIds: ['field_2'], updatedAt: '2026-06-20T00:00:00.000Z' }),
    );
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(within(screen.getByLabelText('Facility resources')).getByText('1 of 2 selected')).toBeInTheDocument();
    });
    expect(JSON.parse(
      window.localStorage.getItem('bracketiq.facilities.managerResourceSelection:org_test') ?? '{}',
    ).fieldIds).toEqual(['field_2']);
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

  it('shows the schedule view and details switch for managers', async () => {
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
    expect(screen.getByRole('button', { name: 'Facility details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit schedule' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Facility' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Resource' })).not.toBeInTheDocument();
    expect(screen.queryByText('Facility operations summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Utilization')).not.toBeInTheDocument();
    expect(screen.getByText('Calendar layers')).toBeInTheDocument();
    expect(screen.getAllByText('Unassigned resources')).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Facility details' }));

    expect(await screen.findByRole('button', { name: '+ Facility' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Resource' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByText('Facility details')).toBeInTheDocument();
  });

  it('shows facility operation layers on the main manager calendar', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithUnifiedFacilityCalendarFeed()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    expect(screen.queryByText('Unified facility calendar')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Apply selection as')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit schedule' })).toBeInTheDocument();
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Rental slot')).toBeInTheDocument();
    expect(screen.getByText('Staff shift')).toBeInTheDocument();
    expect(screen.getByText('Official shift')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText('Calendar layers')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('calendar-date')).toHaveTextContent('2026-07-21');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Drag Net repair' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Drag Court lead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag Match official assignment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag Conflict: League night' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Maintenance 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conflicts 1/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Maintenance 1/ }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Drag Net repair' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Drag Court lead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag Conflict: League night' })).toBeInTheDocument();
  });

  it('opens child staff assignment cards with unassign instead of delete', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const childAssignment = {
      id: 'staff_child_1',
      parentAssignmentId: 'staff_parent_1',
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: 2500,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T14:00:00.000Z',
        endDate: '2026-07-21T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-21T14:00:00.000Z',
      plannedEnd: '2026-07-21T15:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [childAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (path.endsWith('/staff/schedule/staff_child_1') && options?.method === 'PATCH') {
        return {
          assignment: {
            ...childAssignment,
            status: 'CANCELLED',
          },
        };
      }
      return {};
    });
    const user = userEvent.setup();
    const organization = buildOrganizationWithFacilityRentalFields();
    organization.fields[1] = {
      ...organization.fields[1],
      facilityId: 'facility_river_city',
      facility: organization.facilities[0],
    };

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
      expect(screen.getByRole('button', { name: 'Select Sam Staff' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Select Sam Staff' }));

    expect(await screen.findByRole('heading', { name: 'Edit Staff Assignment' })).toBeInTheDocument();
    expect(screen.getByText(/assigned to a parent coverage block/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unassign staff member' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete assignment' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unassign staff member' }));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/organizations/org_test/staff/schedule/staff_child_1',
        expect.objectContaining({
          method: 'PATCH',
          body: { action: 'UNASSIGN' },
        }),
      );
    });
  });

  it('restores a pending child staff unassignment when assigning the same coverage back before saving', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_open_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      userName: 'Open staff shift',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T14:00:00.000Z',
        endDate: '2026-07-21T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-21T14:00:00.000Z',
      plannedEnd: '2026-07-21T15:00:00.000Z',
    };
    const childAssignment = {
      id: 'staff_child_1',
      parentAssignmentId: 'staff_parent_open_1',
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T14:00:00.000Z',
        endDate: '2026-07-21T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-21T14:00:00.000Z',
      plannedEnd: '2026-07-21T15:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment, childAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (options?.method === 'POST') {
        throw new Error('Unexpected duplicate child create');
      }
      return {};
    });
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

    await user.click(await screen.findByRole('button', { name: 'Select Sam Staff' }));
    expect(await screen.findByRole('heading', { name: 'Edit Staff Assignment' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unassign staff member' }));
    expect(await screen.findByRole('button', { name: /Save changes \(1\)/ })).toBeEnabled();

    await user.click(await screen.findByRole('button', { name: 'Select Open staff shift' }));
    expect(await screen.findByRole('heading', { name: 'Assign Staff Coverage' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByPlaceholderText('Select staff member'));
    fireEvent.click(screen.getByRole('option', { name: /Sam Staff/i, hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Assign coverage' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });
    expect(screen.queryByRole('heading', { name: 'Assign Staff Coverage' })).not.toBeInTheDocument();
    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
  });

  it('stages assigning a staff member to every parent coverage instance', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_open_series_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      userName: 'Open staff shift',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T14:00:00.000Z',
        endDate: '2026-07-23T15:00:00.000Z',
        repeating: true,
        daysOfWeek: [1, 2],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-21T14:00:00.000Z',
      plannedEnd: '2026-07-21T15:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (options?.method === 'PATCH') {
        return {
          assignment: {
            ...parentAssignment,
            userId: options.body.userId,
            staffMemberId: 'staff_member_1',
            userName: 'Sam Staff',
          },
        };
      }
      if (options?.method === 'POST') {
        throw new Error('Unexpected child create for all-instance assignment');
      }
      return {};
    });
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

    await user.click((await screen.findAllByRole('button', { name: 'Select Open staff shift' }))[0]);
    const assignDialog = await screen.findByRole('dialog');
    await user.click(within(assignDialog).getByPlaceholderText('Select staff member'));
    fireEvent.click(screen.getByRole('option', { name: /Sam Staff/i, hidden: true }));
    await user.click(within(assignDialog).getByRole('button', { name: 'Assign coverage' }));

    expect(await screen.findByRole('heading', { name: 'Assign staff coverage' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All instances' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Select Sam Staff' }).length).toBeGreaterThanOrEqual(2);
    });
    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
    expect(await screen.findByRole('button', { name: /Save changes \(1\)/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Save changes \(1\)/ }));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/organizations/org_test/staff/schedule/staff_parent_open_series_1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ userId: 'staff_user_1' }),
        }),
      );
    });
    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it('stages assigning a staff member only to the clicked parent coverage occurrence', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_open_series_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      userName: 'Open staff shift',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T14:00:00.000Z',
        endDate: '2026-07-23T15:00:00.000Z',
        repeating: true,
        daysOfWeek: [1, 2],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-21T14:00:00.000Z',
      plannedEnd: '2026-07-21T15:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (path.endsWith('/staff/schedule') && options?.method === 'POST') {
        return {
          assignment: {
            id: 'created_child_assignment',
            ...options.body,
            staffMemberId: 'staff_member_1',
            userName: 'Sam Staff',
            plannedStart: options.body.timeSlot?.startDate,
            plannedEnd: options.body.timeSlot?.endDate,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      if (options?.method === 'PATCH') {
        throw new Error('Unexpected parent update for occurrence assignment');
      }
      return {};
    });
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

    await user.click((await screen.findAllByRole('button', { name: 'Select Open staff shift' }))[0]);
    const assignDialog = await screen.findByRole('dialog');
    await user.click(within(assignDialog).getByPlaceholderText('Select staff member'));
    fireEvent.click(screen.getByRole('option', { name: /Sam Staff/i, hidden: true }));
    await user.click(within(assignDialog).getByRole('button', { name: 'Assign coverage' }));
    await user.click(await screen.findByRole('button', { name: 'This occurrence' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select Sam Staff' })).toBeInTheDocument();
    });
    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    expect(await screen.findByRole('button', { name: /Save changes \(1\)/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Save changes \(1\)/ }));
    await waitFor(() => {
      const createCall = apiRequestMock.mock.calls.find(([path, options]) => (
        String(path).endsWith('/staff/schedule') && options?.method === 'POST'
      ));
      expect(createCall?.[1]?.body).toEqual(expect.objectContaining({
        parentAssignmentId: 'staff_parent_open_series_1',
        userId: 'staff_user_1',
        assignmentKind: 'STAFF_SHIFT',
        fieldId: 'field_main',
      }));
      expect(createCall?.[1]?.body?.timeSlot).toEqual(expect.objectContaining({
        repeating: false,
        daysOfWeek: [1],
      }));
    });
  });

  it('renders open parent coverage gaps around partial child assignments', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_open_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      userName: 'Open staff shift',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T14:00:00.000Z',
        endDate: '2026-07-21T16:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 960,
      },
      plannedStart: '2026-07-21T14:00:00.000Z',
      plannedEnd: '2026-07-21T16:00:00.000Z',
    };
    const childAssignment = {
      id: 'staff_child_1',
      parentAssignmentId: 'staff_parent_open_1',
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T14:00:00.000Z',
        endDate: '2026-07-21T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-21T14:00:00.000Z',
      plannedEnd: '2026-07-21T15:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment, childAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      return {};
    });

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={buildOrganizationWithFacilityRentalFields()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    const gapStart = new Date('2026-07-21T15:00:00.000Z');
    const gapEnd = new Date('2026-07-21T16:00:00.000Z');
    const fullParentStart = new Date('2026-07-21T14:00:00.000Z');
    const gapRangeId = `event-range-facility-calendar-staff-schedule-staff_parent_open_1-field_main-${fullParentStart.getTime()}-open-gap-${gapStart.getTime()}-${gapEnd.getTime()}`;

    expect(await screen.findByRole('button', { name: 'Select Sam Staff' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId(gapRangeId)).toHaveTextContent(`${gapStart.toISOString()}|${gapEnd.toISOString()}`);
    });
    expect(screen.queryByTestId(`event-range-facility-calendar-staff-schedule-staff_parent_open_1-field_main-${fullParentStart.getTime()}`)).not.toBeInTheDocument();
  });

  it('opens assigned parent staff cards with a delete option', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_assigned_1',
      parentAssignmentId: null,
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T15:00:00.000Z',
        endDate: '2026-07-21T16:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 900,
        endTimeMinutes: 960,
      },
      plannedStart: '2026-07-21T15:00:00.000Z',
      plannedEnd: '2026-07-21T16:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (path.endsWith('/staff/schedule/staff_parent_assigned_1') && options?.method === 'DELETE') {
        return { id: 'staff_parent_assigned_1', deleted: true };
      }
      return {};
    });
    const user = userEvent.setup();
    const organization = buildOrganizationWithFacilityRentalFields();
    organization.fields[1] = {
      ...organization.fields[1],
      facilityId: 'facility_river_city',
      facility: organization.facilities[0],
    };

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
      expect(screen.getByRole('button', { name: 'Select Sam Staff' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Select Sam Staff' }));

    expect(await screen.findByRole('heading', { name: 'Edit Staff Assignment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete assignment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unassign staff member' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete assignment' }));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/organizations/org_test/staff/schedule/staff_parent_assigned_1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('stages deleting this and following open staff assignments with future child coverage warning', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_open_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      userName: 'Open staff shift',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-14T14:00:00.000Z',
        endDate: null,
        repeating: true,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-14T14:00:00.000Z',
      plannedEnd: '2026-07-14T15:00:00.000Z',
    };
    const pastChildAssignment = {
      id: 'staff_child_past_1',
      parentAssignmentId: 'staff_parent_open_1',
      staffMemberId: 'staff_member_past',
      userId: 'staff_user_past',
      userName: 'Pat Past',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-14T14:00:00.000Z',
        endDate: '2026-07-14T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-14T14:00:00.000Z',
      plannedEnd: '2026-07-14T15:00:00.000Z',
    };
    const futureChildAssignment = {
      id: 'staff_child_future_1',
      parentAssignmentId: 'staff_parent_open_1',
      staffMemberId: 'staff_member_future',
      userId: 'staff_user_future',
      userName: 'Sam Future',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-28T14:00:00.000Z',
        endDate: '2026-07-28T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-07-28T14:00:00.000Z',
      plannedEnd: '2026-07-28T15:00:00.000Z',
    };
    const additionalFutureChildAssignments = [2, 3, 4].map((index) => ({
      ...futureChildAssignment,
      id: `staff_child_future_${index}`,
      staffMemberId: `staff_member_future_${index}`,
      userId: `staff_user_future_${index}`,
      userName: `Future Staff ${index}`,
      timeSlot: {
        ...futureChildAssignment.timeSlot,
        startDate: `2026-07-${27 + index}T14:00:00.000Z`,
        endDate: `2026-07-${27 + index}T15:00:00.000Z`,
        daysOfWeek: [index],
      },
      plannedStart: `2026-07-${27 + index}T14:00:00.000Z`,
      plannedEnd: `2026-07-${27 + index}T15:00:00.000Z`,
    }));
    const futureChildAssignments = [futureChildAssignment, ...additionalFutureChildAssignments];
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment, pastChildAssignment, ...futureChildAssignments],
          staffMembers: [{
            staffMemberId: 'staff_member_future',
            userId: 'staff_user_future',
            fullName: 'Sam Future',
            types: ['STAFF'],
          }],
        };
      }
      const matchedFutureChildAssignment = futureChildAssignments.find((assignment) => (
        path.endsWith(`/staff/schedule/${assignment.id}`)
      ));
      if (matchedFutureChildAssignment && options?.method === 'PATCH') {
        return {
          assignment: {
            ...matchedFutureChildAssignment,
            status: 'CANCELLED',
          },
        };
      }
      if (path.endsWith('/staff/schedule/staff_parent_open_1') && options?.method === 'PATCH') {
        return {
          assignment: {
            ...parentAssignment,
            timeSlot: options.body.timeSlot,
            plannedEnd: options.body.timeSlot?.endDate,
          },
        };
      }
      return {};
    });
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

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Select Open staff shift' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: 'Select Open staff shift' })[0]);

    expect(await screen.findByRole('heading', { name: 'Assign Staff Coverage' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete open staff shift' }));

    expect(await screen.findByRole('heading', { name: 'Delete open staff shift' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This and following' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All instances' })).toBeInTheDocument();
    expect(screen.getByText(/Sam Future .* Main/)).toBeInTheDocument();
    expect(screen.getByText(/Future Staff 4 .* Main/)).toBeInTheDocument();
    expect(screen.queryByText(/Pat Past .* Main/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Assigned coverage removal list')).toHaveStyle({
      maxHeight: '162px',
      overflowY: 'auto',
    });

    await user.click(screen.getByRole('button', { name: 'Stage delete' }));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /Save changes \(1\)/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: 'Select Open staff shift' })[0]);
    await user.click(await screen.findByRole('button', { name: 'Delete open staff shift' }));
    await user.click(await screen.findByRole('button', { name: 'Stage delete' }));
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    await waitFor(() => {
      const staffWriteCalls = apiRequestMock.mock.calls.filter(([path, options]) => (
        String(path).includes('/staff/schedule/')
        && options?.method
      ));
      expect(staffWriteCalls.slice(0, 4).map(([path, options]) => ({
        path,
        method: options?.method,
        body: options?.body,
      }))).toEqual(futureChildAssignments.map((assignment) => ({
        path: `/api/organizations/org_test/staff/schedule/${assignment.id}`,
        method: 'PATCH',
        body: { action: 'UNASSIGN' },
      })));
      expect(staffWriteCalls[4]).toEqual([
        '/api/organizations/org_test/staff/schedule/staff_parent_open_1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({
            timeSlot: expect.objectContaining({
              repeating: true,
              endDate: expect.any(String),
            }),
          }),
        }),
      ]);
    });
  });

  it('stages parent staff resource reassignment until calendar changes are saved', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_assigned_1',
      parentAssignmentId: null,
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T15:00:00.000Z',
        endDate: '2026-07-21T16:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 900,
        endTimeMinutes: 960,
      },
      plannedStart: '2026-07-21T15:00:00.000Z',
      plannedEnd: '2026-07-21T16:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (path.endsWith('/staff/schedule/staff_parent_assigned_1') && options?.method === 'PATCH') {
        return {
          assignment: {
            ...parentAssignment,
            fieldId: options.body.fieldId,
            facilityId: options.body.facilityId,
          },
        };
      }
      return {};
    });
    const user = userEvent.setup();
    const organization = buildOrganizationWithFacilityRentalFields();
    organization.fields[1] = {
      ...organization.fields[1],
      facilityId: 'facility_river_city',
      facility: organization.facilities[0],
    };

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
      expect(screen.getByRole('button', { name: 'Select Sam Staff' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Select Sam Staff' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByPlaceholderText('Select resources'));
    fireEvent.click(screen.getByRole('option', { name: /Field 2/i, hidden: true }));
    await waitFor(() => {
      expect(within(dialog).getAllByText('River City Sports Complex - Field 2').length).toBeGreaterThan(0);
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save assignment' }));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/organizations/org_test/staff/schedule/staff_parent_assigned_1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({
            fieldId: 'field_2',
            facilityId: 'facility_river_city',
          }),
        }),
      );
    });
  });

  it('stages staff assignment card resize until calendar changes are saved', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_assigned_1',
      parentAssignmentId: null,
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-07-21T15:00:00.000Z',
        endDate: '2026-07-21T16:00:00.000Z',
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 900,
        endTimeMinutes: 960,
      },
      plannedStart: '2026-07-21T15:00:00.000Z',
      plannedEnd: '2026-07-21T16:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (path.endsWith('/staff/schedule/staff_parent_assigned_1') && options?.method === 'PATCH') {
        return {
          assignment: {
            ...parentAssignment,
            ...options.body,
            plannedStart: options.body.timeSlot?.startDate,
            plannedEnd: options.body.timeSlot?.endDate,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      return {};
    });
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

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Resize Sam Staff' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(screen.getAllByRole('button', { name: 'Resize Sam Staff' })[0]);

    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Edit Staff Assignment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Assign Staff Coverage' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    const expectedStart = new Date('2026-03-11T12:00:00.000Z');
    const expectedEnd = new Date('2026-03-11T14:00:00.000Z');
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/organizations/org_test/staff/schedule/staff_parent_assigned_1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({
            fieldId: 'field_main',
            facilityId: 'facility_river_city',
            timeSlot: expect.objectContaining({
              startDate: expectedStart.toISOString(),
              endDate: expectedEnd.toISOString(),
              repeating: false,
              daysOfWeek: [2],
              startTimeMinutes: expectedStart.getHours() * 60 + expectedStart.getMinutes(),
              endTimeMinutes: expectedEnd.getHours() * 60 + expectedEnd.getMinutes(),
            }),
          }),
        }),
      );
    });
  });

  it('resizes an assigned repeating staff assignment without changing the series date range', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_repeating_assigned_1',
      parentAssignmentId: null,
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-03-03T15:00:00.000Z',
        endDate: '2026-12-31T23:59:59.999Z',
        repeating: true,
        daysOfWeek: [1, 2, 3],
        startTimeMinutes: 900,
        endTimeMinutes: 960,
      },
      plannedStart: '2026-03-03T15:00:00.000Z',
      plannedEnd: '2026-03-03T16:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (path.endsWith('/staff/schedule/staff_parent_repeating_assigned_1') && options?.method === 'PATCH') {
        return {
          assignment: {
            ...parentAssignment,
            ...options.body,
            plannedStart: options.body.timeSlot?.startDate,
            plannedEnd: options.body.timeSlot?.endDate,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      return {};
    });
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

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Resize Sam Staff' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(screen.getAllByRole('button', { name: 'Resize Sam Staff' })[0]);
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    const resizedStart = new Date('2026-03-11T12:00:00.000Z');
    const resizedEnd = new Date('2026-03-11T14:00:00.000Z');
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/organizations/org_test/staff/schedule/staff_parent_repeating_assigned_1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({
            fieldId: 'field_main',
            facilityId: 'facility_river_city',
            timeSlot: expect.objectContaining({
              startDate: '2026-03-03T15:00:00.000Z',
              endDate: '2026-12-31T23:59:59.999Z',
              repeating: true,
              daysOfWeek: [1, 2, 3],
              startTimeMinutes: resizedStart.getHours() * 60 + resizedStart.getMinutes(),
              endTimeMinutes: resizedEnd.getHours() * 60 + resizedEnd.getMinutes(),
            }),
          }),
        }),
      );
    });
  });

  it('moves an assigned repeating staff assignment without replacing its repeat days', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_repeating_move_1',
      parentAssignmentId: null,
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_river_city',
      facilityName: 'River City Sports Complex',
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-03-03T15:00:00.000Z',
        endDate: '2026-12-31T23:59:59.999Z',
        repeating: true,
        daysOfWeek: [1, 2, 3],
        startTimeMinutes: 900,
        endTimeMinutes: 960,
      },
      plannedStart: '2026-03-03T15:00:00.000Z',
      plannedEnd: '2026-03-03T16:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (path.endsWith('/staff/schedule/staff_parent_repeating_move_1') && options?.method === 'PATCH') {
        return {
          assignment: {
            ...parentAssignment,
            ...options.body,
            plannedStart: options.body.timeSlot?.startDate,
            plannedEnd: options.body.timeSlot?.endDate,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      return {};
    });
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

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Drag Sam Staff' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(screen.getAllByRole('button', { name: 'Drag Sam Staff' })[0]);
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    const movedStart = new Date('2026-03-11T12:00:00.000Z');
    const movedEnd = new Date('2026-03-11T13:00:00.000Z');
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/organizations/org_test/staff/schedule/staff_parent_repeating_move_1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({
            fieldId: 'field_main',
            facilityId: 'facility_river_city',
            timeSlot: expect.objectContaining({
              startDate: '2026-03-03T15:00:00.000Z',
              endDate: '2026-12-31T23:59:59.999Z',
              repeating: true,
              daysOfWeek: [1, 2, 3],
              startTimeMinutes: movedStart.getHours() * 60 + movedStart.getMinutes(),
              endTimeMinutes: movedEnd.getHours() * 60 + movedEnd.getMinutes(),
            }),
          }),
        }),
      );
    });
  });

  it('shortens all child coverage when resizing an open repeating parent shorter', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_open_series_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      userName: 'Open staff shift',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: null,
      facilityName: null,
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-03-10T12:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
        repeating: true,
        daysOfWeek: [1, 2],
        startTimeMinutes: 720,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-03-10T12:00:00.000Z',
      plannedEnd: '2026-03-10T15:00:00.000Z',
    };
    const pastChildAssignment = {
      id: 'staff_child_past_1',
      parentAssignmentId: 'staff_parent_open_series_1',
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: null,
      facilityName: null,
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-03-09T12:00:00.000Z',
        endDate: '2026-03-09T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [0],
        startTimeMinutes: 720,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-03-09T12:00:00.000Z',
      plannedEnd: '2026-03-09T15:00:00.000Z',
    };
    const futureChildAssignment = {
      id: 'staff_child_future_1',
      parentAssignmentId: 'staff_parent_open_series_1',
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: null,
      facilityName: null,
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-03-18T12:00:00.000Z',
        endDate: '2026-03-18T15:00:00.000Z',
        repeating: false,
        daysOfWeek: [2],
        startTimeMinutes: 720,
        endTimeMinutes: 900,
      },
      plannedStart: '2026-03-18T12:00:00.000Z',
      plannedEnd: '2026-03-18T15:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment, pastChildAssignment, futureChildAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      if (options?.method === 'PATCH') {
        return {
          assignment: {
            ...(path.endsWith('/staff_child_future_1') ? futureChildAssignment : parentAssignment),
            ...options.body,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      return {};
    });
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

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Resize Open staff shift' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(screen.getAllByRole('button', { name: 'Resize Open staff shift' })[0]);

    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    await waitFor(() => {
      expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(3);
    });
    const patchCalls = apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'PATCH');
    const resizedStart = new Date('2026-03-11T12:00:00.000Z');
    const resizedEnd = new Date('2026-03-11T14:00:00.000Z');
    const expectedStartTimeMinutes = resizedStart.getHours() * 60 + resizedStart.getMinutes();
    const expectedEndTimeMinutes = resizedEnd.getHours() * 60 + resizedEnd.getMinutes();
    expect(patchCalls[0][0]).toBe('/api/organizations/org_test/staff/schedule/staff_child_past_1');
    expect(patchCalls[0][1].body).toEqual(expect.objectContaining({
      timeSlot: expect.objectContaining({
        startDate: '2026-03-09T12:00:00.000Z',
        endDate: '2026-03-09T14:00:00.000Z',
        repeating: false,
        daysOfWeek: [0],
        startTimeMinutes: expectedStartTimeMinutes,
        endTimeMinutes: expectedEndTimeMinutes,
      }),
    }));
    expect(patchCalls[1][0]).toBe('/api/organizations/org_test/staff/schedule/staff_child_future_1');
    expect(patchCalls[1][1].body).toEqual(expect.objectContaining({
      timeSlot: expect.objectContaining({
        startDate: '2026-03-18T12:00:00.000Z',
        endDate: '2026-03-18T14:00:00.000Z',
        repeating: false,
        daysOfWeek: [2],
        startTimeMinutes: expectedStartTimeMinutes,
        endTimeMinutes: expectedEndTimeMinutes,
      }),
    }));
    expect(patchCalls[2][0]).toBe('/api/organizations/org_test/staff/schedule/staff_parent_open_series_1');
    expect(patchCalls[2][1].body).toEqual(expect.objectContaining({
      timeSlot: expect.objectContaining({
        startDate: '2026-03-10T12:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
        repeating: true,
        daysOfWeek: [1, 2],
        startTimeMinutes: expectedStartTimeMinutes,
        endTimeMinutes: expectedEndTimeMinutes,
      }),
    }));
  });

  it('warns instead of staging when child coverage is resized outside the parent shift', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => field);
    const parentAssignment = {
      id: 'staff_parent_open_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      userName: 'Open staff shift',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: null,
      facilityName: null,
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-03-11T12:00:00.000Z',
        endDate: '2026-03-11T13:00:00.000Z',
        repeating: false,
        daysOfWeek: [2],
        startTimeMinutes: 720,
        endTimeMinutes: 780,
      },
      plannedStart: '2026-03-11T12:00:00.000Z',
      plannedEnd: '2026-03-11T13:00:00.000Z',
    };
    const childAssignment = {
      id: 'staff_child_1',
      parentAssignmentId: 'staff_parent_open_1',
      staffMemberId: 'staff_member_1',
      userId: 'staff_user_1',
      userName: 'Sam Staff',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: null,
      facilityName: null,
      fieldId: 'field_main',
      fieldName: 'Main',
      rateOverrideCents: null,
      status: 'PLANNED',
      timeSlot: {
        startDate: '2026-03-11T12:00:00.000Z',
        endDate: '2026-03-11T13:00:00.000Z',
        repeating: false,
        daysOfWeek: [2],
        startTimeMinutes: 720,
        endTimeMinutes: 780,
      },
      plannedStart: '2026-03-11T12:00:00.000Z',
      plannedEnd: '2026-03-11T13:00:00.000Z',
    };
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return {
          assignments: [parentAssignment, childAssignment],
          staffMembers: [{
            staffMemberId: 'staff_member_1',
            userId: 'staff_user_1',
            fullName: 'Sam Staff',
            types: ['STAFF'],
          }],
        };
      }
      return {};
    });
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resize Sam Staff' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    mockShowNotification.mockClear();
    await user.click(screen.getByRole('button', { name: 'Resize Sam Staff' }));

    expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({
      color: 'yellow',
      message: 'Assigned coverage must stay inside the parent shift.',
    }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Edit Staff Assignment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Assign Staff Coverage' })).not.toBeInTheDocument();
    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
  });

  it('opens inline facility details for managers', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'Facility details' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Facility details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Facility' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Resource' })).toBeInTheDocument();
    expect(screen.getAllByText('Facilities').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getAllByText('River City Sports Complex').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('River City Sports Complex');
    expect(screen.getByText('Operating hours')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday opens')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday closes')).toBeInTheDocument();
  });

  it('saves facility operating hours from inline details', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'Facility details' }));

    expect(await screen.findByRole('heading', { name: 'River City Sports Complex' })).toBeInTheDocument();
    const opensInput = screen.getByLabelText('Monday opens');
    const closesInput = screen.getByLabelText('Monday closes');
    expect(opensInput).toHaveValue('08:00');
    expect(closesInput).toHaveValue('22:00');

    await user.clear(opensInput);
    await user.type(opensInput, '07:00');
    await user.clear(closesInput);
    await user.type(closesInput, '21:30');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

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

  it('creates unsaved facilities and resources together from inline details', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const emptyOrganization = {
      $id: 'org_empty',
      name: 'Empty Org',
      ownerId: 'owner_1',
      hasStripeAccount: false,
      facilities: [],
      fields: [],
    } as any;
    createFacilityMock.mockImplementation(async (data: any) => ({
      $id: 'facility_new_saved',
      organizationId: 'org_empty',
      ...data,
    }));
    createFieldMock.mockImplementation(async (data: any) => ({
      $id: 'field_new_saved',
      rentalSlotIds: [],
      rentalSlots: [],
      ...data,
    }));
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <FieldsTabContent
          organization={emptyOrganization}
          organizationId="org_empty"
          currentUser={{ $id: 'owner_1' } as any}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Manage facilities' }));
    expect(screen.getByRole('button', { name: '+ Resource' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '+ Facility' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'North Annex');
    await user.type(screen.getByLabelText('Location'), '200 North Ave');
    await user.click(screen.getByRole('button', { name: '+ Resource' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Court 1');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(createFacilityMock).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'org_empty',
        name: 'North Annex',
      }));
    });
    expect(createFieldMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Court 1',
      facilityId: 'facility_new_saved',
    }));
    expect(updateFacilityMock).not.toHaveBeenCalled();
    expect(updateFieldMock).not.toHaveBeenCalled();
  });

  it('undoes inline facility detail changes before saving', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'Facility details' }));
    const nameInput = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Temporary Name');
    expect(screen.getByRole('button', { name: /Save changes/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('River City Sports Complex');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(updateFacilityMock).not.toHaveBeenCalled();
  });

  it('assigns an existing resource to another facility from inline details', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const organization = buildOrganizationWithFacilityRentalFields();
    organization.facilities.push({
      $id: 'facility_annex',
      organizationId: 'org_test',
      name: 'North Annex',
      location: '200 North Ave',
      address: '200 North Ave',
      coordinates: [-122.68, 45.53],
      operatingHours: null,
      isDefault: false,
      sortOrder: 1,
    });
    updateFieldMock.mockImplementation(async (data: any) => ({
      $id: data.$id,
      name: 'Main',
      location: '',
      lat: 0,
      long: 0,
      rentalSlotIds: [],
      rentalSlots: [],
      facilityId: data.facilityId,
      sportIds: data.sportIds ?? [],
    }));
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

    await user.click(await screen.findByRole('button', { name: 'Facility details' }));
    await user.click(screen.getByRole('button', { name: /Main/ }));
    await user.click(screen.getByRole('textbox', { name: 'Facility' }));
    fireEvent.click(screen.getByRole('option', { name: 'North Annex', hidden: true }));
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(updateFieldMock).toHaveBeenCalledWith(expect.objectContaining({
        $id: 'field_main',
        facilityId: 'facility_annex',
      }));
    });
  });

  it('can hide the discover back action for organization members', async () => {
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
          organization={buildOrganizationWithRentalSlot()}
          organizationId="org_test"
          currentUser={{ $id: 'owner_1' } as any}
          showBackButton={false}
        />
      </MantineProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Back to Discover' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    expect(await screen.findByText('Rental slot')).toBeInTheDocument();
  });

  it('opens a dropped staff draft for editing and stores the edit as an undoable step', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(within(screen.getByLabelText('Facility resources')).getByRole('button', { name: 'All' }));
    const staffCreateCard = screen.getByText('Staff shift').closest('.facility-calendar-create-card');
    expect(staffCreateCard).not.toBeNull();
    await waitFor(() => {
      expect(staffCreateCard).not.toHaveClass('facility-calendar-create-card--disabled');
    });

    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
      });
      fireEvent(staffCreateCard!, event);
    };
    dispatchPointer('pointerdown', 10, 10);
    dispatchPointer('pointermove', 150, 200);
    dispatchPointer('pointerup', 150, 200);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Select Open staff shift' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: 'Select Open staff shift' })[0]);

    expect(await screen.findByRole('heading', { name: 'Edit Staff Draft' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Notes'), 'Gate coverage');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('button', { name: /Save changes \(2\)/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: /Save changes \(1\)/ })).toBeEnabled();
  });

	  it('renders queued repeating staff drafts as repeated calendar occurrences', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return { assignments: [], staffMembers: [] };
      }
      if (path.endsWith('/staff/schedule') && options?.method === 'POST') {
        return {
          assignment: {
            id: 'created_staff_assignment',
            ...options.body,
            plannedStart: options.body.timeSlot?.startDate,
            plannedEnd: options.body.timeSlot?.endDate,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      return {};
    });
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    const staffCreateCard = screen.getByText('Staff shift').closest('.facility-calendar-create-card');
    expect(staffCreateCard).not.toBeNull();
    await waitFor(() => {
      expect(staffCreateCard).not.toHaveClass('facility-calendar-create-card--disabled');
    });

    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
      });
      fireEvent(staffCreateCard!, event);
    };
    dispatchPointer('pointerdown', 10, 10);
    dispatchPointer('pointermove', 150, 200);
    dispatchPointer('pointerup', 150, 200);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Select Open staff shift' })).toHaveLength(1);
    });
    await user.click(screen.getByRole('button', { name: 'Select Open staff shift' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit Staff Draft' })).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Repeat weekly'));
    await user.click(within(dialog).getByPlaceholderText('Select days'));
    fireEvent.click(screen.getByRole('option', { name: 'Tuesday', hidden: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Wednesday', hidden: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Thursday', hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Select Open staff shift' }).length).toBeGreaterThanOrEqual(3);
    });
    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Save changes \(2\)/ }));
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    });
    const staffCreateCall = apiRequestMock.mock.calls.find(([path, options]) => (
      String(path).endsWith('/staff/schedule') && options?.method === 'POST'
    ));
	    expect(staffCreateCall?.[1]?.body?.timeSlot).toEqual(expect.objectContaining({
	      repeating: true,
	      daysOfWeek: expect.arrayContaining([1, 2, 3]),
	    }));
	  });

	  it('asks for assignment scope when saving a repeating official draft with an official selected', async () => {
	    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
	    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
	      ...field,
	      events: [],
	      matches: [],
	    }));
	    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
	      if (path.endsWith('/staff/schedule') && !options?.method) {
	        return {
	          assignments: [],
	          staffMembers: [{
	            staffMemberId: 'official_member_1',
	            userId: 'official_user_1',
	            fullName: 'Sam Official',
	            types: ['OFFICIAL'],
	            roleName: 'Official',
	          }],
	        };
	      }
	      if (path.endsWith('/staff/schedule') && options?.method === 'POST') {
	        return {
	          assignment: {
	            id: 'created_official_assignment',
	            ...options.body,
	            plannedStart: options.body.timeSlot?.startDate,
	            plannedEnd: options.body.timeSlot?.endDate,
	            timeSlot: options.body.timeSlot,
	          },
	        };
	      }
	      return {};
	    });
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

	    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
	    const officialCreateCard = screen.getByText('Official shift').closest('.facility-calendar-create-card');
	    expect(officialCreateCard).not.toBeNull();
	    await waitFor(() => {
	      expect(officialCreateCard).not.toHaveClass('facility-calendar-create-card--disabled');
	    });

	    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
	      const event = new Event(type, { bubbles: true, cancelable: true });
	      Object.defineProperties(event, {
	        clientX: { value: clientX },
	        clientY: { value: clientY },
	        button: { value: 0 },
	        pointerId: { value: 1 },
	        pointerType: { value: 'mouse' },
	      });
	      fireEvent(officialCreateCard!, event);
	    };
	    dispatchPointer('pointerdown', 10, 10);
	    dispatchPointer('pointermove', 150, 200);
	    dispatchPointer('pointerup', 150, 200);

	    await waitFor(() => {
	      expect(screen.getByRole('button', { name: 'Select Open official shift' })).toBeInTheDocument();
	    });
	    await user.click(screen.getByRole('button', { name: 'Select Open official shift' }));

	    const dialog = await screen.findByRole('dialog');
	    expect(within(dialog).getByRole('heading', { name: 'Edit Official Draft' })).toBeInTheDocument();
	    await user.click(within(dialog).getByLabelText('Official'));
	    fireEvent.click(screen.getByRole('option', { name: /Sam Official/i, hidden: true }));
	    await user.click(within(dialog).getByLabelText('Repeat weekly'));
	    await user.click(within(dialog).getByPlaceholderText('Select days'));
	    fireEvent.click(screen.getByRole('option', { name: 'Tuesday', hidden: true }));
	    fireEvent.click(screen.getByRole('option', { name: 'Wednesday', hidden: true }));
	    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));

	    expect(await screen.findByRole('heading', { name: 'Assign official coverage' })).toBeInTheDocument();
	    await user.click(screen.getByRole('button', { name: 'All instances' }));

	    await waitFor(() => {
	      expect(screen.getAllByRole('button', { name: 'Select Sam Official' }).length).toBeGreaterThanOrEqual(2);
	    });
	    expect(screen.queryByRole('button', { name: 'Select Open official shift' })).not.toBeInTheDocument();
	    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);

	    await user.click(screen.getByRole('button', { name: /Save changes \(2\)/ }));
	    await waitFor(() => {
	      expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
	    });
	    const officialCreateCall = apiRequestMock.mock.calls.find(([path, options]) => (
	      String(path).endsWith('/staff/schedule') && options?.method === 'POST'
	    ));
	    expect(officialCreateCall?.[1]?.body).toEqual(expect.objectContaining({
	      parentAssignmentId: null,
	      userId: 'official_user_1',
	      assignmentKind: 'OFFICIAL_SHIFT',
	    }));
	    expect(officialCreateCall?.[1]?.body?.timeSlot).toEqual(expect.objectContaining({
	      repeating: true,
	      daysOfWeek: expect.arrayContaining([1, 2]),
	    }));
	  });

	  it('stages one assigned child draft while keeping the remaining repeating parent draft open', async () => {
	    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
	    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
	      ...field,
	      events: [],
	      matches: [],
	    }));
	    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
	      if (path.endsWith('/staff/schedule') && !options?.method) {
	        return {
	          assignments: [],
	          staffMembers: [{
	            staffMemberId: 'staff_member_1',
	            userId: 'staff_user_1',
	            fullName: 'Sam Staff',
	            types: ['STAFF'],
	            roleName: 'Staff',
	          }],
	        };
	      }
	      if (path.endsWith('/staff/schedule') && options?.method === 'POST') {
	        return {
	          assignment: {
	            id: options.body.parentAssignmentId ? 'created_child_assignment' : 'created_parent_assignment',
	            ...options.body,
	            plannedStart: options.body.timeSlot?.startDate,
	            plannedEnd: options.body.timeSlot?.endDate,
	            timeSlot: options.body.timeSlot,
	          },
	        };
	      }
	      return {};
	    });
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

	    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
	    const staffCreateCard = screen.getByText('Staff shift').closest('.facility-calendar-create-card');
	    expect(staffCreateCard).not.toBeNull();
	    await waitFor(() => {
	      expect(staffCreateCard).not.toHaveClass('facility-calendar-create-card--disabled');
	    });

	    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
	      const event = new Event(type, { bubbles: true, cancelable: true });
	      Object.defineProperties(event, {
	        clientX: { value: clientX },
	        clientY: { value: clientY },
	        button: { value: 0 },
	        pointerId: { value: 1 },
	        pointerType: { value: 'mouse' },
	      });
	      fireEvent(staffCreateCard!, event);
	    };
	    dispatchPointer('pointerdown', 10, 10);
	    dispatchPointer('pointermove', 150, 200);
	    dispatchPointer('pointerup', 150, 200);

	    await waitFor(() => {
	      expect(screen.getByRole('button', { name: 'Select Open staff shift' })).toBeInTheDocument();
	    });
	    await user.click(screen.getByRole('button', { name: 'Select Open staff shift' }));

	    const dialog = await screen.findByRole('dialog');
	    expect(within(dialog).getByRole('heading', { name: 'Edit Staff Draft' })).toBeInTheDocument();
	    await user.click(within(dialog).getByLabelText('Staff member'));
	    fireEvent.click(screen.getByRole('option', { name: /Sam Staff/i, hidden: true }));
	    await user.click(within(dialog).getByLabelText('Repeat weekly'));
	    await user.click(within(dialog).getByPlaceholderText('Select days'));
	    fireEvent.click(screen.getByRole('option', { name: 'Tuesday', hidden: true }));
	    fireEvent.click(screen.getByRole('option', { name: 'Wednesday', hidden: true }));
	    fireEvent.click(screen.getByRole('option', { name: 'Thursday', hidden: true }));
	    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));

	    expect(await screen.findByRole('heading', { name: 'Assign staff coverage' })).toBeInTheDocument();
	    await user.click(screen.getByRole('button', { name: 'This occurrence' }));

	    await waitFor(() => {
	      expect(screen.getByRole('button', { name: 'Select Sam Staff' })).toBeInTheDocument();
	    });
	    expect(screen.getAllByRole('button', { name: 'Select Open staff shift' }).length).toBeGreaterThanOrEqual(2);
	    expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);

	    await user.click(screen.getByRole('button', { name: /Save changes \(2\)/ }));
	    await waitFor(() => {
	      expect(apiRequestMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2);
	    });
	    const staffCreateCalls = apiRequestMock.mock.calls.filter(([path, options]) => (
	      String(path).endsWith('/staff/schedule') && options?.method === 'POST'
	    ));
	    expect(staffCreateCalls[0]?.[1]?.body).toEqual(expect.objectContaining({
	      parentAssignmentId: null,
	      userId: null,
	      assignmentKind: 'STAFF_SHIFT',
	    }));
	    expect(staffCreateCalls[0]?.[1]?.body?.timeSlot).toEqual(expect.objectContaining({
	      repeating: true,
	      daysOfWeek: expect.arrayContaining([1, 2, 3]),
	    }));
	    expect(staffCreateCalls[1]?.[1]?.body).toEqual(expect.objectContaining({
	      parentAssignmentId: 'created_parent_assignment',
	      userId: 'staff_user_1',
	      assignmentKind: 'STAFF_SHIFT',
	    }));
	    expect(staffCreateCalls[1]?.[1]?.body?.timeSlot).toEqual(expect.objectContaining({
	      repeating: false,
	      daysOfWeek: [0],
	    }));
	  });

  it('resizes a repeating rental draft without changing the draft series date range', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const organization = buildOrganizationWithFacilityRentalFields();
    const field = organization.fields[0] as any;
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(within(screen.getByLabelText('Facility resources')).getByRole('button', { name: 'All' }));
    const rentalCreateCard = screen.getByText('Rental slot').closest('.facility-calendar-create-card');
    expect(rentalCreateCard).not.toBeNull();
    await waitFor(() => {
      expect(rentalCreateCard).not.toHaveClass('facility-calendar-create-card--disabled');
    });

    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
      });
      fireEvent(rentalCreateCard!, event);
    };
    dispatchPointer('pointerdown', 10, 10);
    dispatchPointer('pointermove', 150, 200);
    dispatchPointer('pointerup', 150, 200);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Select Open rental slot' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: 'Select Open rental slot' })[0]);
    expect(mockCreateRentalSlotModalProps?.onSubmitOverride).toEqual(expect.any(Function));

    const draftRentalPayload = {
      dayOfWeek: 1,
      daysOfWeek: [1, 2, 3],
      repeating: true,
      startDate: '2026-03-03T09:00:00.000Z',
      endDate: '2026-12-31T23:59:59.999Z',
      startTimeMinutes: 540,
      endTimeMinutes: 600,
      price: 27500,
      requiredTemplateIds: [],
      hostRequiredTemplateIds: [],
      taxHandling: 'STRIPE_TAX',
    };
    await act(async () => {
      await mockCreateRentalSlotModalProps.onSubmitOverride({
        field,
        targetFields: [field],
        payload: draftRentalPayload,
        updatePayload: draftRentalPayload,
      });
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Resize Open rental slot' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: 'Resize Open rental slot' })[0]);
    await user.click(await screen.findByRole('button', { name: /Save changes/ }));

    const resizedStart = new Date('2026-03-11T12:00:00.000Z');
    const resizedEnd = new Date('2026-03-11T14:00:00.000Z');
    await waitFor(() => {
      expect(createRentalSlotMock).toHaveBeenCalledTimes(1);
    });
    expect(createRentalSlotMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      startDate: '2026-03-03T09:00:00.000Z',
      endDate: '2026-12-31T23:59:59.999Z',
      repeating: true,
      daysOfWeek: [1, 2, 3],
      startTimeMinutes: resizedStart.getHours() * 60 + resizedStart.getMinutes(),
      endTimeMinutes: resizedEnd.getHours() * 60 + resizedEnd.getMinutes(),
    }));
  });

  it('resizes a repeating staff draft without changing the draft series date range', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return { assignments: [], staffMembers: [] };
      }
      if (path.endsWith('/staff/schedule') && options?.method === 'POST') {
        return {
          assignment: {
            id: 'created_staff_assignment',
            ...options.body,
            plannedStart: options.body.timeSlot?.startDate,
            plannedEnd: options.body.timeSlot?.endDate,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      return {};
    });
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    const staffCreateCard = screen.getByText('Staff shift').closest('.facility-calendar-create-card');
    expect(staffCreateCard).not.toBeNull();
    await waitFor(() => {
      expect(staffCreateCard).not.toHaveClass('facility-calendar-create-card--disabled');
    });

    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
      });
      fireEvent(staffCreateCard!, event);
    };
    dispatchPointer('pointerdown', 10, 10);
    dispatchPointer('pointermove', 150, 200);
    dispatchPointer('pointerup', 150, 200);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select Open staff shift' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Select Open staff shift' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Repeat weekly'));
    await user.click(within(dialog).getByPlaceholderText('Select days'));
    fireEvent.click(screen.getByRole('option', { name: 'Tuesday', hidden: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Wednesday', hidden: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Thursday', hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Resize Open staff shift' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: 'Resize Open staff shift' })[0]);
    await user.click(await screen.findByRole('button', { name: /Save changes/ }));

    const resizedStart = new Date('2026-03-11T12:00:00.000Z');
    const resizedEnd = new Date('2026-03-11T14:00:00.000Z');
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.filter(([path, options]) => (
        String(path).endsWith('/staff/schedule') && options?.method === 'POST'
      ))).toHaveLength(1);
    });
    const staffCreateCall = apiRequestMock.mock.calls.find(([path, options]) => (
      String(path).endsWith('/staff/schedule') && options?.method === 'POST'
    ));
    expect(staffCreateCall?.[1]?.body?.timeSlot).toEqual(expect.objectContaining({
      repeating: true,
      daysOfWeek: expect.arrayContaining([1, 2, 3]),
      startTimeMinutes: resizedStart.getHours() * 60 + resizedStart.getMinutes(),
      endTimeMinutes: resizedEnd.getHours() * 60 + resizedEnd.getMinutes(),
    }));
    expect(staffCreateCall?.[1]?.body?.timeSlot?.startDate).not.toBe(resizedStart.toISOString());
  });

  it('moves a repeating staff draft without replacing its repeat days', async () => {
    getNextRentalOccurrenceMock.mockImplementation((slot: any) => new Date(slot.startDate));
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    apiRequestMock.mockImplementation(async (path: string, options?: any) => {
      if (path.endsWith('/staff/schedule') && !options?.method) {
        return { assignments: [], staffMembers: [] };
      }
      if (path.endsWith('/staff/schedule') && options?.method === 'POST') {
        return {
          assignment: {
            id: 'created_staff_assignment',
            ...options.body,
            plannedStart: options.body.timeSlot?.startDate,
            plannedEnd: options.body.timeSlot?.endDate,
            timeSlot: options.body.timeSlot,
          },
        };
      }
      return {};
    });
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    const staffCreateCard = screen.getByText('Staff shift').closest('.facility-calendar-create-card');
    expect(staffCreateCard).not.toBeNull();
    await waitFor(() => {
      expect(staffCreateCard).not.toHaveClass('facility-calendar-create-card--disabled');
    });

    const dispatchPointer = (type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
      });
      fireEvent(staffCreateCard!, event);
    };
    dispatchPointer('pointerdown', 10, 10);
    dispatchPointer('pointermove', 150, 200);
    dispatchPointer('pointerup', 150, 200);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Select Open staff shift' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Select Open staff shift' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Repeat weekly'));
    await user.click(within(dialog).getByPlaceholderText('Select days'));
    fireEvent.click(screen.getByRole('option', { name: 'Tuesday', hidden: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Wednesday', hidden: true }));
    fireEvent.click(screen.getByRole('option', { name: 'Thursday', hidden: true }));
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Drag Open staff shift' }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: 'Drag Open staff shift' })[0]);
    await user.click(await screen.findByRole('button', { name: /Save changes/ }));

    const movedStart = new Date('2026-03-11T12:00:00.000Z');
    const movedEnd = new Date('2026-03-11T13:00:00.000Z');
    await waitFor(() => {
      expect(apiRequestMock.mock.calls.filter(([path, options]) => (
        String(path).endsWith('/staff/schedule') && options?.method === 'POST'
      ))).toHaveLength(1);
    });
    const staffCreateCall = apiRequestMock.mock.calls.find(([path, options]) => (
      String(path).endsWith('/staff/schedule') && options?.method === 'POST'
    ));
    expect(staffCreateCall?.[1]?.body?.timeSlot).toEqual(expect.objectContaining({
      repeating: true,
      daysOfWeek: expect.arrayContaining([1, 2, 3]),
      startTimeMinutes: movedStart.getHours() * 60 + movedStart.getMinutes(),
      endTimeMinutes: movedEnd.getHours() * 60 + movedEnd.getMinutes(),
    }));
    expect(staffCreateCall?.[1]?.body?.timeSlot?.startDate).not.toBe(movedStart.toISOString());
  });

  it('stages rental slot modal edits until managers save calendar changes', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
    }));
    const organization = buildOrganizationWithRentalSlot();
    const field = organization.fields[0] as any;
    const slot = field.rentalSlots[0];
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(await screen.findByRole('button', { name: 'Select Rental Slot' }));

    expect(mockCreateRentalSlotModalProps?.onSubmitOverride).toEqual(expect.any(Function));

    const editedSlot = {
      $id: 'slot_1',
      dayOfWeek: 2,
      repeating: true,
      startDate: '2026-03-11T00:00:00.000Z',
      endDate: null,
      startTimeMinutes: 720,
      endTimeMinutes: 780,
      price: 1500,
      requiredTemplateIds: [],
      hostRequiredTemplateIds: [],
      taxHandling: 'STRIPE_TAX',
    };
    await act(async () => {
      await mockCreateRentalSlotModalProps.onSubmitOverride({
        field,
        targetFields: [field],
        slot,
        payload: editedSlot,
        updatePayload: editedSlot,
      });
    });

    expect(updateRentalSlotMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

    await waitFor(() => {
      expect(updateRentalSlotMock).toHaveBeenCalledTimes(1);
    });
    expect(updateRentalSlotMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      $id: 'slot_1',
      dayOfWeek: 2,
      startTimeMinutes: 720,
      endTimeMinutes: 780,
      price: 1500,
    }));
  });

  it('stages dragged rental slots until managers save calendar changes', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'Edit schedule' }));
    await user.click(await screen.findByRole('button', { name: 'Drag Rental Slot' }));

    await waitFor(() => {
      expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(draggedRentalRangeText);
    });
    expect(updateRentalSlotMock).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));

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
      dayOfWeek: 1,
      daysOfWeek: [1],
      scheduledFieldId: 'field_main',
      scheduledFieldIds: ['field_main'],
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:00.000Z',
      startTimeMinutes: expectedStartMinutes,
      endTimeMinutes: expectedEndMinutes,
    }));
  });

  it('updates dragged rental slots locally before saving', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(screen.getByRole('button', { name: 'Drag Rental Slot' }));

    await waitFor(() => {
      expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(draggedRentalRangeText);
    });
    expect(updateRentalSlotMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Save changes \(1\)/ })).toBeEnabled();
  });

  it('undoes a staged rental slot move before saving', async () => {
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
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

    await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
    await user.click(screen.getByRole('button', { name: 'Drag Rental Slot' }));

    await waitFor(() => {
      expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(draggedRentalRangeText);
    });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => {
      expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(originalRentalRangeText);
    });
    expect(updateRentalSlotMock).not.toHaveBeenCalled();
  });

  it('discards staged calendar changes without saving', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const rentalDate = new Date('2026-03-10T10:00:00.000Z');
    getNextRentalOccurrenceMock.mockReturnValue(rentalDate);
    getFieldEventsMatchesMock.mockImplementation(async (field: any) => ({
      ...field,
      events: [],
      matches: [],
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

      await user.click(screen.getByRole('button', { name: 'Edit schedule' }));
      await user.click(screen.getByRole('button', { name: 'Drag Rental Slot' }));

      await waitFor(() => {
        expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(draggedRentalRangeText);
      });

      await user.click(screen.getByRole('button', { name: 'Discard changes' }));

      expect(confirmSpy).toHaveBeenCalledWith('Discard all unsaved calendar changes?');
      await waitFor(() => {
        expect(screen.getByTestId('event-range-slot_1')).toHaveTextContent(originalRentalRangeText);
      });
      expect(screen.getByRole('button', { name: 'Edit schedule' })).toBeInTheDocument();
      expect(updateRentalSlotMock).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
