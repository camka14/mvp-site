import type { ComponentProps } from 'react';
import { Controller, type Control } from 'react-hook-form';
import {
    Alert,
    NumberInput,
    Select as MantineSelect,
} from '@mantine/core';

import CentsInput from '@/components/ui/CentsInput';
import PriceWithFeesPreview from '@/components/ui/PriceWithFeesPreview';
import type { Event } from '@/types';
import {
    normalizeEventTaxHandling,
    normalizeOrganizerManualTaxRateBps,
    type EventTaxHandling,
} from '@/lib/taxPolicy';

import type { EventFormValues } from '../formTypes';
import { AnimatedLayoutSection, AnimatedSection } from '../components/AnimatedSection';

type SingleDivisionPricingControlsProps = {
    visible: boolean;
    control: Control<EventFormValues>;
    priceCents: number;
    eventType: Event['eventType'];
    taxable: boolean;
    maxPriceCents: number;
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    hasStripeAccount: boolean;
    priceImmutable: boolean;
    organizerTaxCollectionAllowed: boolean;
    organizerResponsibilityMessage?: string | null;
    showTaxHandlingControls: boolean;
    organizerManualTaxSelected: boolean;
    organizationDefaultEventTaxHandling: EventTaxHandling;
    connectingStripe: boolean;
    onConnectStripe: () => void;
};

export const SingleDivisionPricingControls = ({
    visible,
    control,
    priceCents,
    eventType,
    taxable,
    maxPriceCents,
    numberInputStyles,
    hasStripeAccount,
    priceImmutable,
    organizerTaxCollectionAllowed,
    organizerResponsibilityMessage,
    showTaxHandlingControls,
    organizerManualTaxSelected,
    organizationDefaultEventTaxHandling,
    connectingStripe,
    onConnectStripe,
}: SingleDivisionPricingControlsProps) => (
    <AnimatedLayoutSection
        in={visible}
        className="md:col-span-3 md:col-start-1"
    >
        <Controller
            name="price"
            control={control}
            render={({ field }) => (
                <CentsInput
                    label="Price"
                    maxCents={maxPriceCents}
                    value={field.value}
                    w="100%"
                    onChange={(nextValue) => {
                        if (priceImmutable) return;
                        field.onChange(nextValue);
                    }}
                    disabled={!hasStripeAccount || priceImmutable}
                />
            )}
        />
        <PriceWithFeesPreview
            amountCents={priceCents}
            eventType={eventType}
            taxable={taxable}
            helperText={null}
        />
        <AnimatedSection in={organizerTaxCollectionAllowed}>
            <Alert color="yellow" variant="light" mt="sm">
                {organizerResponsibilityMessage}
            </Alert>
        </AnimatedSection>
        <AnimatedSection in={showTaxHandlingControls}>
            <div className="mt-3">
                <Controller
                    name="taxHandling"
                    control={control}
                    render={({ field }) => (
                        <MantineSelect
                            label="Tax handling"
                            value={field.value}
                            data={organizerTaxCollectionAllowed
                                ? [
                                    { value: 'INHERIT_ORG', label: 'Choose tax collection method' },
                                    { value: 'ORGANIZER_MANUAL_TAX', label: 'Enter a sales tax rate' },
                                    { value: 'ORGANIZER_STRIPE_TAX', label: 'Use Stripe Tax calculator' },
                                ]
                                : [
                                    { value: 'INHERIT_ORG', label: `Use organization default (${organizationDefaultEventTaxHandling === 'STRIPE_TAX' ? 'Stripe Tax' : 'sports registration exempt'})` },
                                    { value: 'STRIPE_TAX', label: 'Use Stripe Tax' },
                                    { value: 'EXEMPT_PARTICIPANT_SPORTS', label: 'Sports registration is exempt' },
                                ]}
                            onChange={(value) => {
                                field.onChange(normalizeEventTaxHandling(value));
                            }}
                            disabled={priceImmutable}
                        />
                    )}
                />
                <AnimatedSection in={organizerManualTaxSelected}>
                    <div className="mt-3">
                        <Controller
                            name="organizerManualTaxRateBps"
                            control={control}
                            render={({ field }) => (
                                <NumberInput
                                    label="Sales tax rate"
                                    min={0}
                                    max={25}
                                    suffix="%"
                                    decimalScale={3}
                                    value={(Number(field.value) || 0) / 100}
                                    w="100%"
                                    styles={numberInputStyles}
                                    clampBehavior="blur"
                                    disabled={priceImmutable}
                                    onChange={(value) => {
                                        const numeric = typeof value === 'number' && Number.isFinite(value)
                                            ? value
                                            : Number(value);
                                        field.onChange(normalizeOrganizerManualTaxRateBps(numeric * 100));
                                    }}
                                />
                            )}
                        />
                    </div>
                </AnimatedSection>
            </div>
        </AnimatedSection>
        <AnimatedSection in={!hasStripeAccount}>
            <div className="mt-2">
                <button
                    type="button"
                    onClick={onConnectStripe}
                    disabled={connectingStripe}
                    className={`px-4 py-2 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${connectingStripe ? 'bg-blue-500' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {connectingStripe ? (
                        <span className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                            Connecting...
                        </span>
                    ) : (
                        'Connect Stripe Account'
                    )}
                </button>
                <p className="text-sm text-gray-600 mt-1">
                    Connect your Stripe account to enable paid events and set a price.
                </p>
            </div>
        </AnimatedSection>
    </AnimatedLayoutSection>
);
