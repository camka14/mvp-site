import type { ComponentProps } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { Checkbox, NumberInput, Stack } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';

import type { Event } from '@/types';
import { parseLocalDateTime } from '@/lib/dateUtils';

import type { EventFormValues } from '../formTypes';
import { AnimatedSection } from '../components/AnimatedSection';

type EventDetailsTimingControlsProps = {
    control: Control<EventFormValues>;
    eventType: Event['eventType'];
    startValue?: string;
    noFixedEndDateTime: boolean;
    supportsNoFixedEndDateTime: boolean;
    automaticRefundsAvailable: boolean;
    manualPaymentsEnabled: boolean;
    todaysDate: Date;
    maxStandardNumber: number;
    dateTimePickerStyles?: ComponentProps<typeof DateTimePicker>['styles'];
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    popoverProps?: ComponentProps<typeof DateTimePicker>['popoverProps'];
    isImmutableField: (key: keyof Event) => boolean;
    onStartChange: (value: Date) => void;
    onEndChange: (value: Date) => void;
    onNoFixedEndDateTimeChange: (checked: boolean) => void;
    onManualPaymentsChange: (checked: boolean) => void;
};

export const EventDetailsTimingControls = ({
    control,
    eventType,
    startValue,
    noFixedEndDateTime,
    supportsNoFixedEndDateTime,
    automaticRefundsAvailable,
    manualPaymentsEnabled,
    todaysDate,
    maxStandardNumber,
    dateTimePickerStyles,
    numberInputStyles,
    popoverProps,
    isImmutableField,
    onStartChange,
    onEndChange,
    onNoFixedEndDateTimeChange,
    onManualPaymentsChange,
}: EventDetailsTimingControlsProps) => (
    <>
        <div className="md:col-span-2">
            <Controller
                name="start"
                control={control}
                render={({ field }) => (
                    <DateTimePicker
                        label="Start Date & Time"
                        valueFormat="MM/DD/YYYY hh:mm A"
                        value={parseLocalDateTime(field.value)}
                        styles={dateTimePickerStyles}
                        disabled={isImmutableField('start')}
                        onChange={(val) => {
                            if (isImmutableField('start')) return;
                            const parsed = parseLocalDateTime(val as Date | string | null);
                            if (!parsed) return;
                            onStartChange(parsed);
                        }}
                        minDate={todaysDate}
                        timePickerProps={{
                            withDropdown: true,
                            format: '12h',
                        }}
                        popoverProps={popoverProps}
                        style={{ width: '100%' }}
                    />
                )}
            />
        </div>
        <AnimatedSection
            in={eventType === 'EVENT' || supportsNoFixedEndDateTime}
            collapseClassName="md:col-span-2"
        >
            <Controller
                name="end"
                control={control}
                render={({ field, fieldState }) => (
                    <div className="space-y-2">
                        <DateTimePicker
                            label="End Date & Time"
                            valueFormat="MM/DD/YYYY hh:mm A"
                            value={parseLocalDateTime(field.value)}
                            styles={dateTimePickerStyles}
                            disabled={
                                isImmutableField('end')
                                || (supportsNoFixedEndDateTime && noFixedEndDateTime)
                            }
                            onChange={(val) => {
                                if (isImmutableField('end')) return;
                                const parsed = parseLocalDateTime(val as Date | string | null);
                                if (!parsed) return;
                                onEndChange(parsed);
                            }}
                            minDate={parseLocalDateTime(startValue) ?? todaysDate}
                            timePickerProps={{
                                withDropdown: true,
                                format: '12h',
                            }}
                            popoverProps={popoverProps}
                            style={{ width: '100%' }}
                            error={fieldState.error?.message as string | undefined}
                        />
                        {supportsNoFixedEndDateTime ? (
                            <div className="space-y-1">
                                <Checkbox
                                    size="xs"
                                    label="No fixed end datetime scheduling"
                                    checked={noFixedEndDateTime}
                                    disabled={isImmutableField('noFixedEndDateTime')}
                                    onChange={(event) => {
                                        if (isImmutableField('noFixedEndDateTime')) return;
                                        onNoFixedEndDateTimeChange(event.currentTarget.checked);
                                    }}
                                />
                            </div>
                        ) : null}
                    </div>
                )}
            />
        </AnimatedSection>
        <div className="md:col-span-2">
            <Controller
                name="registrationCutoffHours"
                control={control}
                render={({ field, fieldState }) => (
                    <NumberInput
                        label="Registration Cutoff (Hours)"
                        min={0}
                        max={maxStandardNumber}
                        value={typeof field.value === 'number' && field.value > 0 ? field.value : ''}
                        w="100%"
                        styles={numberInputStyles}
                        clampBehavior="strict"
                        disabled={isImmutableField('registrationCutoffHours')}
                        onChange={(val) => {
                            if (isImmutableField('registrationCutoffHours')) return;
                            const numeric = typeof val === 'number' && Number.isFinite(val)
                                ? val
                                : Number(val);
                            field.onChange(Number.isFinite(numeric)
                                ? Math.max(0, Math.trunc(numeric))
                                : 0);
                        }}
                        error={fieldState.error?.message as string | undefined}
                    />
                )}
            />
        </div>
        <div className="md:col-span-2">
            <Controller
                name="cancellationRefundHours"
                control={control}
                render={({ field, fieldState }) => {
                    const automaticRefundsChecked = field.value != null;
                    const automaticRefundsImmutable = isImmutableField('cancellationRefundHours');
                    const automaticRefundsInputDisabled = automaticRefundsImmutable
                        || manualPaymentsEnabled
                        || !automaticRefundsAvailable
                        || !automaticRefundsChecked;
                    const automaticRefundsToggleDisabled = automaticRefundsImmutable
                        || manualPaymentsEnabled
                        || !automaticRefundsAvailable;

                    return (
                        <Stack gap={6}>
                            <NumberInput
                                label="Refund Cutoff (Hours)"
                                min={0}
                                max={maxStandardNumber}
                                value={
                                    automaticRefundsChecked
                                    && typeof field.value === 'number'
                                    && field.value > 0
                                        ? field.value
                                        : ''
                                }
                                w="100%"
                                styles={numberInputStyles}
                                clampBehavior="strict"
                                disabled={automaticRefundsInputDisabled}
                                onChange={(val) => {
                                    if (automaticRefundsInputDisabled) return;
                                    const numeric = typeof val === 'number' && Number.isFinite(val)
                                        ? val
                                        : Number(val);
                                    field.onChange(Number.isFinite(numeric)
                                        ? Math.max(0, Math.trunc(numeric))
                                        : 0);
                                }}
                                error={fieldState.error?.message as string | undefined}
                            />
                            <Checkbox
                                size="xs"
                                label="Automatic Refunds"
                                checked={automaticRefundsChecked}
                                disabled={automaticRefundsToggleDisabled}
                                onChange={(event) => {
                                    if (automaticRefundsToggleDisabled) return;
                                    field.onChange(event.currentTarget.checked ? field.value ?? 0 : null);
                                }}
                            />
                        </Stack>
                    );
                }}
            />
        </div>
        <div className="md:col-span-1">
            <Controller
                name="registrationPaymentMode"
                control={control}
                render={({ field }) => (
                    <div className="flex h-full items-end pb-1">
                        <Checkbox
                            size="xs"
                            label="Self manage payments"
                            checked={(field.value ?? 'ONLINE') === 'MANUAL'}
                            disabled={isImmutableField('registrationPaymentMode')}
                            onChange={(event) => {
                                if (isImmutableField('registrationPaymentMode')) return;
                                onManualPaymentsChange(event.currentTarget.checked);
                            }}
                        />
                    </div>
                )}
            />
        </div>
    </>
);
