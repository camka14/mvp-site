'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@mantine/core';

import { calculateIncludedFeesFromTotalPrice } from '@/lib/billingFees';
import { normalizePriceCents } from '@/lib/priceUtils';
import { formatBillAmount } from '@/types';

type PriceWithFeesPreviewProps = {
  amountCents?: number | null;
  baseLabel?: string;
  className?: string;
  eventType?: unknown;
  helperText?: string | null;
  taxable?: boolean;
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
  taxable = false,
  totalLabel = 'Online price:',
}: PriceWithFeesPreviewProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const normalizedAmountCents = normalizePriceCents(amountCents);
  const feeBreakdown = useMemo(
    () => {
      const breakdown = calculateIncludedFeesFromTotalPrice({
        totalPriceCents: normalizedAmountCents,
        eventType,
      });

      return {
        mvpFeeCents: breakdown.platformFeeCents,
        mvpFeePercentage: breakdown.platformFeePercentage,
        hostReceivesCents: breakdown.hostReceivesCents,
        processingFeeCents: breakdown.processingFeeCents,
        totalPriceCents: breakdown.totalPriceCents,
      };
    },
    [eventType, normalizedAmountCents],
  );
  const totalDisplayValue = normalizedAmountCents > 0
    ? `${formatBillAmount(feeBreakdown.totalPriceCents)}${taxable ? ' + Tax' : ''}`
    : formatBillAmount(feeBreakdown.totalPriceCents);

  return (
    <div className={className}>
      <p className="mt-2 text-sm text-gray-600">
        {totalLabel}{' '}
        <span className="font-semibold text-gray-900">
          {totalDisplayValue}
        </span>
      </p>
      {helperText ? (
        <p className="text-xs text-gray-500">{helperText}</p>
      ) : null}
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-900"
        onClick={() => setIsBreakdownOpen(true)}
      >
        Show fee breakdown
      </button>
      <Modal
        opened={isBreakdownOpen}
        onClose={() => setIsBreakdownOpen(false)}
        title="Fee breakdown"
        centered
        size="sm"
      >
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex items-center justify-between gap-4">
            <span>{baseLabel}</span>
            <span className="font-medium text-slate-900">
              {formatBillAmount(normalizedAmountCents)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Host take-home</span>
            <span className="font-medium text-slate-900">
              {formatBillAmount(feeBreakdown.hostReceivesCents)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Processing fee</span>
            <span className="font-medium text-slate-900">
              {formatBillAmount(feeBreakdown.processingFeeCents)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>{`BracketIQ fee (${formatPercentage(feeBreakdown.mvpFeePercentage)})`}</span>
            <span className="font-medium text-slate-900">
              {formatBillAmount(feeBreakdown.mvpFeeCents)}
            </span>
          </div>
          {taxable ? (
            <div className="flex items-center justify-between gap-4">
              <span>Tax</span>
              <span className="font-medium text-slate-900">Calculated at checkout</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <span>Total charged</span>
            <span>{totalDisplayValue}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
