import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import { buildEvent, buildTimeSlot, buildUser } from '../../../../../test/factories';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, fill, unoptimized, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} {...rest} />;
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/app/providers', () => ({
  useApp: jest.fn(),
}));

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
  isApiRequestError: jest.fn(() => false),
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventWithRelations: jest.fn(),
    getEvent: jest.fn(),
    getEventParticipants: jest.fn(),
    addToWaitlist: jest.fn(),
    removeFromWaitlist: jest.fn(),
    addFreeAgent: jest.fn(),
    removeFreeAgent: jest.fn(),
  },
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    getUsersByIds: jest.fn(),
    getUserById: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getTeamsByIds: jest.fn(),
  },
}));

jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createPaymentIntent: jest.fn(),
    joinEvent: jest.fn(),
    leaveEvent: jest.fn(),
    requestTeamRefund: jest.fn(),
  },
}));

jest.mock('@/lib/billService', () => ({
  billService: {
    createBill: jest.fn(),
  },
}));

jest.mock('@/lib/boldsignService', () => ({
  boldsignService: {
    createSignLinks: jest.fn(),
  },
}));

jest.mock('@/lib/signedDocumentService', () => ({
  signedDocumentService: {
    isDocumentSigned: jest.fn(),
  },
}));

jest.mock('@/lib/familyService', () => ({
  familyService: {
    listChildren: jest.fn(),
  },
}));

jest.mock('@/lib/registrationService', () => ({
  registrationService: {
    registerSelfForEvent: jest.fn(),
    registerChildForEvent: jest.fn(),
  },
}));

jest.mock('@/components/ui/ParticipantsPreview', () => () => null);
jest.mock('@/components/ui/ParticipantsDropdown', () => () => null);
jest.mock('@/components/ui/BillingAddressModal', () => () => null);
jest.mock('@/components/ui/PaymentModal', () => () => null);
jest.mock('@/components/ui/RefundSection', () => () => null);
jest.mock('@/components/ui/UserCard', () => () => null);

import EventDetailSheet from '../EventDetailSheet';
import { useApp } from '@/app/providers';
import { eventService } from '@/lib/eventService';
import { familyService } from '@/lib/familyService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';

const toIsoDateString = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMondayIndex = (value: Date): number => (value.getDay() + 6) % 7;

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('EventDetailSheet details layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event: null,
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: 10,
      occurrence: null,
    });
  });

  it('ignores a late event-detail response after switching to another event', async () => {
    const sourceEventA = buildEvent({ $id: 'event_a', name: 'Source Event A' });
    const sourceEventB = buildEvent({ $id: 'event_b', name: 'Source Event B' });
    const loadedEventA = buildEvent({ $id: 'event_a', name: 'Late Loaded Event A' });
    const loadedEventB = buildEvent({ $id: 'event_b', name: 'Current Loaded Event B' });
    const eventALoad = createDeferred<ReturnType<typeof buildEvent>>();
    const eventBLoad = createDeferred<ReturnType<typeof buildEvent>>();
    const user = buildUser({ $id: 'user_stale_load', dateOfBirth: '1990-01-01' });

    (useApp as jest.Mock).mockReturnValue({
      user,
      authUser: { $id: user.$id, email: 'user@example.com', name: user.fullName },
    });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockImplementation((eventId: string) => {
      if (eventId === sourceEventA.$id) return eventALoad.promise;
      if (eventId === sourceEventB.$id) return eventBLoad.promise;
      return Promise.resolve(null);
    });
    (eventService.getEvent as jest.Mock).mockResolvedValue(null);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    function EventSwitcher() {
      const [selectedEvent, setSelectedEvent] = React.useState(sourceEventA);
      return (
        <>
          <button type="button" onClick={() => setSelectedEvent(sourceEventB)}>Show event B</button>
          <EventDetailSheet event={selectedEvent} isOpen={true} onClose={jest.fn()} />
        </>
      );
    }

    renderWithMantine(<EventSwitcher />);

    await waitFor(() => {
      expect(eventService.getEventWithRelations).toHaveBeenCalledWith(sourceEventA.$id);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show event B' }));

    await waitFor(() => {
      expect(eventService.getEventWithRelations).toHaveBeenCalledWith(sourceEventB.$id);
    });

    await act(async () => {
      eventBLoad.resolve(loadedEventB);
      await eventBLoad.promise;
    });
    expect(await screen.findByText('Current Loaded Event B')).toBeInTheDocument();

    await act(async () => {
      eventALoad.resolve(loadedEventA);
      await eventALoad.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('Current Loaded Event B')).toBeInTheDocument();
      expect(screen.queryByText('Late Loaded Event A')).not.toBeInTheDocument();
    });
  });

  it('omits duplicated division settings while keeping start date visible', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_1',
      eventType: 'TOURNAMENT',
      teamSignup: true,
      singleDivision: false,
      start: futureStart,
      end: futureEnd,
      maxParticipants: 10,
      teamSizeLimit: 2,
      usesSets: true,
      setDurationMinutes: 20,
      doubleElimination: true,
      winnerSetCount: 3,
      loserSetCount: 1,
      winnerBracketPointsToVictory: [21, 21, 21],
      loserBracketPointsToVictory: [21],
      divisions: ['coed-open', 'mens-open'],
      divisionDetails: [
        { id: 'coed-open', name: 'CoEd Open - 18+' },
        { id: 'mens-open', name: 'Mens Open - 18+' },
      ] as any,
      timeSlots: [
        buildTimeSlot({
          $id: 'slot_1',
          dayOfWeek: 1,
          startTimeMinutes: 18 * 60,
          endTimeMinutes: 19 * 60,
          scheduledFieldId: 'field_1',
        }),
      ],
      fields: [{ $id: 'field_1', name: 'Field 1' }] as any,
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({ user, authUser });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Start date')).toBeInTheDocument();
    });

    expect(screen.queryByText('Division Settings')).not.toBeInTheDocument();
    expect(screen.getByText('Start date')).toBeInTheDocument();
  });

  it('does not repeat matching host and location labels in the hero subtitle', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const event = buildEvent({
      $id: 'affiliate_event_duplicate_labels',
      name: 'Saving 2nd Base - Fall 2026',
      eventType: 'TOURNAMENT',
      teamSignup: false,
      start: futureStart,
      price: 0,
      maxParticipants: 0,
      location: 'Portland Metro Softball Association',
      organizationId: 'affiliate_org_portland_metro_softball_association',
      organization: {
        $id: 'affiliate_org_portland_metro_softball_association',
        name: 'Portland Metro Softball Association',
        website: 'https://www.portlandsoftball.com',
        ownerId: 'owner_1',
      } as any,
      affiliateUrl: 'https://www.portlandsoftball.com/current-programs',
      divisions: [],
      divisionDetails: [],
    });
    const user = buildUser({
      $id: 'user_duplicate_labels',
      dateOfBirth: '1990-01-01',
    });

    (useApp as jest.Mock).mockReturnValue({ user, authUser: { $id: user.$id, email: 'user@example.com' } });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Saving 2nd Base - Fall 2026')).toBeInTheDocument();
    });

    expect(screen.queryByText('Portland Metro Softball Association · Portland Metro Softball Association')).not.toBeInTheDocument();
    expect(screen.getAllByText('Portland Metro Softball Association').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /portland metro softball association/i })).toHaveAttribute(
      'href',
      '/organizations/affiliate_org_portland_metro_softball_association',
    );
  });

  it('shows missing affiliate prices as not specified in event details', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const event = buildEvent({
      $id: 'affiliate_event_missing_price',
      name: 'Cascade Athletic Clubs Gresham Tennis Doubles Flights',
      eventType: 'EVENT',
      teamSignup: false,
      start: futureStart,
      price: 0,
      priceText: null,
      maxParticipants: null,
      location: 'Cascade Athletic Clubs Gresham',
      organizationId: 'affiliate_org_cascade_athletic_clubs_gresham',
      organization: {
        $id: 'affiliate_org_cascade_athletic_clubs_gresham',
        name: 'Cascade Athletic Clubs Gresham',
        website: 'https://cascadeac.com/gresham/sports-programs/tennis/',
        ownerId: 'owner_1',
      } as any,
      affiliateUrl: 'https://docs.google.com/forms/d/1Fhl7Jzd1YURHpZpVt3nhEmEEFpGqrvZSyjLihd6tqrE/viewform?edit_requested=true',
      divisions: [],
      divisionDetails: [],
    });
    const user = buildUser({
      $id: 'user_missing_price',
      dateOfBirth: '1990-01-01',
    });

    (useApp as jest.Mock).mockReturnValue({ user, authUser: { $id: user.$id, email: 'user@example.com' } });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Cascade Athletic Clubs Gresham Tennis Doubles Flights')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Price not specified').length).toBeGreaterThan(0);
    expect(screen.queryByText('Free / player')).not.toBeInTheDocument();
  });

  it('shows an inline auth modal for guests instead of redirecting away from event details', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const event = buildEvent({
      $id: 'guest_event_1',
      eventType: 'EVENT',
      teamSignup: false,
      start: futureStart,
      price: 0,
      maxParticipants: 10,
      divisions: [],
      divisionDetails: [],
    });

    (useApp as jest.Mock).mockReturnValue({
      user: null,
      authUser: null,
      refreshSession: jest.fn(),
    });
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    const authButton = await screen.findByRole('button', { name: /register \/ login/i });
    fireEvent.click(authButton);

    expect(await screen.findByText('Sign in to register')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('notifies the parent when an inline weekly session is selected', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const occurrence = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const occurrenceDate = toIsoDateString(occurrence);
    const dayIndex = toMondayIndex(occurrence);
    const event = buildEvent({
      $id: 'weekly_event_1',
      eventType: 'WEEKLY_EVENT',
      teamSignup: false,
      start: today.toISOString(),
      end: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      maxParticipants: 10,
      divisions: ['coed-open'],
      divisionDetails: [{ id: 'coed-open', name: 'CoEd Open - 18+' }] as any,
      timeSlots: [
        buildTimeSlot({
          $id: 'slot_weekly_1',
          dayOfWeek: dayIndex,
          daysOfWeek: [dayIndex] as any,
          startDate: today.toISOString(),
          endDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
        }),
      ],
      fields: [{ $id: 'field_1', name: 'Court 1' }] as any,
    });
    const user = buildUser({ $id: 'user_1', dateOfBirth: '1990-01-01' });
    const onWeeklyOccurrenceChange = jest.fn();

    (useApp as jest.Mock).mockReturnValue({ user, authUser: { $id: user.$id, email: 'user@example.com' } });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    renderWithMantine(
      <EventDetailSheet
        event={event}
        isOpen={true}
        onClose={jest.fn()}
        renderInline={true}
        onWeeklyOccurrenceChange={onWeeklyOccurrenceChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Select a weekly session')).toBeInTheDocument();
    });

    const selectButtons = screen.getAllByRole('button').filter((button) => button.textContent?.includes('Tap to select'));
    expect(selectButtons.length).toBeGreaterThan(0);
    fireEvent.click(selectButtons[0]);

    expect(onWeeklyOccurrenceChange).toHaveBeenCalledWith({
      slotId: 'slot_weekly_1',
      occurrenceDate,
    });
  });

  it('builds weekly session options when timeslot dates are Date objects', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const occurrence = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const dayIndex = toMondayIndex(occurrence);
    const event = buildEvent({
      $id: 'weekly_event_date_objects',
      eventType: 'WEEKLY_EVENT',
      teamSignup: false,
      start: today.toISOString(),
      end: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      maxParticipants: 10,
      divisions: ['open'],
      timeSlots: [
        buildTimeSlot({
          $id: 'slot_weekly_date',
          dayOfWeek: dayIndex,
          daysOfWeek: [dayIndex] as any,
          startDate: today as any,
          endDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000) as any,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
        }),
      ],
      fields: [{ $id: 'field_1', name: 'Court 1' }] as any,
    });
    const user = buildUser({ $id: 'user_date_object', dateOfBirth: '1990-01-01' });

    (useApp as jest.Mock).mockReturnValue({ user, authUser: { $id: user.$id, email: 'user@example.com' } });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Select a weekly session')).toBeInTheDocument();
    });
    expect(screen.queryByText('No upcoming weekly sessions are available.')).not.toBeInTheDocument();
  });

  it('shows join controls once an inline weekly session is selected', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const occurrence = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const occurrenceDate = toIsoDateString(occurrence);
    const dayIndex = toMondayIndex(occurrence);
    const secondOccurrence = new Date(occurrence.getTime() + 24 * 60 * 60 * 1000);
    const secondDayIndex = toMondayIndex(secondOccurrence);
    const event = buildEvent({
      $id: 'weekly_event_2',
      eventType: 'WEEKLY_EVENT',
      teamSignup: false,
      start: today.toISOString(),
      end: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      price: 0,
      maxParticipants: 10,
      divisions: ['coed-open'],
      divisionDetails: [{ id: 'coed-open', name: 'CoEd Open - 18+' }] as any,
      timeSlots: [
        buildTimeSlot({
          $id: 'slot_weekly_2',
          dayOfWeek: dayIndex,
          daysOfWeek: [dayIndex] as any,
          startDate: today.toISOString(),
          endDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
        }),
        buildTimeSlot({
          $id: 'slot_weekly_3',
          dayOfWeek: secondDayIndex,
          daysOfWeek: [secondDayIndex] as any,
          startDate: today.toISOString(),
          endDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          startTimeMinutes: 11 * 60,
          endTimeMinutes: 12 * 60,
          repeating: true,
        }),
      ],
      fields: [{ $id: 'field_1', name: 'Court 1' }] as any,
    });
    const user = buildUser({ $id: 'user_2', dateOfBirth: '1990-01-01' });

    (useApp as jest.Mock).mockReturnValue({ user, authUser: { $id: user.$id, email: 'user@example.com' } });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event: {
        $id: event.$id,
        name: event.name,
        eventType: event.eventType,
        teamSignup: event.teamSignup,
        singleDivision: event.singleDivision,
        maxParticipants: event.maxParticipants,
        hostId: event.hostId,
        organizationId: event.organizationId,
        divisions: event.divisions,
        timeSlotIds: ['slot_weekly_2', 'slot_weekly_3'],
      },
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: 10,
      occurrence: { slotId: 'slot_weekly_2', occurrenceDate },
    });

    renderWithMantine(
      <EventDetailSheet
        event={event}
        isOpen={true}
        onClose={jest.fn()}
        renderInline={true}
        selectedOccurrence={{ slotId: 'slot_weekly_2', occurrenceDate }}
        onWeeklyOccurrenceChange={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(eventService.getEventParticipants).toHaveBeenCalledWith(event.$id, {
        slotId: 'slot_weekly_2',
        occurrenceDate,
      });
    });

    expect(screen.getByText('Selected weekly session')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join event/i })).toBeInTheDocument();
    expect(screen.queryByText('No upcoming weekly sessions are available.')).not.toBeInTheDocument();
  });

  it('keeps a selected past weekly session visible while disabling join actions', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const occurrence = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const occurrenceDate = toIsoDateString(occurrence);
    const dayIndex = toMondayIndex(occurrence);
    const event = buildEvent({
      $id: 'weekly_event_past',
      eventType: 'WEEKLY_EVENT',
      teamSignup: false,
      start: today.toISOString(),
      end: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      price: 0,
      maxParticipants: 10,
      divisions: ['coed-open'],
      divisionDetails: [{ id: 'coed-open', name: 'CoEd Open - 18+' }] as any,
      timeSlots: [
        buildTimeSlot({
          $id: 'slot_weekly_past',
          dayOfWeek: dayIndex,
          daysOfWeek: [dayIndex] as any,
          startDate: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: today.toISOString(),
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
        }),
      ],
      fields: [{ $id: 'field_1', name: 'Court 1' }] as any,
    });
    const user = buildUser({ $id: 'user_past', dateOfBirth: '1990-01-01' });

    (useApp as jest.Mock).mockReturnValue({ user, authUser: { $id: user.$id, email: 'user@example.com' } });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event: {
        $id: event.$id,
        name: event.name,
        eventType: event.eventType,
        teamSignup: event.teamSignup,
        singleDivision: event.singleDivision,
        maxParticipants: event.maxParticipants,
        hostId: event.hostId,
        organizationId: event.organizationId,
        divisions: event.divisions,
        timeSlotIds: ['slot_weekly_past'],
      },
      participants: {
        teamIds: [],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: 10,
      occurrence: { slotId: 'slot_weekly_past', occurrenceDate },
    });

    renderWithMantine(
      <EventDetailSheet
        event={event}
        isOpen={true}
        onClose={jest.fn()}
        renderInline={true}
        selectedOccurrence={{ slotId: 'slot_weekly_past', occurrenceDate }}
        onWeeklyOccurrenceChange={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(eventService.getEventParticipants).toHaveBeenCalledWith(event.$id, {
        slotId: 'slot_weekly_past',
        occurrenceDate,
      });
    });

    expect(screen.getByText('Selected weekly session')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unavailable/i })).toBeDisabled();
  });

  it('does not reload the same inline weekly participant snapshot when the event prop is recreated', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const occurrence = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const occurrenceDate = toIsoDateString(occurrence);
    const dayIndex = toMondayIndex(occurrence);
    const event = buildEvent({
      $id: 'weekly_event_stable_load',
      eventType: 'WEEKLY_EVENT',
      teamSignup: true,
      start: today.toISOString(),
      end: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      price: 0,
      maxParticipants: 10,
      divisions: ['coed-open'],
      divisionDetails: [{ id: 'coed-open', name: 'CoEd Open - 18+' }] as any,
      timeSlots: [
        buildTimeSlot({
          $id: 'slot_weekly_stable',
          dayOfWeek: dayIndex,
          daysOfWeek: [dayIndex] as any,
          startDate: today.toISOString(),
          endDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          repeating: true,
        }),
      ],
      fields: [{ $id: 'field_1', name: 'Court 1' }] as any,
    });
    const user = buildUser({ $id: 'user_stable', dateOfBirth: '1990-01-01' });

    (useApp as jest.Mock).mockReturnValue({ user, authUser: { $id: user.$id, email: 'user@example.com' } });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUsersByIds as jest.Mock).mockResolvedValue([]);
    (userService.getUserById as jest.Mock).mockResolvedValue(null);
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event,
      participants: {
        teamIds: ['team_weekly_stable'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      teams: [
        {
          $id: 'team_weekly_stable',
          name: 'Stable Team',
          playerIds: [],
          parentTeamId: 'club_team_stable',
        },
      ],
      users: [],
      participantCount: 1,
      participantCapacity: 10,
      occurrence: { slotId: 'slot_weekly_stable', occurrenceDate },
    });

    const selectedOccurrence = { slotId: 'slot_weekly_stable', occurrenceDate };
    const props = {
      isOpen: true,
      onClose: jest.fn(),
      renderInline: true,
      selectedOccurrence,
      onWeeklyOccurrenceChange: jest.fn(),
    };

    function RecreatedEventHarness() {
      const [currentEvent, setCurrentEvent] = React.useState(event);
      return (
        <>
          <button
            type="button"
            onClick={() => setCurrentEvent({ ...event, teamIds: [...(event.teamIds ?? [])] })}
          >
            Recreate event prop
          </button>
          <EventDetailSheet
            event={currentEvent}
            {...props}
          />
        </>
      );
    }

    renderWithMantine(<RecreatedEventHarness />);

    await waitFor(() => {
      expect(eventService.getEventParticipants).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /recreate event prop/i }));

    await waitFor(() => {
      expect(eventService.getEventParticipants).toHaveBeenCalledTimes(1);
    });
  });
});
