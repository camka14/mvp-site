import { getRefundPolicy } from '@/lib/refundPolicy';

describe('getRefundPolicy', () => {
  it('treats null refund hours as disabled', () => {
    const policy = getRefundPolicy(
      {
        start: '2026-07-01T12:00:00.000Z',
        cancellationRefundHours: null,
      },
      new Date('2026-07-01T10:00:00.000Z'),
    );

    expect(policy.canAutoRefund).toBe(false);
    expect(policy.refundDeadline).toBeNull();
  });

  it('treats zero refund hours as refundable until event start', () => {
    const policy = getRefundPolicy(
      {
        start: '2026-07-01T12:00:00.000Z',
        cancellationRefundHours: 0,
      },
      new Date('2026-07-01T11:59:00.000Z'),
    );

    expect(policy.canAutoRefund).toBe(true);
    expect(policy.refundDeadline?.toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });
});
