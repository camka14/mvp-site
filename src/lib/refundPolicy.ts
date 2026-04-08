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
  const refundBufferHours = Number(event.cancellationRefundHours ?? 0);

  if (!eventStart) {
    return {
      eventHasStarted: false,
      refundDeadline: null,
      canAutoRefund: false,
    };
  }

  const eventHasStarted = now >= eventStart;
  const refundDeadline = refundBufferHours > 0
    ? new Date(eventStart.getTime() - (refundBufferHours * 60 * 60 * 1000))
    : null;
  const canAutoRefund = Boolean(
    refundDeadline
    && !eventHasStarted
    && now < refundDeadline,
  );

  return {
    eventHasStarted,
    refundDeadline,
    canAutoRefund,
  };
};
