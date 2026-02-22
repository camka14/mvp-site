import { fireEvent, screen, waitFor } from '@testing-library/react';
import RefundSection from '../RefundSection';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';
import { buildEvent } from '../../../../test/factories';
import { formatLocalDateTime } from '@/lib/dateUtils';

jest.mock('@/lib/paymentService', () => ({
  paymentService: {
    requestRefund: jest.fn(),
  },
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventById: jest.fn(),
    updateEventParticipants: jest.fn(),
  },
}));

const { paymentService: paymentServiceMock } = jest.requireMock('@/lib/paymentService') as {
  paymentService: { requestRefund: jest.Mock };
};

const { eventService: eventServiceMock } = jest.requireMock('@/lib/eventService') as {
  eventService: {
    getEventById: jest.Mock;
    updateEventParticipants: jest.Mock;
  };
};

const useAppMock = jest.fn();
jest.mock('@/app/providers', () => ({ useApp: () => useAppMock() }));

jest.setTimeout(15000);

describe('RefundSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when user not registered', () => {
    useAppMock.mockReturnValue({ user: { $id: 'user_1' } });
    const event = buildEvent();

    renderWithMantine(
      <RefundSection event={event} userRegistered={false} onRefundSuccess={jest.fn()} />,
    );

    expect(screen.queryByText(/Refund/i)).toBeNull();
  });

  it('handles automatic refunds when within deadline', async () => {
    const user = { $id: 'user_1' };
    useAppMock.mockReturnValue({ user });
    const start = formatLocalDateTime(new Date(Date.now() + 48 * 60 * 60 * 1000));
    const event = buildEvent({
      $id: 'event_1',
      hostId: 'host_1',
      price: 20,
      cancellationRefundHours: 36,
      start,
    });

    paymentServiceMock.requestRefund.mockResolvedValue({ success: true });
    const onRefundSuccess = jest.fn();

    renderWithMantine(
      <RefundSection event={event} userRegistered onRefundSuccess={onRefundSuccess} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Get Refund/i }));

    await waitFor(() =>
      expect(paymentServiceMock.requestRefund).toHaveBeenCalledWith(event, user, undefined, user.$id),
    );
    await waitFor(() => expect(onRefundSuccess).toHaveBeenCalled());
  });

  it('requests reason when automatic refund not available', async () => {
    const user = { $id: 'user_1' };
    useAppMock.mockReturnValue({ user });
    const start = formatLocalDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
    const event = buildEvent({
      $id: 'event_1',
      hostId: 'host_2',
      price: 20,
      cancellationRefundHours: 0,
      start,
    });

    paymentServiceMock.requestRefund.mockResolvedValue({ success: true });
    const onRefundSuccess = jest.fn();

    renderWithMantine(
      <RefundSection event={event} userRegistered onRefundSuccess={onRefundSuccess} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Withdraw and Request Refund/i }));

    const reasonInput = await screen.findByLabelText(/Reason for refund/i);
    fireEvent.change(reasonInput, { target: { value: 'Can no longer attend' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Request/i }));

    await waitFor(() =>
      expect(paymentServiceMock.requestRefund).toHaveBeenCalledWith(
        event,
        user,
        'Can no longer attend',
        user.$id,
      ),
    );
    await waitFor(() => expect(onRefundSuccess).toHaveBeenCalled());
  });

  it('allows refund requests once the event has started for paid events', async () => {
    const user = { $id: 'user_1' };
    useAppMock.mockReturnValue({ user });
    const start = formatLocalDateTime(new Date(Date.now() - 60 * 60 * 1000));
    const event = buildEvent({
      $id: 'event_started',
      hostId: 'host_2',
      price: 20,
      cancellationRefundHours: 24,
      start,
    });

    paymentServiceMock.requestRefund.mockResolvedValue({ success: true });
    const onRefundSuccess = jest.fn();

    renderWithMantine(
      <RefundSection event={event} userRegistered onRefundSuccess={onRefundSuccess} />,
    );

    expect(screen.getByText(/You can still request a refund from the host/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Withdraw and Request Refund/i }));

    const reasonInput = await screen.findByLabelText(/Reason for refund/i);
    fireEvent.change(reasonInput, { target: { value: 'Needs late refund' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Request/i }));

    await waitFor(() =>
      expect(paymentServiceMock.requestRefund).toHaveBeenCalledWith(
        event,
        user,
        'Needs late refund',
        user.$id,
      ),
    );
    await waitFor(() => expect(onRefundSuccess).toHaveBeenCalled());
  });
});
