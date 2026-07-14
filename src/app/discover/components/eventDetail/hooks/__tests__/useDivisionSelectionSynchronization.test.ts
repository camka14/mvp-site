import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { useDivisionSelectionSynchronization } from '../useDivisionSelectionSynchronization';

const OPEN = { id: 'open', divisionTypeKey: 'adult' };
const JUNIOR = { id: 'junior', divisionTypeKey: 'youth' };

function useHarness({
    options,
    initialDivisionId = '',
    initialDivisionTypeKey = '',
}: {
    options: Array<{ id: string; divisionTypeKey: string }>;
    initialDivisionId?: string;
    initialDivisionTypeKey?: string;
}) {
    const [selectedDivisionId, setSelectedDivisionId] = useState(initialDivisionId);
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState(initialDivisionTypeKey);
    useDivisionSelectionSynchronization({
        options,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });
    return {
        selectedDivisionId,
        selectedDivisionTypeKey,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    };
}

describe('useDivisionSelectionSynchronization', () => {
    it('selects the first available division and type when no choice exists', () => {
        const { result } = renderHook(() => useHarness({ options: [OPEN, JUNIOR] }));

        expect(result.current.selectedDivisionId).toBe('open');
        expect(result.current.selectedDivisionTypeKey).toBe('adult');
    });

    it('preserves selections that remain available when options reorder', () => {
        const { result, rerender } = renderHook(
            ({ options }) => useHarness({
                options,
                initialDivisionId: 'junior',
                initialDivisionTypeKey: 'youth',
            }),
            { initialProps: { options: [OPEN, JUNIOR] } },
        );

        rerender({ options: [JUNIOR, OPEN] });

        expect(result.current.selectedDivisionId).toBe('junior');
        expect(result.current.selectedDivisionTypeKey).toBe('youth');
    });

    it('falls back when a previously selected division and type disappear', () => {
        const { result, rerender } = renderHook(
            ({ options }) => useHarness({ options }),
            { initialProps: { options: [OPEN, JUNIOR] } },
        );
        act(() => {
            result.current.setSelectedDivisionId('junior');
            result.current.setSelectedDivisionTypeKey('youth');
        });

        rerender({ options: [OPEN] });

        expect(result.current.selectedDivisionId).toBe('open');
        expect(result.current.selectedDivisionTypeKey).toBe('adult');
    });

    it('clears both selections when no eligible divisions remain', () => {
        const { result, rerender } = renderHook(
            ({ options }) => useHarness({
                options,
                initialDivisionId: 'open',
                initialDivisionTypeKey: 'adult',
            }),
            { initialProps: { options: [OPEN] } },
        );

        rerender({ options: [] });

        expect(result.current.selectedDivisionId).toBe('');
        expect(result.current.selectedDivisionTypeKey).toBe('');
    });
});
