import { act, renderHook } from '@testing-library/react';
import type { UseFormGetValues } from 'react-hook-form';

import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import { paymentService } from '@/lib/paymentService';
import type { Organization, UserData } from '@/types';

import type { EventFormValues } from '../../formTypes';
import { useEventPaymentController } from '../useEventPaymentController';

jest.mock('@/lib/clientPublicOrigin', () => ({
    resolveClientPublicOrigin: jest.fn(),
}));

jest.mock('@/lib/clientId', () => ({
    createClientId: jest.fn(() => 'manual_link_new'),
}));

jest.mock('@/lib/paymentService', () => ({
    isStripeConnectMfaRequiredError: jest.fn(() => false),
    paymentService: {
        connectStripeAccount: jest.fn(),
    },
}));

const mockedResolvePublicOrigin = resolveClientPublicOrigin as jest.MockedFunction<
    typeof resolveClientPublicOrigin
>;
const mockedConnectStripeAccount = paymentService.connectStripeAccount as jest.MockedFunction<
    typeof paymentService.connectStripeAccount
>;

const currentUser = {
    $id: 'user_1',
    hasStripeAccount: false,
} as UserData;

const buildEventData = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
    eventType: 'EVENT',
    registrationPaymentMode: 'ONLINE',
    singleDivision: true,
    price: 0,
    allowPaymentPlans: false,
    installmentCount: 0,
    installmentAmounts: [],
    installmentDueDates: [],
    installmentDueRelativeDays: [],
    divisionDetails: [],
    manualPaymentLinks: [],
    start: '2026-07-20T18:00:00.000Z',
    address: '100 Main St, Portland, OR',
    location: 'Portland, OR',
    ...overrides,
} as EventFormValues);

const buildGetValues = (values: EventFormValues): UseFormGetValues<EventFormValues> => (
    ((name?: keyof EventFormValues) => (name ? values[name] : values)) as UseFormGetValues<EventFormValues>
);

const renderController = ({
    eventData = buildEventData(),
    isCreateMode = false,
    organization = null,
    user = currentUser,
}: {
    eventData?: EventFormValues;
    isCreateMode?: boolean;
    organization?: Organization | null;
    user?: UserData;
} = {}) => {
    const setValue = jest.fn();
    const getValues = buildGetValues(eventData);
    const hook = renderHook(() => useEventPaymentController({
        currentUser: user,
        eventData,
        getValues,
        isCreateMode,
        resolvedOrganization: organization,
        setValue,
    }));
    return { ...hook, getValues, setValue };
};

describe('useEventPaymentController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedResolvePublicOrigin.mockReturnValue('https://bracket-iq.com');
        mockedConnectStripeAccount.mockResolvedValue({ onboardingUrl: '' });
    });

    it('clears paid event and division settings for an online create flow without Stripe', () => {
        const paidDivision = {
            id: 'division_paid',
            price: 3_000,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [1_500, 1_500],
            installmentDueDates: ['2026-07-15', '2026-07-20'],
            installmentDueRelativeDays: [],
        };
        const freeDivision = { id: 'division_free', price: 0 };
        const eventData = buildEventData({
            price: 5_000,
            allowPaymentPlans: true,
            installmentCount: 2,
            installmentAmounts: [2_500, 2_500],
            installmentDueDates: ['2026-07-15', '2026-07-20'],
            installmentDueRelativeDays: [0, 5],
            divisionDetails: [paidDivision, freeDivision],
        });

        const { setValue } = renderController({ eventData, isCreateMode: true });

        const resetOptions = { shouldDirty: false, shouldValidate: true };
        expect(setValue).toHaveBeenCalledWith('price', 0, resetOptions);
        expect(setValue).toHaveBeenCalledWith('allowPaymentPlans', false, resetOptions);
        expect(setValue).toHaveBeenCalledWith('installmentCount', 0, resetOptions);
        expect(setValue).toHaveBeenCalledWith('installmentAmounts', [], resetOptions);
        expect(setValue).toHaveBeenCalledWith('installmentDueDates', [], resetOptions);
        expect(setValue).toHaveBeenCalledWith('installmentDueRelativeDays', [], resetOptions);
        expect(setValue).toHaveBeenCalledWith('divisionDetails', [
            expect.objectContaining({
                id: 'division_paid',
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
            }),
            freeDivision,
        ], resetOptions);
    });

    it('preserves manual-payment pricing without enabling automatic refunds', () => {
        const eventData = buildEventData({
            registrationPaymentMode: 'MANUAL',
            price: 5_000,
            manualPaymentLinks: [{
                id: 'manual_link_1',
                provider: 'VENMO',
                label: 'Pay with Venmo',
                url: 'https://venmo.com/example',
            }],
        });

        const { result, setValue } = renderController({ eventData, isCreateMode: true });

        expect(setValue).not.toHaveBeenCalled();
        expect(result.current.manualPaymentsEnabled).toBe(true);
        expect(result.current.pricingControlsEnabled).toBe(true);
        expect(result.current.hasStripeAccount).toBe(false);
        expect(result.current.automaticRefundsAvailable).toBe(false);
        expect(result.current.manualPaymentLinks).toHaveLength(1);
    });

    it('uses organization billing eligibility for paid controls and automatic refunds', () => {
        const organization = {
            $id: 'org_1',
            hasStripeAccount: true,
            defaultEventTaxHandling: 'EXEMPT_PARTICIPANT_SPORTS',
        } as Organization;
        const eventData = buildEventData({ price: 2_500, organizationId: 'org_1' });

        const { result } = renderController({ eventData, organization });

        expect(result.current.hasStripeAccount).toBe(true);
        expect(result.current.pricingControlsEnabled).toBe(true);
        expect(result.current.automaticRefundsAvailable).toBe(true);
        expect(result.current.organizationDefaultEventTaxHandling).toBe('EXEMPT_PARTICIPANT_SPORTS');
    });

    it('builds a relative-date installment plan for a parentless weekly event', () => {
        const eventData = buildEventData({
            eventType: 'WEEKLY_EVENT',
            price: 3_000,
            parentEvent: undefined,
        });
        const user = { ...currentUser, hasStripeAccount: true } as UserData;
        const { result, setValue } = renderController({ eventData, user });

        act(() => result.current.syncInstallmentCount(2));

        const fieldOptions = { shouldDirty: true, shouldValidate: true };
        expect(setValue).toHaveBeenCalledWith('installmentCount', 2, fieldOptions);
        expect(setValue).toHaveBeenCalledWith('installmentAmounts', [3_000, 0], fieldOptions);
        expect(setValue).toHaveBeenCalledWith('price', 3_000, fieldOptions);
        expect(setValue).toHaveBeenCalledWith('installmentDueDates', [], fieldOptions);
        expect(setValue).toHaveBeenCalledWith('installmentDueRelativeDays', [0, 0], fieldOptions);
    });

    it('updates installment rows and keeps the aggregate price in sync', () => {
        const eventData = buildEventData({
            installmentCount: 2,
            installmentAmounts: [1_000, 2_000],
            installmentDueDates: ['2026-07-15', '2026-07-20'],
            installmentDueRelativeDays: [0, 5],
        });
        const user = { ...currentUser, hasStripeAccount: true } as UserData;
        const { result, setValue } = renderController({ eventData, user });

        act(() => result.current.setInstallmentAmount(1, 2_500.8));
        expect(setValue).toHaveBeenCalledWith(
            'installmentAmounts',
            [1_000, 2_500],
            { shouldDirty: true, shouldValidate: true },
        );
        expect(setValue).toHaveBeenCalledWith(
            'price',
            3_500,
            { shouldDirty: true, shouldValidate: true },
        );

        setValue.mockClear();
        act(() => result.current.removeInstallment(0));
        expect(setValue).toHaveBeenCalledWith(
            'installmentAmounts',
            [2_000],
            { shouldDirty: true, shouldValidate: true },
        );
        expect(setValue).toHaveBeenCalledWith(
            'installmentCount',
            1,
            { shouldDirty: true, shouldValidate: true },
        );
    });

    it('owns manual-payment link edits and mode cleanup', () => {
        const eventData = buildEventData({
            registrationPaymentMode: 'MANUAL',
            manualPaymentLinks: [{
                id: 'manual_link_1',
                provider: 'VENMO',
                label: 'Venmo',
                url: '',
            }],
        });
        const { result, setValue } = renderController({ eventData });
        const fieldOptions = { shouldDirty: true, shouldValidate: true };

        act(() => result.current.setManualPaymentLinkValue(0, 'provider', 'not-a-provider'));
        expect(setValue).toHaveBeenCalledWith('manualPaymentLinks', [{
            id: 'manual_link_1',
            provider: 'OTHER',
            label: 'Venmo',
            url: '',
        }], fieldOptions);

        act(() => result.current.addManualPaymentLink());
        expect(setValue).toHaveBeenCalledWith('manualPaymentLinks', [
            eventData.manualPaymentLinks?.[0],
            {
                id: 'manual_link_new',
                provider: 'VENMO',
                label: 'Venmo',
                url: '',
            },
        ], fieldOptions);

        setValue.mockClear();
        act(() => result.current.setManualPaymentsEnabled(false));
        expect(setValue.mock.calls).toEqual([
            ['registrationPaymentMode', 'ONLINE', fieldOptions],
            ['manualPaymentLinks', [], fieldOptions],
            ['manualPaymentInstructions', '', fieldOptions],
        ]);
    });

    it('starts and finishes Stripe onboarding through the current public origin', async () => {
        let resolveConnection!: (value: { onboardingUrl: string }) => void;
        mockedConnectStripeAccount.mockReturnValue(new Promise((resolve) => {
            resolveConnection = resolve;
        }));
        const user = { ...currentUser, hasStripeAccount: true } as UserData;
        const { result } = renderController({ user });

        let connectionPromise!: Promise<void>;
        act(() => {
            connectionPromise = result.current.connectStripe();
        });
        expect(result.current.connectingStripe).toBe(true);
        expect(mockedConnectStripeAccount).toHaveBeenCalledWith({
            user,
            refreshUrl: 'https://bracket-iq.com/discover?stripe=refresh',
            returnUrl: 'https://bracket-iq.com/discover?stripe=return',
        });

        await act(async () => {
            resolveConnection({ onboardingUrl: '' });
            await connectionPromise;
        });
        expect(result.current.connectingStripe).toBe(false);
    });
});
