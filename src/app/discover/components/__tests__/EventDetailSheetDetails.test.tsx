import React from 'react';
import { screen, waitFor } from '@testing-library/react';

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

describe('EventDetailSheet details layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(eventService.getEventWithRelations).toHaveBeenCalledWith(event.$id);
    });

    expect(screen.queryByText('Division Settings')).not.toBeInTheDocument();
    expect(screen.getAllByText('Divisions (2)').length).toBeGreaterThan(0);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });
});
