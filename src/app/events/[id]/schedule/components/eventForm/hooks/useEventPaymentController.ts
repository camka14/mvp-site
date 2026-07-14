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
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseEventPaymentControllerOptions = {
    currentUser: UserData;
    eventData: EventFormValues;
    getValues: UseFormGetValues<EventFormValues>;
    isCreateMode: boolean;
    resolvedOrganization: Organization | null;
    setValue: SetEventFormValue;
};

const PAYMENT_FIELD_OPTIONS = { shouldDirty: true, shouldValidate: true } as const;
const PAYMENT_RESET_OPTIONS = { shouldDirty: false, shouldValidate: true } as const;
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

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount || manualPaymentsEnabled) {
            return;
        }

        const currentPrice = Number.isFinite(Number(eventData.price))
            ? Number(eventData.price)
            : 0;
        if (currentPrice !== 0) {
            setValue('price', 0, PAYMENT_RESET_OPTIONS);
        }
        if (eventData.allowPaymentPlans) {
            setValue('allowPaymentPlans', false, PAYMENT_RESET_OPTIONS);
        }

        const currentInstallmentCount = Number.isFinite(Number(eventData.installmentCount))
            ? Number(eventData.installmentCount)
            : 0;
        if (currentInstallmentCount !== 0) {
            setValue('installmentCount', 0, PAYMENT_RESET_OPTIONS);
        }
        if (Array.isArray(eventData.installmentAmounts) && eventData.installmentAmounts.length > 0) {
            setValue('installmentAmounts', [], PAYMENT_RESET_OPTIONS);
        }
        if (Array.isArray(eventData.installmentDueDates) && eventData.installmentDueDates.length > 0) {
            setValue('installmentDueDates', [], PAYMENT_RESET_OPTIONS);
        }
        if (
            Array.isArray(eventData.installmentDueRelativeDays)
            && eventData.installmentDueRelativeDays.length > 0
        ) {
            setValue('installmentDueRelativeDays', [], PAYMENT_RESET_OPTIONS);
        }

        const currentDivisionDetails = Array.isArray(eventData.divisionDetails)
            ? eventData.divisionDetails
            : [];
        const nextDivisionDetails = currentDivisionDetails.map((detail) => {
            const detailPrice = Number.isFinite(Number(detail.price)) ? Number(detail.price) : 0;
            const detailInstallmentCount = Number.isFinite(Number(detail.installmentCount))
                ? Number(detail.installmentCount)
                : 0;
            const hasPaidSettings = detailPrice !== 0
                || Boolean(detail.allowPaymentPlans)
                || detailInstallmentCount !== 0
                || (Array.isArray(detail.installmentAmounts) && detail.installmentAmounts.length > 0)
                || (Array.isArray(detail.installmentDueDates) && detail.installmentDueDates.length > 0)
                || (
                    Array.isArray(detail.installmentDueRelativeDays)
                    && detail.installmentDueRelativeDays.length > 0
                );
            if (!hasPaidSettings) {
                return detail;
            }
            return {
                ...detail,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
            };
        });
        if (nextDivisionDetails.some((detail, index) => detail !== currentDivisionDetails[index])) {
            setValue('divisionDetails', nextDivisionDetails, PAYMENT_RESET_OPTIONS);
        }
    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.price,
        hasStripeAccount,
        isCreateMode,
        manualPaymentsEnabled,
        setValue,
    ]);

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
        const nextLinks = [...manualPaymentLinks];
        const current = nextLinks[index];
        if (!current) return;
        nextLinks[index] = {
            ...current,
            [field]: field === 'provider' ? normalizeManualPaymentProvider(value) : value,
        };
        setValue('manualPaymentLinks', nextLinks, PAYMENT_FIELD_OPTIONS);
    }, [manualPaymentLinks, setValue]);

    const addManualPaymentLink = useCallback(() => {
        setValue('manualPaymentLinks', [
            ...manualPaymentLinks,
            {
                id: createClientId(),
                provider: 'VENMO',
                label: 'Venmo',
                url: '',
            },
        ], PAYMENT_FIELD_OPTIONS);
    }, [manualPaymentLinks, setValue]);

    const removeManualPaymentLink = useCallback((index: number) => {
        setValue(
            'manualPaymentLinks',
            manualPaymentLinks.filter((_, linkIndex) => linkIndex !== index),
            PAYMENT_FIELD_OPTIONS,
        );
    }, [manualPaymentLinks, setValue]);

    const setManualPaymentsEnabled = useCallback((enabled: boolean) => {
        setValue('registrationPaymentMode', enabled ? 'MANUAL' : 'ONLINE', PAYMENT_FIELD_OPTIONS);
        if (enabled) {
            setValue('cancellationRefundHours', null, PAYMENT_FIELD_OPTIONS);
            return;
        }
        setValue('manualPaymentLinks', [], PAYMENT_FIELD_OPTIONS);
        setValue('manualPaymentInstructions', '', PAYMENT_FIELD_OPTIONS);
    }, [setValue]);

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
