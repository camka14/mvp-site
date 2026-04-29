import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import FieldsTabContent from '../FieldsTabContent';

const pushMock = jest.fn();
const getOrganizationByIdMock = jest.fn();
const getOrganizationsByOwnerMock = jest.fn();
const getFieldEventsMatchesMock = jest.fn();
const updateRentalSlotMock = jest.fn();
const getNextRentalOccurrenceMock = jest.fn();
const mockShowNotification = jest.fn();

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
jest.mock('@/components/ui/CreateRentalSlotModal', () => () => null);

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationById: (...args: any[]) => getOrganizationByIdMock(...args),
    getOrganizationsByOwner: (...args: any[]) => getOrganizationsByOwnerMock(...args),
  },
}));

jest.mock('@/lib/fieldService', () => ({
  fieldService: {
    getFieldEventsMatches: (...args: any[]) => getFieldEventsMatchesMock(...args),
    updateRentalSlot: (...args: any[]) => updateRentalSlotMock(...args),
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
          startDate: '2026-03-10T10:00:00.000Z',
          endDate: '2026-03-10T11:00:00.000Z',
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
          startDate: '2026-03-10T12:00:00.000Z',
          endDate: '2026-03-10T13:00:00.000Z',
          scheduledFieldId: 'field_2',
          scheduledFieldIds: ['field_2'],
        },
      ],
    },
  ],
}) as any;

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
    expect(await screen.findByTestId('event-range-slot_2')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-resource-count')).toHaveTextContent('none');

    await user.click(screen.getByRole('button', { name: /Field 2/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('event-range-slot_2')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('event-range-slot_1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Field 2/i }));

    await waitFor(() => {
      expect(screen.getByTestId('event-range-slot_2')).toBeInTheDocument();
    });
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
