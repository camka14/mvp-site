import { screen, waitFor } from '@testing-library/react';
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

  it('hides the actions column for requester view', async () => {
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

    eventService.getEventById.mockImplementation(async (id: string) => ({ $id: id, name: `Event ${id}` }));
    userService.getUsersByIds.mockResolvedValue([
      { $id: 'user_1', firstName: 'Test', lastName: 'User' } as any,
      { $id: 'host_1', firstName: 'Host', lastName: 'One' } as any,
    ]);

    renderWithMantine(<RefundRequestsList userId="user_1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    await screen.findByText('Need to cancel');
    expect(screen.queryByText('Actions')).toBeNull();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('filters hosted refunds to the current host', async () => {
    refundRequestService.listRefundRequests.mockResolvedValue([
      {
        $id: 'refund_1',
        eventId: 'event_123',
        userId: 'host_1',
        reason: 'Self refund',
        hostId: 'host_1',
        status: 'WAITING',
        $createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        $id: 'refund_2',
        eventId: 'event_456',
        userId: 'user_2',
        reason: 'Guest refund',
        hostId: 'host_1',
        status: 'WAITING',
        $createdAt: '2024-01-02T00:00:00.000Z',
      },
      {
        $id: 'refund_3',
        eventId: 'event_789',
        userId: 'user_3',
        reason: 'Other host refund',
        hostId: 'host_2',
        status: 'WAITING',
        $createdAt: '2024-01-03T00:00:00.000Z',
      },
    ]);

    eventService.getEventById.mockImplementation(async (id: string) => ({ $id: id, name: `Event ${id}` }));
    userService.getUsersByIds.mockResolvedValue([
      { $id: 'host_1', firstName: 'Host', lastName: 'One' } as any,
      { $id: 'user_2', firstName: 'Guest', lastName: 'User' } as any,
      { $id: 'user_3', firstName: 'Other', lastName: 'User' } as any,
    ]);

    renderWithMantine(<RefundRequestsList hostId="host_1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    expect(screen.queryByText('Event event_123')).toBeNull();
    expect(await screen.findByText('Event event_456')).toBeInTheDocument();
    expect(screen.queryByText('Event event_789')).toBeNull();
  });
});
