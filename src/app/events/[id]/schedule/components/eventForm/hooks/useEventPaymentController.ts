import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseFormGetValues } from 'react-hook-form';

import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import { normalizeManualPaymentProvider } from '@/lib/manualRegistrationPayments';
import { isStripeConnectMfaRequiredError, paymentService } from '@/lib/paymentService';
import { normalizePriceCents } from '@/lib/priceUtils';
import {
    normalizeOrganizationDefaultEventTaxHandling,
    resolvePurchaseTaxPolicy,
    taxPolicyRequiresStripeTaxCalculation,
} from '@/lib/taxPolicy';
import { createClientId } from '@/lib/clientId';
import { canOrganizationUsePaidBilling } from '@/lib/organizationVerification';
import type { ManualPaymentLink, Organization, UserData } from '@/types';

import type { EventFormValues } from '../formTypes';
import { canUseAutomaticRefunds, sumInstallmentAmounts } from '../paymentPlanHelpers';

type SetEventFormValue = (
    name: string,
    value: unknown,
    options?: PaymentFieldOptions,
) => void;

type PaymentFieldOptions = {
    shouldDirty?: boolean;
    shouldValidate?: boolean;
};

type UseEventPaymentControllerOptions = {
    currentUser: UserData;
    eventData: EventFormValues;
    getValues: UseFormGetValues<EventFormValues>;
    isCreateMode: boolean;
    resolvedOrganization: Organization | null;
    setValue: SetEventFormValue;
};

const PAYMENT_FIELD_OPTIONS: PaymentFieldOptions = { shouldDirty: true, shouldValidate: true };
const PAYMENT_RESET_OPTIONS: PaymentFieldOptions = { shouldDirty: false, shouldValidate: true };
const EMPTY_MANUAL_PAYMENT_LINKS: ManualPaymentLink[] = [];

export const useEventPaymentController = ({
    currentUser,
    eventData,
    getValues,
    isCreateMode,
    resolvedOrganization,
    setValue,
}: UseEventPaymentControllerOptions) => {
    const [connectingStripe, setConnectingStripe] = useState(false);

    const resolvedOrganizationId = (resolvedOrganization?.$id ?? '').trim();
    const hasStripeAccount = resolvedOrganization
        ? canOrganizationUsePaidBilling(resolvedOrganization)
        : Boolean(currentUser?.hasStripeAccount);
    const manualPaymentsEnabled = eventData.registrationPaymentMode === 'MANUAL';
    const pricingControlsEnabled = hasStripeAccount || manualPaymentsEnabled;
    const manualPaymentLinks = Array.isArray(eventData.manualPaymentLinks)
        ? eventData.manualPaymentLinks
        : EMPTY_MANUAL_PAYMENT_LINKS;

    const automaticRefundsAvailable = useMemo(
        () => canUseAutomaticRefunds({
            hasStripeAccount,
            singleDivision: eventData.singleDivision,
            price: eventData.price,
            divisionDetails: eventData.divisionDetails,
        }),
        [
            eventData.divisionDetails,
            eventData.price,
            eventData.singleDivision,
            hasStripeAccount,
        ],
    );

    const organizationDefaultEventTaxHandling = normalizeOrganizationDefaultEventTaxHandling(
        resolvedOrganization?.defaultEventTaxHandling,
    );
    const eventTaxPolicyForPreview = useMemo(() => resolvePurchaseTaxPolicy({
        purchaseType: 'event',
        taxCategory: 'EVENT_PARTICIPANT',
        event: {
            address: eventData.address,
            location: eventData.location,
            organizationId: eventData.organizationId || resolvedOrganizationId || undefined,
            taxHandling: eventData.taxHandling,
            organizerManualTaxRateBps: eventData.organizerManualTaxRateBps,
        },
        organization: resolvedOrganization
            ? {
                defaultEventTaxHandling: organizationDefaultEventTaxHandling,
                taxResponsibilityAcceptedAt: resolvedOrganization.taxResponsibilityAcceptedAt,
            }
            : null,
    }), [
        eventData.address,
        eventData.location,
        eventData.organizationId,
        eventData.organizerManualTaxRateBps,
        eventData.taxHandling,
        organizationDefaultEventTaxHandling,
        resolvedOrganization,
        resolvedOrganizationId,
    ]);
    const eventTaxableForPreview = hasStripeAccount
        && taxPolicyRequiresStripeTaxCalculation(eventTaxPolicyForPreview);
    const organizerTaxCollectionAllowed = eventTaxPolicyForPreview.liabilityParty === 'ORGANIZER';
    const organizerManualTaxSelected = organizerTaxCollectionAllowed
        && eventTaxPolicyForPreview.collectionStrategy === 'ORGANIZER_MANUAL_TAX';

    const clearPaymentPlanFields = useCallback((options: PaymentFieldOptions = PAYMENT_FIELD_OPTIONS) => {
        if (eventData.cancellationRefundHours != null) {
            setValue('cancellationRefundHours', null, options);
        }
        if (eventData.allowPaymentPlans) {
            setValue('allowPaymentPlans', false, options);
        }
        if (Number(eventData.installmentCount) !== 0) {
            setValue('installmentCount', 0, options);
        }
        if (eventData.installmentAmounts?.length) {
            setValue('installmentAmounts', [], options);
        }
        if (eventData.installmentDueDates?.length) {
            setValue('installmentDueDates', [], options);
        }
        if (eventData.installmentDueRelativeDays?.length) {
            setValue('installmentDueRelativeDays', [], options);
        }

        const currentDivisionDetails = eventData.divisionDetails ?? [];
        const nextDivisionDetails = currentDivisionDetails.map((detail) => {
            const hasPaymentPlan = Boolean(detail.allowPaymentPlans)
                || Number(detail.installmentCount) !== 0
                || Boolean(detail.installmentAmounts?.length)
                || Boolean(detail.installmentDueDates?.length)
                || Boolean(detail.installmentDueRelativeDays?.length);
            return hasPaymentPlan
                ? {
                    ...detail,
                    allowPaymentPlans: false,
                    installmentCount: 0,
                    installmentAmounts: [],
                    installmentDueDates: [],
                    installmentDueRelativeDays: [],
                }
                : detail;
        });
        if (nextDivisionDetails.some((detail, index) => detail !== currentDivisionDetails[index])) {
            setValue('divisionDetails', nextDivisionDetails, options);
        }
    }, [
        eventData.allowPaymentPlans,
        eventData.cancellationRefundHours,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        setValue,
    ]);

    useEffect(() => {
        if (
            !isCreateMode
            || eventData.isAffiliateEvent
            || hasStripeAccount
            || manualPaymentsEnabled
        ) {
            return;
        }
        setValue('registrationPaymentMode', 'MANUAL', PAYMENT_RESET_OPTIONS);
    }, [
        eventData.isAffiliateEvent,
        hasStripeAccount,
        isCreateMode,
        manualPaymentsEnabled,
        setValue,
    ]);

    useEffect(() => {
        if (manualPaymentsEnabled) {
            clearPaymentPlanFields(PAYMENT_RESET_OPTIONS);
        }
    }, [clearPaymentPlanFields, manualPaymentsEnabled]);

    const syncInstallmentCount = useCallback((count: number) => {
        const safeCount = Math.max(1, Math.floor(Number(count) || 0));
        const amounts = [...(getValues('installmentAmounts') || [])];
        const dueDates = [...(getValues('installmentDueDates') || [])];
        const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
        const price = getValues('price') || 0;
        const startDate = getValues('start');
        const useRelativeDueDates = getValues('eventType') === 'WEEKLY_EVENT'
            && !getValues('parentEvent');
        while (amounts.length < safeCount) {
            amounts.push(amounts.length === 0 ? price : 0);
            dueDates.push(startDate);
            relativeDueDays.push(0);
        }
        while (amounts.length > safeCount) {
            amounts.pop();
            dueDates.pop();
            relativeDueDays.pop();
        }
        setValue('installmentCount', safeCount, PAYMENT_FIELD_OPTIONS);
        setValue('installmentAmounts', amounts, PAYMENT_FIELD_OPTIONS);
        setValue('price', sumInstallmentAmounts(amounts), PAYMENT_FIELD_OPTIONS);
        setValue('installmentDueDates', useRelativeDueDates ? [] : dueDates, PAYMENT_FIELD_OPTIONS);
        setValue(
            'installmentDueRelativeDays',
            useRelativeDueDates ? relativeDueDays : [],
            PAYMENT_FIELD_OPTIONS,
        );
    }, [getValues, setValue]);

    const setInstallmentAmount = useCallback((index: number, value: number) => {
        const amounts = [...(getValues('installmentAmounts') || [])];
        if (index >= amounts.length) return;
        amounts[index] = normalizePriceCents(value);
        setValue('installmentAmounts', amounts, PAYMENT_FIELD_OPTIONS);
        setValue('price', sumInstallmentAmounts(amounts), PAYMENT_FIELD_OPTIONS);
    }, [getValues, setValue]);

    const setInstallmentDueDate = useCallback((index: number, value: Date | string | null) => {
        const dueDates = [...(getValues('installmentDueDates') || [])];
        if (index >= dueDates.length) return;
        dueDates[index] = value instanceof Date
            ? value.toISOString()
            : typeof value === 'string'
                ? value
                : '';
        setValue('installmentDueDates', dueDates, PAYMENT_FIELD_OPTIONS);
    }, [getValues, setValue]);

    const setInstallmentDueRelativeDay = useCallback((index: number, value: number | string) => {
        const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
        const amounts = getValues('installmentAmounts') || [];
        if (index < 0 || index >= amounts.length) return;
        while (relativeDueDays.length < amounts.length) {
            relativeDueDays.push(0);
        }
        const parsed = typeof value === 'number' ? value : Number(value);
        relativeDueDays[index] = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
        setValue('installmentDueRelativeDays', relativeDueDays, PAYMENT_FIELD_OPTIONS);
        setValue('installmentDueDates', [], PAYMENT_FIELD_OPTIONS);
    }, [getValues, setValue]);

    const removeInstallment = useCallback((index: number) => {
        const amounts = [...(getValues('installmentAmounts') || [])];
        const dueDates = [...(getValues('installmentDueDates') || [])];
        const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
        if (amounts.length <= 1) return;
        amounts.splice(index, 1);
        dueDates.splice(index, 1);
        relativeDueDays.splice(index, 1);
        setValue('installmentAmounts', amounts, PAYMENT_FIELD_OPTIONS);
        setValue('price', sumInstallmentAmounts(amounts), PAYMENT_FIELD_OPTIONS);
        setValue('installmentDueDates', dueDates, PAYMENT_FIELD_OPTIONS);
        setValue('installmentDueRelativeDays', relativeDueDays, PAYMENT_FIELD_OPTIONS);
        setValue('installmentCount', amounts.length, PAYMENT_FIELD_OPTIONS);
    }, [getValues, setValue]);

    const setManualPaymentLinkValue = useCallback((
        index: number,
        field: 'provider' | 'label' | 'url',
        value: string,
    ) => {
        const nextLinks = [...(getValues('manualPaymentLinks') || [])];
        const current = nextLinks[index];
        if (!current) return;
        nextLinks[index] = {
            ...current,
            [field]: field === 'provider' ? normalizeManualPaymentProvider(value) : value,
        };
        setValue('manualPaymentLinks', nextLinks, PAYMENT_FIELD_OPTIONS);
    }, [getValues, setValue]);

    const addManualPaymentLink = useCallback(() => {
        const currentLinks = getValues('manualPaymentLinks') || [];
        setValue('manualPaymentLinks', [
            ...currentLinks,
            {
                id: createClientId(),
                provider: 'VENMO',
                label: 'Venmo',
                url: '',
            },
        ], PAYMENT_FIELD_OPTIONS);
    }, [getValues, setValue]);

    const removeManualPaymentLink = useCallback((index: number) => {
        const currentLinks = getValues('manualPaymentLinks') || [];
        setValue(
            'manualPaymentLinks',
            currentLinks.filter((_, linkIndex) => linkIndex !== index),
            PAYMENT_FIELD_OPTIONS,
        );
    }, [getValues, setValue]);

    const setManualPaymentsEnabled = useCallback((enabled: boolean) => {
        setValue('registrationPaymentMode', enabled ? 'MANUAL' : 'ONLINE', PAYMENT_FIELD_OPTIONS);
        if (enabled) {
            clearPaymentPlanFields();
            return;
        }
        setValue('manualPaymentLinks', [], PAYMENT_FIELD_OPTIONS);
        setValue('manualPaymentInstructions', '', PAYMENT_FIELD_OPTIONS);
    }, [clearPaymentPlanFields, setValue]);

    const connectStripe = useCallback(async () => {
        if (!currentUser || typeof window === 'undefined') return;
        try {
            setConnectingStripe(true);
            const origin = resolveClientPublicOrigin();
            if (!origin) {
                console.error('Unable to determine public URL for Stripe onboarding.');
                return;
            }
            const result = await paymentService.connectStripeAccount({
                user: currentUser,
                refreshUrl: `${origin}/discover?stripe=refresh`,
                returnUrl: `${origin}/discover?stripe=return`,
            });
            if (result?.onboardingUrl) {
                window.location.href = result.onboardingUrl;
            }
        } catch (error) {
            if (isStripeConnectMfaRequiredError(error)) {
                window.location.href = error.mfaSetupPath;
                return;
            }
            console.error('Failed to connect Stripe account:', error);
        } finally {
            setConnectingStripe(false);
        }
    }, [currentUser]);

    return {
        addManualPaymentLink,
        automaticRefundsAvailable,
        connectStripe,
        connectingStripe,
        eventTaxableForPreview,
        eventTaxPolicyForPreview,
        hasStripeAccount,
        manualPaymentLinks,
        manualPaymentsEnabled,
        organizationDefaultEventTaxHandling,
        organizerManualTaxSelected,
        organizerTaxCollectionAllowed,
        pricingControlsEnabled,
        removeInstallment,
        removeManualPaymentLink,
        setInstallmentAmount,
        setInstallmentDueDate,
        setInstallmentDueRelativeDay,
        setManualPaymentLinkValue,
        setManualPaymentsEnabled,
        syncInstallmentCount,
    };
};
