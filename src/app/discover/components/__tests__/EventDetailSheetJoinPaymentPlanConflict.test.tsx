import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';
import { buildEvent, buildUser } from '../../../../../test/factories';

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
    getUserById: jest.fn(),
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
import { apiRequest } from '@/lib/apiClient';
import { boldsignService } from '@/lib/boldsignService';
import { billService } from '@/lib/billService';
import { eventService } from '@/lib/eventService';
import { familyService } from '@/lib/familyService';
import { registrationService } from '@/lib/registrationService';
import { userService } from '@/lib/userService';

describe('EventDetailSheet payment-plan join conflicts', () => {
  beforeEach(() => {
    (userService.getUserById as jest.Mock).mockResolvedValue(undefined);
  });

  it('surfaces create-bill conflicts (409) and stops loading when no signing links are required', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_1',
      teamSignup: false,
      singleDivision: true,
      divisions: ['open'],
      divisionDetails: [{ id: 'open', name: 'Open' }] as any,
      start: futureStart,
      end: futureEnd,
      price: 2500,
      allowPaymentPlans: true,
      requiredTemplateIds: ['tpl_1'],
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

    (apiRequest as jest.Mock).mockResolvedValue({ ok: true });
    (boldsignService.createSignLinks as jest.Mock).mockResolvedValue([]);
    (registrationService.registerSelfForEvent as jest.Mock).mockResolvedValue({ registration: { status: 'active' } });
    (billService.createBill as jest.Mock).mockRejectedValue(
      new Error('A payment plan already exists for this owner and event.'),
    );

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    const joinButton = await screen.findByRole('button', { name: /Join Event/i });
    fireEvent.click(joinButton);
    expect(await screen.findByText(/Payment plan preview/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue with Payment Plan/i }));

    await waitFor(() => {
      expect(screen.getByText(/payment plan already exists/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Submitting/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Join Event/i })).toBeEnabled();

    expect(apiRequest).not.toHaveBeenCalled();
    expect(boldsignService.createSignLinks).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 }));
    expect(billService.createBill).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 5000 }));
  });

  it('does not join when payment-plan preview is canceled', async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const event = buildEvent({
      $id: 'event_2',
      teamSignup: false,
      singleDivision: true,
      divisions: ['open'],
      divisionDetails: [{ id: 'open', name: 'Open' }] as any,
      start: futureStart,
      end: futureEnd,
      price: 2500,
      allowPaymentPlans: true,
      requiredTemplateIds: [],
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
    (boldsignService.createSignLinks as jest.Mock).mockResolvedValue([]);
    (registrationService.registerSelfForEvent as jest.Mock).mockResolvedValue({ registration: { status: 'active' } });
    (billService.createBill as jest.Mock).mockResolvedValue({ bill: { id: 'bill_1' } });

    renderWithMantine(
      <EventDetailSheet event={event} isOpen={true} onClose={jest.fn()} renderInline={true} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Join Event/i }));
    expect(await screen.findByText(/Payment plan preview/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Payment plan preview/i)).not.toBeInTheDocument();
    });

    expect(boldsignService.createSignLinks).not.toHaveBeenCalled();
    expect(registrationService.registerSelfForEvent).not.toHaveBeenCalled();
    expect(billService.createBill).not.toHaveBeenCalled();
  });
});



