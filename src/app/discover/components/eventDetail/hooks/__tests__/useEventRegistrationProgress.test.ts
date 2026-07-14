import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';

import {
    buildRegistrationProgressKey,
    clearRegistrationProgress,
    loadRegistrationProgress,
    saveRegistrationProgress,
} from '@/lib/registrationProgressStorage';

import { useEventRegistrationProgress } from '../useEventRegistrationProgress';

jest.mock('@/lib/registrationProgressStorage', () => ({
    buildRegistrationProgressKey: jest.fn(),
    clearRegistrationProgress: jest.fn(),
    loadRegistrationProgress: jest.fn(),
    saveRegistrationProgress: jest.fn(),
}));

const mockedBuildKey = buildRegistrationProgressKey as jest.MockedFunction<
    typeof buildRegistrationProgressKey
>;
const mockedClear = clearRegistrationProgress as jest.MockedFunction<
    typeof clearRegistrationProgress
>;
const mockedLoad = loadRegistrationProgress as jest.MockedFunction<
    typeof loadRegistrationProgress
>;
const mockedSave = saveRegistrationProgress as jest.MockedFunction<
    typeof saveRegistrationProgress
>;

function useProgressHarness() {
    const [answers, setAnswers] = useState<Record<string, string>>({ existing: 'answer' });
    const [selectedTeamId, setSelectedTeamId] = useState('team_initial');
    const [selectedDivisionId, setSelectedDivisionId] = useState('division_initial');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('type_initial');
    const progress = useEventRegistrationProgress({
        userId: 'user_1',
        eventId: 'event_1',
        slotId: 'slot_1',
        occurrenceDate: '2026-07-15',
        answers,
        selectedTeamId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        registrationId: 'registration_1',
        setAnswers,
        setSelectedTeamId,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });

    return {
        answers,
        selectedTeamId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        progress,
    };
}

describe('useEventRegistrationProgress', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedBuildKey.mockReturnValue('progress_key');
        mockedLoad.mockReturnValue(null);
    });

    it('hydrates the current workflow from the scoped registration draft', async () => {
        mockedLoad.mockReturnValue({
            version: 1,
            scope: 'event',
            userId: 'user_1',
            subjectId: 'event_1',
            answers: { restored: 'yes' },
            selectedTeamId: 'team_restored',
            selectedDivisionId: 'division_restored',
            selectedDivisionTypeKey: 'type_restored',
            holdExpiresAt: '2026-07-15T20:00:00.000Z',
            updatedAt: '2026-07-14T20:00:00.000Z',
        });

        const { result } = renderHook(() => useProgressHarness());

        await waitFor(() => expect(result.current.selectedTeamId).toBe('team_restored'));
        expect(result.current.answers).toEqual({ existing: 'answer', restored: 'yes' });
        expect(result.current.selectedDivisionId).toBe('division_restored');
        expect(result.current.selectedDivisionTypeKey).toBe('type_restored');
        expect(result.current.progress.holdExpiresAt).toBe('2026-07-15T20:00:00.000Z');
        expect(mockedBuildKey).toHaveBeenCalledWith({
            scope: 'event',
            userId: 'user_1',
            subjectId: 'event_1',
            slotId: 'slot_1',
            occurrenceDate: '2026-07-15',
        });
    });

    it('saves the latest defaults with explicit patch values taking precedence', () => {
        const { result } = renderHook(() => useProgressHarness());
        act(() => {
            result.current.progress.setHoldExpiresAt('2026-07-15T21:00:00.000Z');
        });
        act(() => {
            result.current.progress.save({
                step: 'checkout',
                selectedTeamId: 'team_override',
                registrationId: 'registration_override',
            });
        });

        expect(mockedSave).toHaveBeenCalledWith('progress_key', {
            scope: 'event',
            userId: 'user_1',
            subjectId: 'event_1',
            step: 'checkout',
            answers: { existing: 'answer' },
            selectedTeamId: 'team_override',
            selectedDivisionId: 'division_initial',
            selectedDivisionTypeKey: 'type_initial',
            slotId: 'slot_1',
            occurrenceDate: '2026-07-15',
            registrationId: 'registration_override',
            holdExpiresAt: '2026-07-15T21:00:00.000Z',
        });
    });

    it('clears both storage and the active hold', () => {
        const { result } = renderHook(() => useProgressHarness());
        act(() => {
            result.current.progress.setHoldExpiresAt('2026-07-15T21:00:00.000Z');
        });
        act(() => {
            result.current.progress.clear();
        });

        expect(mockedClear).toHaveBeenCalledWith('progress_key');
        expect(result.current.progress.holdExpiresAt).toBeNull();
    });
});
