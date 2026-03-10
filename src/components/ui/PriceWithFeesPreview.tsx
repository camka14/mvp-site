'use client';

import { useMemo, useState } from 'react';

import {
  calculateMvpAndStripeFees,
  STRIPE_FIXED_FEE_CENTS,
  STRIPE_PERCENT_FEE,
} from '@/lib/billingFees';
import { normalizePriceCents } from '@/lib/priceUtils';
import { formatBillAmount } from '@/types';

type PriceWithFeesPreviewProps = {
  amountCents?: number | null;
  baseLabel?: string;
  className?: string;
  eventType?: unknown;
  helperText?: string | null;
  totalLabel?: string;
};

const formatPercentage = (decimalValue: number): string => {
  const percentageValue = decimalValue * 100;
  return Number.isInteger(percentageValue)
    ? `${percentageValue}%`
    : `${percentageValue.toFixed(1)}%`;
};

export default function PriceWithFeesPreview({
  amountCents,
  baseLabel = 'Base price',
  className,
  eventType,
  helperText = null,
  totalLabel = 'Total charged with fees:',
}: PriceWithFeesPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const normalizedAmountCents = normalizePriceCents(amountCents);
  const feeBreakdown = useMemo(
    () => calculateMvpAndStripeFees({
      eventAmountCents: normalizedAmountCents,
      eventType,
    }),
    [eventType, normalizedAmountCents],
  );

  return (
    <div className={className}>
      <p className="mt-2 text-sm text-gray-600">
        {totalLabel}{' '}
        <span className="font-semibold text-gray-900">
          {formatBillAmount(feeBreakdown.totalChargeCents)}
        </span>
      </p>
      {helperText ? (
        <p className="text-xs text-gray-500">{helperText}</p>
      ) : null}
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-900"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((currentValue) => !currentValue)}
      >
        {isExpanded ? 'Hide fee breakdown' : 'Show fee breakdown'}
        <span aria-hidden="true">{isExpanded ? '▴' : '▾'}</span>
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex items-center justify-between gap-4">
            <span>{baseLabel}</span>
            <span className="font-medium text-slate-900">
              {formatBillAmount(normalizedAmountCents)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>{`BracketIQ fee (${formatPercentage(feeBreakdown.mvpFeePercentage)})`}</span>
            <span className="font-medium text-slate-900">
              {formatBillAmount(feeBreakdown.mvpFeeCents)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>{`Stripe fee (${formatPercentage(STRIPE_PERCENT_FEE)} + ${formatBillAmount(STRIPE_FIXED_FEE_CENTS)})`}</span>
            <span className="font-medium text-slate-900">
              {formatBillAmount(feeBreakdown.stripeFeeCents)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <span>Total charged</span>
            <span>{formatBillAmount(feeBreakdown.totalChargeCents)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
