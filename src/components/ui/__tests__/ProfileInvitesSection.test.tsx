import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { buildTeam, buildUser } from '../../../../test/factories';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import type { Invite, PaymentIntent, Team } from '@/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/lib/userService', () => ({
  userService: {
    acceptInvite: jest.fn(),
    declineInvite: jest.fn(),
    listInvites: jest.fn(),
  },
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationsByIds: jest.fn(),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    getTeamById: jest.fn(),
    getTeamsByIds: jest.fn(),
  },
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEvent: jest.fn(),
  },
}));

jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    createTeamRegistrationPaymentIntent: jest.fn(),
  },
}));

jest.mock('@/components/ui/BillingAddressModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/PaymentModal', () => ({
  __esModule: true,
  default: ({ isOpen, event }: { isOpen: boolean; event: { name: string } }) => (
    isOpen ? <div data-testid="payment-modal">{event.name}</div> : null
  ),
}));

import ProfileInvitesSection from '../ProfileInvitesSection';

const userServiceMock = jest.requireMock('@/lib/userService').userService as {
  acceptInvite: jest.Mock;
  declineInvite: jest.Mock;
  listInvites: jest.Mock;
};
const organizationServiceMock = jest.requireMock('@/lib/organizationService').organizationService as {
  getOrganizationsByIds: jest.Mock;
};
const teamServiceMock = jest.requireMock('@/lib/teamService').teamService as {
  getTeamById: jest.Mock;
  getTeamsByIds: jest.Mock;
};
const eventServiceMock = jest.requireMock('@/lib/eventService').eventService as {
  getEvent: jest.Mock;
};
const paymentServiceMock = jest.requireMock('@/lib/paymentService').paymentService as {
  createTeamRegistrationPaymentIntent: jest.Mock;
};

const createChildInvite = (overrides: Partial<Invite> = {}): Invite => ({
  $id: 'invite_1',
  type: 'TEAM',
  status: 'PENDING',
  teamId: 'team_1',
  userId: 'child_1',
  childUserId: 'child_1',
  childFullName: 'Child Player',
  viewerCanAcceptForChild: true,
  ...overrides,
});

const createPaidTeam = (overrides: Partial<Team> = {}): Team => buildTeam({
  $id: 'team_1',
  name: 'Paid Child Team',
  registrationPriceCents: 2500,
  playerRegistrations: [
    {
      id: 'registration_1',
      teamId: 'team_1',
      userId: 'child_1',
      registrantId: 'child_1',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      rosterRole: 'PARTICIPANT',
      status: 'STARTED',
    },
  ],
  ...overrides,
});

const paymentIntent: PaymentIntent = {
  publishableKey: 'pk_test_mock',
  paymentIntent: 'pi_mock_secret_mock',
  feeBreakdown: {
    eventPrice: 2500,
    processingFee: 100,
    stripeFee: 0,
    totalCharge: 2600,
    hostReceives: 2500,
    feePercentage: 0,
    purchaseType: 'team_registration',
  },
};

describe('ProfileInvitesSection', () => {
  beforeEach(() => {
    userServiceMock.acceptInvite.mockReset();
    userServiceMock.declineInvite.mockReset();
    userServiceMock.listInvites.mockReset();
    organizationServiceMock.getOrganizationsByIds.mockReset();
    teamServiceMock.getTeamById.mockReset();
    teamServiceMock.getTeamsByIds.mockReset();
    eventServiceMock.getEvent.mockReset();
    paymentServiceMock.createTeamRegistrationPaymentIntent.mockReset();

    organizationServiceMock.getOrganizationsByIds.mockResolvedValue([]);
    eventServiceMock.getEvent.mockResolvedValue(null);
    userServiceMock.acceptInvite.mockResolvedValue(undefined);
    userServiceMock.declineInvite.mockResolvedValue(undefined);
    paymentServiceMock.createTeamRegistrationPaymentIntent.mockResolvedValue(paymentIntent);
  });

  it('starts checkout for a paid child team invite accepted by a parent', async () => {
    const parent = buildUser({ $id: 'parent_1' });
    const invite = createChildInvite();
    const team = createPaidTeam();

    userServiceMock.listInvites
      .mockResolvedValueOnce([invite])
      .mockResolvedValueOnce([]);
    teamServiceMock.getTeamsByIds.mockResolvedValue([team]);
    teamServiceMock.getTeamById.mockResolvedValue(team);

    renderWithMantine(
      <ProfileInvitesSection userId="parent_1" currentUser={parent} />,
    );

    await screen.findByText('Paid Child Team');

    fireEvent.click(screen.getByRole('button', { name: /accept invite/i }));

    await waitFor(() => {
      expect(userServiceMock.acceptInvite).toHaveBeenCalledWith('invite_1');
    });
    await waitFor(() => {
      expect(paymentServiceMock.createTeamRegistrationPaymentIntent).toHaveBeenCalledWith(
        parent,
        team,
        expect.objectContaining({
          id: 'registration_1',
          teamId: 'team_1',
          userId: 'child_1',
          parentId: 'parent_1',
          registrantType: 'CHILD',
        }),
        undefined,
        undefined,
      );
    });
    expect(screen.getByTestId('payment-modal')).toHaveTextContent('Paid Child Team');
  });

  it('shows an error instead of starting checkout when the accepted child registration is missing', async () => {
    const parent = buildUser({ $id: 'parent_1' });
    const invite = createChildInvite();
    const teamWithoutRegistration = createPaidTeam({ playerRegistrations: [] });

    userServiceMock.listInvites
      .mockResolvedValueOnce([invite])
      .mockResolvedValueOnce([]);
    teamServiceMock.getTeamsByIds.mockResolvedValue([teamWithoutRegistration]);
    teamServiceMock.getTeamById.mockResolvedValue(teamWithoutRegistration);

    renderWithMantine(
      <ProfileInvitesSection userId="parent_1" currentUser={parent} />,
    );

    await screen.findByText('Paid Child Team');

    fireEvent.click(screen.getByRole('button', { name: /accept invite/i }));

    await screen.findByText('Invite accepted, but the child registration could not be found for checkout.');
    expect(paymentServiceMock.createTeamRegistrationPaymentIntent).not.toHaveBeenCalled();
  });
});
