import { act, renderHook } from '@testing-library/react';

import { paymentService } from '@/lib/paymentService';
import type { Event, Team, UserData } from '@/types';

import { useEventDiscountPreview } from '../useEventDiscountPreview';

jest.mock('@/lib/paymentService', () => ({
    paymentService: {
        previewEventDiscount: jest.fn(),
    },
}));

const mockedPreviewEventDiscount = paymentService.previewEventDiscount as jest.MockedFunction<
    typeof paymentService.previewEventDiscount
>;

const user = { $id: 'user_1' } as UserData;
const event = { $id: 'event_1' } as Event;
const team = { $id: 'team_1' } as Team;

describe('useEventDiscountPreview', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('prepares a trimmed code and requires it to be applied before checkout', () => {
        const { result } = renderHook(() => useEventDiscountPreview());

        act(() => result.current.prepare('  summer25  '));
        expect(result.current.code).toBe('summer25');
        act(() => expect(result.current.validateAppliedCode()).toBe(false));
        expect(result.current.error).toBe('Apply the discount code before continuing to payment.');

        act(() => result.current.clearCode());
        expect(result.current.code).toBe('');
        expect(result.current.error).toBeNull();
        expect(result.current.validateAppliedCode()).toBe(true);
    });

    it('stores a successful canonical preview and forwards checkout context', async () => {
        mockedPreviewEventDiscount.mockResolvedValue({
            code: 'SUMMER25',
            originalAmountCents: 2_000,
            discountAmountCents: 500,
            finalAmountCents: 1_500,
        });
        const { result } = renderHook(() => useEventDiscountPreview());
        act(() => result.current.changeCode(' summer25 '));

        await act(async () => {
            await result.current.apply({
                checkout: {
                    event,
                    team,
                    selection: { divisionId: 'division_1' },
                    answers: [{ questionId: 'question_1', answer: 'Yes' }],
                },
                user,
                occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
            });
        });

        expect(mockedPreviewEventDiscount).toHaveBeenCalledWith({
            user,
            event,
            team,
            selection: { divisionId: 'division_1' },
            occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
            answers: [{ questionId: 'question_1', answer: 'Yes' }],
            discountCode: 'summer25',
            eventRegistration: undefined,
        });
        expect(result.current.code).toBe('SUMMER25');
        expect(result.current.preview?.finalAmountCents).toBe(1_500);
        expect(result.current.loading).toBe(false);
        expect(result.current.validateAppliedCode()).toBe(true);
    });

    it('does not call the service for an empty code', async () => {
        const { result } = renderHook(() => useEventDiscountPreview());

        await act(async () => {
            await result.current.apply({ checkout: { event }, user });
        });

        expect(mockedPreviewEventDiscount).not.toHaveBeenCalled();
        expect(result.current.preview).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('surfaces preview failures and clears a prior preview', async () => {
        mockedPreviewEventDiscount
            .mockResolvedValueOnce({
                code: 'SAVE',
                originalAmountCents: 2_000,
                discountAmountCents: 500,
                finalAmountCents: 1_500,
            })
            .mockRejectedValueOnce(new Error('Discount expired.'));
        const { result } = renderHook(() => useEventDiscountPreview());
        act(() => result.current.changeCode('SAVE'));
        await act(async () => {
            await result.current.apply({ checkout: { event }, user });
        });
        expect(result.current.preview).not.toBeNull();

        await act(async () => {
            await result.current.apply({ checkout: { event }, user });
        });
        expect(result.current.preview).toBeNull();
        expect(result.current.error).toBe('Discount expired.');
        expect(result.current.loading).toBe(false);
    });
});
