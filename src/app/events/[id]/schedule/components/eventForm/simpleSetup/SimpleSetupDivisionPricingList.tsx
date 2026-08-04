import {
    Alert,
    Button,
    Group,
    NumberInput,
    Paper,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';

import CentsInput from '@/components/ui/CentsInput';
import HostPriceInput from '@/components/ui/HostPriceInput';
import PriceWithFeesPreview from '@/components/ui/PriceWithFeesPreview';
import { parseLocalDateTime } from '@/lib/dateUtils';
import { normalizePriceCents } from '@/lib/priceUtils';
import { formatBillAmount } from '@/types';

import type { DivisionDetailForm } from '../divisionForm';
import type { EventFormValues } from '../formTypes';
import { sumInstallmentAmounts } from '../paymentPlanHelpers';

type EventFormSetValue = (
    name: string,
    value: unknown,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type SimpleSetupDivisionPricingListProps = {
    eventData: EventFormValues;
    hasStripeAccount: boolean;
    manualPaymentsEnabled: boolean;
    eventTaxableForPreview: boolean;
    connectingStripe: boolean;
    disabled: boolean;
    maxPriceCents: number;
    maxStandardNumber: number;
    onConnectStripe: () => void;
    setValue: EventFormSetValue;
};

const FIELD_OPTIONS = { shouldDirty: true, shouldValidate: true } as const;

export const SimpleSetupDivisionPricingList = ({
    eventData,
    hasStripeAccount,
    manualPaymentsEnabled,
    eventTaxableForPreview,
    connectingStripe,
    disabled,
    maxPriceCents,
    maxStandardNumber,
    onConnectStripe,
    setValue,
}: SimpleSetupDivisionPricingListProps) => {
    const divisionDetails = eventData.divisionDetails ?? [];
    const onlinePricingDisabled = !hasStripeAccount || disabled;
    const useRelativeDueDates = eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent;

    const updateDivision = (index: number, updates: Partial<DivisionDetailForm>) => {
        setValue('divisionDetails', divisionDetails.map((detail, detailIndex) => (
            detailIndex === index ? { ...detail, ...updates } : detail
        )), FIELD_OPTIONS);
    };

    const syncInstallments = (index: number, count: number) => {
        const detail = divisionDetails[index];
        if (!detail) return;
        const safeCount = Math.max(1, Math.min(maxStandardNumber, Math.trunc(count || 1)));
        const amounts = [...(detail.installmentAmounts ?? [])];
        const dueDates = [...(detail.installmentDueDates ?? [])];
        const relativeDueDays = [...(detail.installmentDueRelativeDays ?? [])];
        while (amounts.length < safeCount) {
            amounts.push(amounts.length === 0 ? normalizePriceCents(detail.price) : 0);
            dueDates.push(eventData.start);
            relativeDueDays.push(0);
        }
        amounts.splice(safeCount);
        dueDates.splice(safeCount);
        relativeDueDays.splice(safeCount);
        updateDivision(index, {
            allowPaymentPlans: true,
            installmentCount: safeCount,
            installmentAmounts: amounts,
            installmentDueDates: useRelativeDueDates ? [] : dueDates,
            installmentDueRelativeDays: useRelativeDueDates ? relativeDueDays : [],
            price: sumInstallmentAmounts(amounts),
        });
    };

    if (divisionDetails.length === 0) {
        return (
            <Alert color="orange" variant="light">
                Add at least one division before setting division prices.
            </Alert>
        );
    }

    return (
        <Stack gap="md">
            <div>
                <Text fw={600}>Division pricing</Text>
                <Text size="sm" c="dimmed">
                    Set the registration price for each division. Pricing stays on this page in Simple Setup.
                </Text>
            </div>

            {!manualPaymentsEnabled && !hasStripeAccount ? (
                <Alert color="orange" variant="light">
                    <Group justify="space-between" align="center" wrap="wrap">
                        <Text size="sm">
                            Connect Stripe before you configure BracketIQ online prices.
                        </Text>
                        <Button
                            type="button"
                            size="xs"
                            loading={connectingStripe}
                            onClick={onConnectStripe}
                        >
                            Connect Stripe
                        </Button>
                    </Group>
                </Alert>
            ) : null}

            {eventData.teamSignup && !manualPaymentsEnabled ? (
                <Switch
                    label="Allow team bill splitting by default"
                    checked={Boolean(eventData.allowTeamSplitDefault)}
                    disabled={onlinePricingDisabled}
                    onChange={(event) => setValue(
                        'allowTeamSplitDefault',
                        event.currentTarget.checked,
                        FIELD_OPTIONS,
                    )}
                />
            ) : null}

            {divisionDetails.map((detail, index) => {
                const installmentAmounts = detail.installmentAmounts ?? [];
                const installmentDueDates = detail.installmentDueDates ?? [];
                const installmentDueRelativeDays = detail.installmentDueRelativeDays ?? [];
                const allowPaymentPlans = !manualPaymentsEnabled && Boolean(detail.allowPaymentPlans);
                return (
                    <Paper key={detail.id} withBorder radius="md" p="md">
                        <Stack gap="md">
                            <div>
                                <Text fw={700}>{detail.name}</Text>
                                <Text size="xs" c="dimmed">
                                    {[detail.skillDivisionTypeName, detail.ageDivisionTypeName]
                                        .filter(Boolean)
                                        .join(' ') || detail.divisionTypeName || 'Open division'}
                                </Text>
                            </div>

                            <div className="flex flex-wrap items-start gap-4">
                                {!allowPaymentPlans ? (
                                    manualPaymentsEnabled ? (
                                        <CentsInput
                                            label="Registration price"
                                            maxCents={maxPriceCents}
                                            value={detail.price}
                                            disabled={disabled}
                                            maw={220}
                                            onChange={(price) => updateDivision(index, {
                                                price: normalizePriceCents(price),
                                            })}
                                        />
                                    ) : (
                                        <div className="w-full max-w-md">
                                            <HostPriceInput
                                                hostLabel="Host take-home"
                                                totalLabel="Online price"
                                                eventType={eventData.eventType}
                                                maxCents={maxPriceCents}
                                                value={detail.price}
                                                disabled={onlinePricingDisabled}
                                                onChange={(price) => updateDivision(index, {
                                                    price: normalizePriceCents(price),
                                                })}
                                            />
                                        </div>
                                    )
                                ) : (
                                    <div className="min-w-48 rounded-md bg-gray-50 px-3 py-2">
                                        <Text size="xs" c="dimmed">Registration price</Text>
                                        <Text fw={600}>{formatBillAmount(detail.price)}</Text>
                                        <Text size="xs" c="dimmed">Calculated from installments</Text>
                                    </div>
                                )}

                                {!manualPaymentsEnabled ? (
                                    <Switch
                                        label="Payment plan"
                                        description="Offer installments for this division."
                                        checked={allowPaymentPlans}
                                        disabled={onlinePricingDisabled}
                                        onChange={(event) => {
                                            if (!event.currentTarget.checked) {
                                                updateDivision(index, {
                                                    allowPaymentPlans: false,
                                                    installmentCount: 0,
                                                    installmentAmounts: [],
                                                    installmentDueDates: [],
                                                    installmentDueRelativeDays: [],
                                                });
                                                return;
                                            }
                                            syncInstallments(index, detail.installmentCount || 1);
                                        }}
                                    />
                                ) : null}
                            </div>

                            {allowPaymentPlans ? (
                                <Stack gap="sm" className="border-l-2 border-slate-200 pl-4">
                                    <NumberInput
                                        label="Installments"
                                        min={1}
                                        max={maxStandardNumber}
                                        value={detail.installmentCount || installmentAmounts.length || 1}
                                        disabled={onlinePricingDisabled}
                                        maw={180}
                                        onChange={(value) => syncInstallments(index, Number(value) || 1)}
                                    />
                                    {installmentAmounts.map((amount, installmentIndex) => (
                                        <Group key={installmentIndex} align="flex-end" wrap="wrap">
                                            {useRelativeDueDates ? (
                                                <NumberInput
                                                    label={`Installment ${installmentIndex + 1} due date offset`}
                                                    description="0 = session day; negative = before; positive = after"
                                                    value={installmentDueRelativeDays[installmentIndex] ?? 0}
                                                    min={-maxStandardNumber}
                                                    max={maxStandardNumber}
                                                    disabled={onlinePricingDisabled}
                                                    className="w-full sm:w-80 sm:flex-none"
                                                    onChange={(value) => {
                                                        const nextValues = [...installmentDueRelativeDays];
                                                        nextValues[installmentIndex] = Number(value) || 0;
                                                        updateDivision(index, {
                                                            installmentDueRelativeDays: nextValues,
                                                            installmentDueDates: [],
                                                        });
                                                    }}
                                                />
                                            ) : (
                                                <DateTimePicker
                                                    label={`Installment ${installmentIndex + 1} due`}
                                                    value={parseLocalDateTime(
                                                        installmentDueDates[installmentIndex] || eventData.start,
                                                    )}
                                                    valueFormat="MM/DD/YYYY hh:mm A"
                                                    timePickerProps={{ withDropdown: true, format: '12h' }}
                                                    disabled={onlinePricingDisabled}
                                                    className="w-full sm:w-72 sm:flex-none"
                                                    onChange={(value) => {
                                                        const nextValues = [...installmentDueDates];
                                                        const normalizedValue = String(value ?? '');
                                                        nextValues[installmentIndex] = parseLocalDateTime(normalizedValue)
                                                            ?.toISOString() ?? normalizedValue;
                                                        updateDivision(index, { installmentDueDates: nextValues });
                                                    }}
                                                />
                                            )}
                                            <CentsInput
                                                label="Amount"
                                                value={amount}
                                                maxCents={maxPriceCents}
                                                disabled={onlinePricingDisabled}
                                                maw={180}
                                                onChange={(nextAmount) => {
                                                    const nextAmounts = [...installmentAmounts];
                                                    nextAmounts[installmentIndex] = normalizePriceCents(nextAmount);
                                                    updateDivision(index, {
                                                        installmentAmounts: nextAmounts,
                                                        price: sumInstallmentAmounts(nextAmounts),
                                                    });
                                                }}
                                            />
                                            <PriceWithFeesPreview
                                                amountCents={amount}
                                                baseLabel={`Installment ${installmentIndex + 1} amount`}
                                                eventType={eventData.eventType}
                                                taxable={eventTaxableForPreview}
                                                className="min-w-56"
                                            />
                                        </Group>
                                    ))}
                                </Stack>
                            ) : null}
                        </Stack>
                    </Paper>
                );
            })}
        </Stack>
    );
};
