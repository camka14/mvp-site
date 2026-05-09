type RefundPolicyEvent = {
  start?: Date | string | null;
  cancellationRefundHours?: number | null;
};

export type RefundPolicy = {
  eventHasStarted: boolean;
  refundDeadline: Date | null;
  canAutoRefund: boolean;
};

const toValidDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getRefundPolicy = (
  event: RefundPolicyEvent,
  now: Date = new Date(),
): RefundPolicy => {
  const eventStart = toValidDate(event.start);
  const parsedRefundHours = Number(event.cancellationRefundHours);
  const refundBufferHours = event.cancellationRefundHours == null || !Number.isFinite(parsedRefundHours)
    ? null
    : Math.max(0, Math.trunc(parsedRefundHours));

  if (!eventStart) {
    return {
      eventHasStarted: false,
      refundDeadline: null,
      canAutoRefund: false,
    };
  }

  const eventHasStarted = now >= eventStart;
  const refundDeadline = refundBufferHours == null
    ? null
    : refundBufferHours === 0
      ? eventStart
      : new Date(eventStart.getTime() - (refundBufferHours * 60 * 60 * 1000));
  const canAutoRefund = Boolean(
    refundBufferHours != null
    && refundDeadline
    && !eventHasStarted
    && now < refundDeadline,
  );

  return {
    eventHasStarted,
    refundDeadline,
    canAutoRefund,
  };
};
