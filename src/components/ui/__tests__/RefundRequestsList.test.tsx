import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RefundRequestsList from '../RefundRequestsList';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

jest.mock('@/lib/refundRequestService', () => ({
  refundRequestService: {
    listRefundRequests: jest.fn(),
    updateRefundStatus: jest.fn(),
  },
}));
jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventById: jest.fn(),
  },
}));
jest.mock('@/lib/userService', () => ({
  userService: {
    getUsersByIds: jest.fn(),
  },
}));
jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    getOrganizationsByIds: jest.fn(),
  },
}));

const { refundRequestService } = jest.requireMock('@/lib/refundRequestService') as {
  refundRequestService: { listRefundRequests: jest.Mock; updateRefundStatus: jest.Mock };
};
const { eventService } = jest.requireMock('@/lib/eventService') as { eventService: { getEventById: jest.Mock } };
const { userService } = jest.requireMock('@/lib/userService') as { userService: { getUsersByIds: jest.Mock } };
const { organizationService } = jest.requireMock('@/lib/organizationService') as {
  organizationService: { getOrganizationsByIds: jest.Mock };
};

describe('RefundRequestsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventService.getEventById.mockResolvedValue(undefined);
    userService.getUsersByIds.mockResolvedValue([]);
    organizationService.getOrganizationsByIds.mockResolvedValue([]);
  });

  it('loads and renders refund requests', async () => {
    refundRequestService.listRefundRequests.mockResolvedValue([
      {
        $id: 'refund_1',
        eventId: 'event_123',
        userId: 'user_1',
        reason: 'Need to cancel',
        hostId: 'host_1',
        organizationId: 'org_1',
        $createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    eventService.getEventById.mockImplementation(async (id: string) => ({ $id: id, name: `Event ${id}` }));
    userService.getUsersByIds.mockResolvedValue([
      { $id: 'user_1', firstName: 'Test', lastName: 'User' } as any,
      { $id: 'host_1', firstName: 'Host', lastName: 'One' } as any,
    ]);
    organizationService.getOrganizationsByIds.mockResolvedValue([{ $id: 'org_1', name: 'Org One' } as any]);

    renderWithMantine(<RefundRequestsList userId="user_1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    expect(await screen.findByText('Your Refund Requests')).toBeInTheDocument();
    expect(await screen.findByText('Event event_123')).toBeInTheDocument();
    expect(screen.getByText('Need to cancel')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('Org One')).toBeInTheDocument();
    expect(screen.getByText('WAITING')).toBeInTheDocument();
  });

  it('shows empty state when no refunds exist', async () => {
    refundRequestService.listRefundRequests.mockResolvedValue([]);

    renderWithMantine(<RefundRequestsList userId="user_2" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    expect(await screen.findByText(/No refund requests/)).toBeInTheDocument();
  });

  it('allows approving or denying a refund request', async () => {
    refundRequestService.listRefundRequests.mockResolvedValue([
      {
        $id: 'refund_1',
        eventId: 'event_123',
        userId: 'user_1',
        reason: 'Need to cancel',
        hostId: 'host_1',
        organizationId: 'org_1',
        status: 'WAITING',
        $createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    refundRequestService.updateRefundStatus.mockResolvedValue({
      $id: 'refund_1',
      eventId: 'event_123',
      userId: 'user_1',
      reason: 'Need to cancel',
      hostId: 'host_1',
      organizationId: 'org_1',
      status: 'APPROVED',
      $createdAt: '2024-01-01T00:00:00.000Z',
    });

    eventService.getEventById.mockImplementation(async (id: string) => ({ $id: id, name: `Event ${id}` }));
    userService.getUsersByIds.mockResolvedValue([
      { $id: 'user_1', firstName: 'Test', lastName: 'User' } as any,
      { $id: 'host_1', firstName: 'Host', lastName: 'One' } as any,
    ]);

    renderWithMantine(<RefundRequestsList hostId="host_1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    const user = userEvent.setup();
    const approveButton = await screen.findByRole('button', { name: /approve/i });
    await user.click(approveButton);

    await waitFor(() =>
      expect(refundRequestService.updateRefundStatus).toHaveBeenCalledWith('refund_1', 'APPROVED')
    );

    expect(await screen.findByText('APPROVED')).toBeInTheDocument();
  });

  it('hides actions for self-requested refunds but shows them when acting as host', async () => {
    refundRequestService.listRefundRequests.mockResolvedValue([
      {
        $id: 'refund_1',
        eventId: 'event_123',
        userId: 'user_1',
        reason: 'Need to cancel',
        hostId: 'host_2',
        organizationId: 'org_1',
        status: 'WAITING',
        $createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        $id: 'refund_2',
        eventId: 'event_456',
        userId: 'user_3',
        reason: 'Guest refund',
        hostId: 'user_1',
        organizationId: 'org_2',
        status: 'WAITING',
        $createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]);

    eventService.getEventById.mockImplementation(async (id: string) => ({ $id: id, name: `Event ${id}` }));
    userService.getUsersByIds.mockResolvedValue([
      { $id: 'user_1', firstName: 'Test', lastName: 'User' } as any,
      { $id: 'user_3', firstName: 'Guest', lastName: 'User' } as any,
      { $id: 'host_2', firstName: 'Other', lastName: 'Host' } as any,
    ]);

    renderWithMantine(<RefundRequestsList userId="user_1" hostId="user_1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    const ownRowText = await screen.findByText('Need to cancel');
    const ownRow = ownRowText.closest('tr');
    expect(ownRow).not.toBeNull();
    expect(within(ownRow as HTMLElement).queryByRole('button', { name: /approve/i })).toBeNull();

    const hostRowText = await screen.findByText('Guest refund');
    const hostRow = hostRowText.closest('tr');
    expect(hostRow).not.toBeNull();
    expect(within(hostRow as HTMLElement).getByRole('button', { name: /approve/i })).toBeInTheDocument();
  });
});
