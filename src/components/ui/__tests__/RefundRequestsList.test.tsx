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

const { refundRequestService } = jest.requireMock('@/lib/refundRequestService') as {
  refundRequestService: { listRefundRequests: jest.Mock; updateRefundStatus: jest.Mock };
};

describe('RefundRequestsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    renderWithMantine(<RefundRequestsList userId="user_1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    expect(await screen.findByText('Your Refund Requests')).toBeInTheDocument();
    expect(screen.getByText('Need to cancel')).toBeInTheDocument();
    expect(screen.getByText('event_123')).toBeInTheDocument();
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

    renderWithMantine(<RefundRequestsList userId="user_1" />);

    await waitFor(() => expect(refundRequestService.listRefundRequests).toHaveBeenCalled());

    const user = userEvent.setup();
    const approveButton = await screen.findByRole('button', { name: /approve/i });
    await user.click(approveButton);

    await waitFor(() =>
      expect(refundRequestService.updateRefundStatus).toHaveBeenCalledWith('refund_1', 'APPROVED')
    );

    expect(await screen.findByText('APPROVED')).toBeInTheDocument();
  });
});
