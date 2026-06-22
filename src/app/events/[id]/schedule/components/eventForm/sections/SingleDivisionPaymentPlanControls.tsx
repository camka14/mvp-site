import { ActionIcon, Button, Group, NumberInput, Stack, Switch, Text, Title } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { motion } from 'motion/react';

import CentsInput from '@/components/ui/CentsInput';
import PriceWithFeesPreview from '@/components/ui/PriceWithFeesPreview';
import type { Event } from '@/types';
import { formatBillAmount } from '@/types';
import { parseLocalDateTime } from '@/lib/dateUtils';

import { AnimatedSection } from '../components/AnimatedSection';
import { DIVISION_LAYOUT_TRANSITION } from '../constants';

type SingleDivisionPaymentPlanControlsProps = {
    allowPaymentPlans: boolean;
    installmentCount: number;
    installmentAmounts: number[];
    installmentDueDates: string[];
    installmentDueRelativeDays: number[];
    teamSignup: boolean;
    allowTeamSplitDefault: boolean;
    eventType: Event['eventType'];
    parentEvent?: string | null;
    eventStart?: string;
    taxable: boolean;
    hasStripeAccount: boolean;
    maxStandardNumber: number;
    maxPriceCents: number;
    onAllowPaymentPlansChange: (checked: boolean) => void;
    onInstallmentCountChange: (count: number) => void;
    onTeamSplitDefaultChange: (checked: boolean) => void;
    onInstallmentDueRelativeDayChange: (index: number, value: number) => void;
    onInstallmentDueDateChange: (index: number, value: Date | string | null) => void;
    onInstallmentAmountChange: (index: number, value: number) => void;
    onRemoveInstallment: (index: number) => void;
    onAddInstallment: () => void;
};

const sumInstallments = (amounts: number[]): number => (
    amounts.reduce((sum, amount) => sum + (Number(amount) || 0), 0)
);

export const SingleDivisionPaymentPlanControls = ({
    allowPaymentPlans,
    installmentCount,
    installmentAmounts,
    installmentDueDates,
    installmentDueRelativeDays,
    teamSignup,
    allowTeamSplitDefault,
    eventType,
    parentEvent,
    eventStart,
    taxable,
    hasStripeAccount,
    maxStandardNumber,
    maxPriceCents,
    onAllowPaymentPlansChange,
    onInstallmentCountChange,
    onTeamSplitDefaultChange,
    onInstallmentDueRelativeDayChange,
    onInstallmentDueDateChange,
    onInstallmentAmountChange,
    onRemoveInstallment,
    onAddInstallment,
}: SingleDivisionPaymentPlanControlsProps) => (
    <motion.div
        layout
        className={allowPaymentPlans ? 'md:col-span-12 md:col-start-1' : 'md:col-span-9'}
        transition={DIVISION_LAYOUT_TRANSITION}
    >
        <div className="rounded-lg border border-gray-200 bg-white p-4">
            <Group justify="space-between" align="center" wrap="nowrap" gap="lg">
                <div>
                    <Title order={6}>Payment Plans</Title>
                    <Text size="sm" c="dimmed">
                        Offer installments.
                    </Text>
                </div>
                <Switch
                    checked={allowPaymentPlans}
                    onChange={(event) => onAllowPaymentPlansChange(event.currentTarget.checked)}
                    disabled={!hasStripeAccount}
                />
            </Group>

            <AnimatedSection in={allowPaymentPlans}>
                <div className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
                    <Group align="flex-start" gap="md">
                        <NumberInput
                            label="Installments"
                            min={1}
                            max={maxStandardNumber}
                            value={installmentCount || installmentAmounts.length || 1}
                            onChange={(value) => onInstallmentCountChange(Number(value) || 1)}
                            clampBehavior="strict"
                            maw={180}
                        />
                        {teamSignup ? (
                            <Switch
                                checked={allowTeamSplitDefault}
                                onChange={(event) => onTeamSplitDefaultChange(event.currentTarget.checked)}
                                label="Allow team bill splitting by default"
                            />
                        ) : null}
                    </Group>

                    <Stack gap="sm">
                        {installmentAmounts.map((amount, index) => {
                            const useRelativeDueDates = eventType === 'WEEKLY_EVENT' && !parentEvent;
                            const dueDateValue = parseLocalDateTime(
                                installmentDueDates[index] || eventStart,
                            );

                            return (
                                <Group key={index} align="flex-end" gap="sm" wrap="wrap">
                                    {useRelativeDueDates ? (
                                        <NumberInput
                                            label={`Installment ${index + 1} due date offset`}
                                            description="0 = session day; negative = days before session; positive = days after session"
                                            value={installmentDueRelativeDays[index] ?? 0}
                                            onChange={(value) => onInstallmentDueRelativeDayChange(index, Number(value) || 0)}
                                            min={-maxStandardNumber}
                                            max={maxStandardNumber}
                                            clampBehavior="strict"
                                            style={{ flex: '1 1 300px', maxWidth: 360 }}
                                        />
                                    ) : (
                                        <DateTimePicker
                                            label={`Installment ${index + 1} due`}
                                            value={dueDateValue}
                                            onChange={(value) => onInstallmentDueDateChange(index, value)}
                                            valueFormat="MM/DD/YYYY hh:mm A"
                                            timePickerProps={{
                                                withDropdown: true,
                                                format: '12h',
                                            }}
                                            style={{ flex: '1 1 260px', maxWidth: 280 }}
                                        />
                                    )}
                                    <CentsInput
                                        label="Amount"
                                        maxCents={maxPriceCents}
                                        value={amount}
                                        onChange={(nextValue) => onInstallmentAmountChange(index, nextValue)}
                                        maw={180}
                                    />
                                    <PriceWithFeesPreview
                                        amountCents={amount}
                                        baseLabel={`Installment ${index + 1} amount`}
                                        eventType={eventType}
                                        taxable={taxable}
                                        className="min-w-[220px] flex-[1_1_220px]"
                                    />
                                    {installmentAmounts.length > 1 ? (
                                        <ActionIcon
                                            variant="light"
                                            color="red"
                                            aria-label="Remove installment"
                                            onClick={() => onRemoveInstallment(index)}
                                        >
                                            x
                                        </ActionIcon>
                                    ) : null}
                                </Group>
                            );
                        })}
                        <Group justify="space-between" align="center">
                            <Button variant="light" onClick={onAddInstallment}>
                                Add installment
                            </Button>
                            <Text size="sm" c="dimmed">
                                Installment total: {formatBillAmount(sumInstallments(installmentAmounts))}
                            </Text>
                        </Group>
                    </Stack>
                </div>
            </AnimatedSection>
        </div>
    </motion.div>
);
