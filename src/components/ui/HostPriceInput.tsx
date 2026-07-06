"use client";

import { SimpleGrid, Stack, Text } from "@mantine/core";

import {
  calculateIncludedFeesFromTotalPrice,
  calculateInclusivePriceFromHostAmount,
} from "@/lib/billingFees";
import { normalizePriceCents } from "@/lib/priceUtils";
import { formatBillAmount } from "@/types";

import CentsInput from "./CentsInput";

type HostPriceInputProps = {
  disabled?: boolean;
  eventType?: unknown;
  hostLabel?: string;
  maxCents?: number;
  onChange: (value: number) => void;
  required?: boolean;
  totalLabel?: string;
  value: number | null | undefined;
};

const clampToMax = (value: number, maxCents?: number): number => (
  typeof maxCents === "number" && Number.isFinite(maxCents)
    ? Math.min(value, Math.max(0, Math.round(maxCents)))
    : value
);

export default function HostPriceInput({
  disabled = false,
  eventType,
  hostLabel = "Host take-home",
  maxCents,
  onChange,
  required = false,
  totalLabel = "Online price",
  value,
}: HostPriceInputProps) {
  const totalPriceCents = normalizePriceCents(value, { maxCents });
  const breakdown = calculateIncludedFeesFromTotalPrice({
    totalPriceCents,
    eventType,
  });
  const feeFormula = `${formatBillAmount(breakdown.hostReceivesCents)} + ${formatBillAmount(breakdown.processingFeeCents)} processing + ${formatBillAmount(breakdown.platformFeeCents)} platform = ${formatBillAmount(breakdown.totalPriceCents)}`;

  return (
    <Stack gap={4}>
      <SimpleGrid cols={2} spacing="sm">
        <CentsInput
          label={hostLabel}
          maxCents={maxCents}
          value={breakdown.hostReceivesCents}
          onChange={(nextHostAmount) => {
            const nextTotal = calculateInclusivePriceFromHostAmount({
              hostAmountCents: nextHostAmount,
              eventType,
            }).totalPriceCents;
            onChange(clampToMax(nextTotal, maxCents));
          }}
          disabled={disabled}
          required={required}
        />
        <CentsInput
          label={totalLabel}
          maxCents={maxCents}
          value={totalPriceCents}
          onChange={(nextTotal) => onChange(clampToMax(nextTotal, maxCents))}
          disabled={disabled}
          required={required}
        />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {feeFormula}
      </Text>
    </Stack>
  );
}
