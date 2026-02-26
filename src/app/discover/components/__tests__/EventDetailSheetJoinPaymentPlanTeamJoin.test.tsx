import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import { buildEvent, buildTeam, buildUser } from '../../../../../test/factories';

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
jest.mock('@/components/ui/PaymentModal', () => () => null);
jest.mock('@/components/ui/RefundSection', () => () => null);
jest.mock('@/components/ui/UserCard', () => () => null);

import EventDetailSheet from '../EventDetailSheet';
import { useApp } from '@/app/providers';
import { billService } from '@/lib/billService';
import { eventService } from '@/lib/eventService';
import { familyService } from '@/lib/familyService';
import { paymentService } from '@/lib/paymentService';
import { teamService } from '@/lib/teamService';

describe('EventDetailSheet payment-plan team join', () => {
  it('registers the team immediately, then creates the payment-plan bill', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_1',
      teamSignup: true,
      start: futureStart,
      end: futureEnd,
      price: 2500,
      allowPaymentPlans: true,
      requiredTemplateIds: [],
      divisions: ['u15', 'u17'],
      divisionDetails: [
        { id: 'u15', name: 'U15' },
        { id: 'u17', name: 'U17' },
      ] as any,
    });

    const team = buildTeam({
      $id: 'team_1',
      name: 'Camka Team',
      division: 'U17',
      sport: 'Volleyball',
    });

    const user = buildUser({
      $id: 'user_1',
      dateOfBirth: '1990-01-01',
      teamIds: [team.$id],
    });
    const authUser = { $id: user.$id, email: 'user@example.com', name: user.fullName };

    (useApp as jest.Mock).mockReturnValue({ user, authUser });
    (familyService.listChildren as jest.Mock).mockResolvedValue([]);
    (eventService.getEventWithRelations as jest.Mock).mockResolvedValue(event);
    (eventService.getEvent as jest.Mock).mockResolvedValue(event);
    (teamService.getTeamsByIds as jest.Mock).mockResolvedValue([team]);
    (paymentService.joinEvent as jest.Mock).mockResolvedValue(undefined);
    (billService.createBill as jest.Mock).mockResolvedValue({ bill: { id: 'bill_1' } });

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    const divisionSelect = await screen.findByPlaceholderText(/Select a division/i);
    fireEvent.click(divisionSelect);
    const divisionOption = Array.from(document.querySelectorAll('[data-combobox-option]')).find((element) =>
      (element.textContent ?? '').includes('U17'),
    );
    if (!divisionOption) {
      throw new Error('Expected a combobox option for division U17.');
    }
    fireEvent.click(divisionOption);

    const joinAsTeamButton = await screen.findByRole('button', { name: /Join as Team/i });
    fireEvent.click(joinAsTeamButton);

    const teamSelect = await screen.findByPlaceholderText(/Choose a team/i);
    fireEvent.click(teamSelect);
    const teamOption = Array.from(document.querySelectorAll('[data-combobox-option]')).find((element) =>
      /Camka Team/i.test(element.textContent ?? ''),
    );
    if (!teamOption) {
      throw new Error('Expected a combobox option for Camka Team.');
    }
    fireEvent.click(teamOption);

    fireEvent.click(screen.getByRole('button', { name: /Join for/i }));

    await waitFor(() => {
      expect(screen.getByText(/payment plan started/i)).toBeInTheDocument();
    });

    expect(paymentService.joinEvent).toHaveBeenCalled();
    expect(billService.createBill).toHaveBeenCalled();

    const joinSelectionArg = (paymentService.joinEvent as jest.Mock).mock.calls[0][5];
    expect(joinSelectionArg).toEqual(expect.objectContaining({ divisionId: 'u17' }));

    const joinCallOrder = (paymentService.joinEvent as jest.Mock).mock.invocationCallOrder[0];
    const billCallOrder = (billService.createBill as jest.Mock).mock.invocationCallOrder[0];
    expect(joinCallOrder).toBeLessThan(billCallOrder);

    expect(billService.createBill).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'TEAM',
        ownerId: team.$id,
        eventId: event.$id,
        timeoutMs: 5000,
      }),
    );

    expect(paymentService.joinEvent).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ $id: event.$id }),
      expect.objectContaining({ $id: team.$id }),
      undefined,
      undefined,
      expect.objectContaining({ divisionId: 'u17' }),
      5000,
    );
  });
});
