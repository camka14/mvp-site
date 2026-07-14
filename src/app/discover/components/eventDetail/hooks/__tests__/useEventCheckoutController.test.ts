import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { isApiRequestError } from '@/lib/apiClient';
import { billingAddressService } from '@/lib/billingAddressService';
import { paymentService } from '@/lib/paymentService';
import type { Event, UserData } from '@/types';

import { useEventCheckoutController } from '../useEventCheckoutController';
import { useEventDiscountPreview } from '../useEventDiscountPreview';
import { useEventRegistrationProgress } from '../useEventRegistrationProgress';

jest.mock('@/lib/apiClient', () => ({
    isApiRequestError: jest.fn(),
}));

jest.mock('@/lib/billingAddressService', () => ({
    billingAddressService: {
        getBillingAddressProfile: jest.fn(),
    },
}));

jest.mock('@/lib/paymentService', () => ({
    paymentService: {
        createPaymentIntent: jest.fn(),
    },
}));

jest.mock('../useEventDiscountPreview', () => ({
    useEventDiscountPreview: jest.fn(),
}));

jest.mock('../useEventRegistrationProgress', () => ({
    useEventRegistrationProgress: jest.fn(),
}));

const mockedIsApiRequestError = isApiRequestError as jest.MockedFunction<typeof isApiRequestError>;
const mockedGetBillingAddressProfile = billingAddressService.getBillingAddressProfile as jest.MockedFunction<
    typeof billingAddressService.getBillingAddressProfile
>;
const mockedCreatePaymentIntent = paymentService.createPaymentIntent as jest.MockedFunction<
    typeof paymentService.createPaymentIntent
>;
const mockedUseDiscount = useEventDiscountPreview as jest.MockedFunction<
    typeof useEventDiscountPreview
>;
const mockedUseProgress = useEventRegistrationProgress as jest.MockedFunction<
    typeof useEventRegistrationProgress
>;

const progress = {
    progressKey: 'progress_key',
    holdExpiresAt: null,
    setHoldExpiresAt: jest.fn(),
    save: jest.fn(),
    clear: jest.fn(),
};

const discount = {
    code: 'SAVE25',
    preview: null,
    loading: false,
    error: null,
    prepare: jest.fn(),
    resetPreview: jest.fn(),
    changeCode: jest.fn(),
    clearCode: jest.fn(),
    apply: jest.fn(),
    validateAppliedCode: jest.fn(() => true),
};

const setWorkflowPhase = jest.fn();
const user = { $id: 'user_1' } as UserData;
const event = { $id: 'event_1' } as Event;

function useCheckoutHarness() {
    const [answers, setAnswers] = useState<Record<string, string>>({ question_1: 'Yes' });
    const [selectedTeamId, setSelectedTeamId] = useState('team_1');
    const [selectedDivisionId, setSelectedDivisionId] = useState('division_1');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('type_1');
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>('old error');
    const checkout = useEventCheckoutController({
        user,
        eventId: event.$id,
        occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        registrationQuestionAnswers: answers,
        selectedTeamId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        setRegistrationQuestionAnswers: setAnswers,
        setSelectedTeamId,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
        setJoining,
        setJoinError,
        setWorkflowPhase,
    });
    return { checkout, joining, joinError };
}

describe('useEventCheckoutController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        progress.holdExpiresAt = null;
        discount.code = 'SAVE25';
        discount.preview = null;
        discount.loading = false;
        discount.error = null;
        discount.validateAppliedCode.mockReturnValue(true);
        mockedUseProgress.mockReturnValue(progress);
        mockedUseDiscount.mockReturnValue(discount);
        mockedIsApiRequestError.mockReturnValue(false);
    });

    it('opens checkout preview when the saved billing address is complete', async () => {
        mockedGetBillingAddressProfile.mockResolvedValue({
            billingAddress: {
                line1: '100 Main St',
                city: 'Portland',
                state: 'OR',
                postalCode: '97205',
                countryCode: 'US',
            },
        });
        const { result } = renderHook(() => useCheckoutHarness());

        await act(async () => {
            await result.current.checkout.prepareCheckout({ event, discountCode: ' SAVE25 ' });
        });

        expect(result.current.checkout.pendingCheckout).toEqual({ event, discountCode: ' SAVE25 ' });
        expect(discount.prepare).toHaveBeenCalledWith(' SAVE25 ');
        expect(result.current.joinError).toBeNull();
        expect(setWorkflowPhase).toHaveBeenNthCalledWith(1, 'billing-address', false);
        expect(setWorkflowPhase).toHaveBeenNthCalledWith(2, 'checkout-preview', true);
    });

    it('opens billing collection when the profile is incomplete', async () => {
        mockedGetBillingAddressProfile.mockResolvedValue({
            billingAddress: { line1: '100 Main St' },
        });
        const { result } = renderHook(() => useCheckoutHarness());

        await act(async () => {
            await result.current.checkout.prepareCheckout({ event });
        });

        expect(setWorkflowPhase).toHaveBeenNthCalledWith(1, 'checkout-preview', false);
        expect(setWorkflowPhase).toHaveBeenNthCalledWith(2, 'billing-address', true);
    });

    it('creates a payment intent, persists the hold, and opens payment', async () => {
        mockedCreatePaymentIntent.mockResolvedValue({
            clientSecret: 'secret_1',
            registrationId: 'registration_1',
            registrationHoldExpiresAt: '2026-07-15T21:00:00.000Z',
        });
        const { result } = renderHook(() => useCheckoutHarness());

        await act(async () => {
            await result.current.checkout.startCheckout({
                event,
                selection: { divisionId: 'division_2', divisionTypeKey: 'type_2' },
                answers: [{ questionId: 'question_2', answer: 'No' }],
            });
        });

        expect(progress.setHoldExpiresAt).toHaveBeenCalledWith('2026-07-15T21:00:00.000Z');
        expect(progress.save).toHaveBeenCalledWith(expect.objectContaining({
            step: 'checkout',
            answers: { question_2: 'No' },
            selectedTeamId: 'team_1',
            selectedDivisionId: 'division_2',
            selectedDivisionTypeKey: 'type_2',
            registrationId: 'registration_1',
        }));
        expect(result.current.checkout.paymentData?.clientSecret).toBe('secret_1');
        expect(setWorkflowPhase).toHaveBeenNthCalledWith(1, 'payment', true);
        expect(discount.resetPreview).toHaveBeenCalledTimes(1);
    });

    it('retains checkout context and requests billing when the API requires it', async () => {
        const billingRequiredError = { data: { billingAddressRequired: true } };
        mockedCreatePaymentIntent.mockRejectedValue(billingRequiredError);
        mockedIsApiRequestError.mockImplementation((error) => error === billingRequiredError);
        const { result } = renderHook(() => useCheckoutHarness());

        await act(async () => {
            await result.current.checkout.startCheckout({ event, discountCode: 'SAVE25' });
        });

        expect(result.current.checkout.pendingCheckout).toEqual({
            event,
            team: undefined,
            eventRegistration: undefined,
            selection: undefined,
            answers: undefined,
            discountCode: 'SAVE25',
        });
        expect(setWorkflowPhase).toHaveBeenNthCalledWith(1, 'billing-address', true);
        expect(setWorkflowPhase).toHaveBeenNthCalledWith(2, 'checkout-preview', false);
    });

    it('clears checkout state and reports an expired registration hold', () => {
        const { result } = renderHook(() => useCheckoutHarness());

        act(() => result.current.checkout.expireHold());

        expect(progress.clear).toHaveBeenCalledTimes(1);
        expect(result.current.checkout.paymentData).toBeNull();
        expect(result.current.checkout.pendingCheckout).toBeNull();
        expect(result.current.joinError).toBe(
            'Registration hold expired. Start registration again to reserve a new spot.',
        );
        expect(setWorkflowPhase).toHaveBeenCalledWith('payment', false);
        expect(setWorkflowPhase).toHaveBeenCalledWith('billing-address', false);
    });
});
