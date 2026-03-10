"use client";

import { TextInput, type TextInputProps } from "@mantine/core";

import {
  formatPriceInputValue,
  parsePriceInputToCents,
} from "@/lib/priceUtils";

type CentsInputProps = Omit<
  TextInputProps,
  "defaultValue" | "onChange" | "type" | "value"
> & {
  blankWhenZero?: boolean;
  maxCents?: number;
  onChange?: (value: number) => void;
  value?: number | null;
};

export default function CentsInput({
  blankWhenZero = true,
  inputMode = "numeric",
  leftSection = "$",
  maxCents,
  onChange,
  placeholder = "0.00",
  value,
  ...props
}: CentsInputProps) {
  return (
    <TextInput
      {...props}
      autoComplete="off"
      inputMode={inputMode}
      leftSection={leftSection}
      onChange={(event) => {
        onChange?.(
          parsePriceInputToCents(event.currentTarget.value, { maxCents }),
        );
      }}
      placeholder={placeholder}
      type="text"
      value={formatPriceInputValue(value, { blankWhenZero, maxCents })}
    />
  );
}
