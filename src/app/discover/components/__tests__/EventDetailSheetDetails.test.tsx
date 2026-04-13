import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

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

describe('EventDetailSheet details layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (eventService.getEventParticipants as jest.Mock).mockResolvedValue({
      event: null,
      participants: {
        teams: [],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
      },
      teams: [],
      users: [],
      participantCount: 0,
      participantCapacity: 10,
      occurrence: null,
    });
  });

  it('omits duplicated division settings while keeping divisions and schedule visible', async () => {
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
      expect(screen.getByText('Schedule')).toBeInTheDocument();
    });

    expect(screen.queryByText('Division Settings')).not.toBeInTheDocument();
    expect(screen.getAllByText('Divisions (2)').length).toBeGreaterThan(0);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('notifies the parent when an inline weekly occurrence is selected', async () => {
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
      expect(screen.getByText('Select a weekly occurrence')).toBeInTheDocument();
    });

    const selectButtons = screen.getAllByRole('button').filter((button) => button.textContent?.includes('Tap to select'));
    expect(selectButtons.length).toBeGreaterThan(0);
    fireEvent.click(selectButtons[0]);

    expect(onWeeklyOccurrenceChange).toHaveBeenCalledWith({
      slotId: 'slot_weekly_1',
      occurrenceDate,
    });
  });

  it('shows join controls once an inline weekly occurrence is selected', async () => {
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
        teams: [],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
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

    expect(screen.getByText('Selected weekly occurrence')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join event/i })).toBeInTheDocument();
    expect(screen.queryByText('No upcoming weekly sessions are available.')).not.toBeInTheDocument();
  });

  it('keeps a selected past weekly occurrence visible while disabling join actions', async () => {
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
        teams: [],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
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

    expect(screen.getByText('Selected weekly occurrence')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unavailable/i })).toBeDisabled();
  });
});
