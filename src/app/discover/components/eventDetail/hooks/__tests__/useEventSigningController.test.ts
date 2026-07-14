import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { apiRequest } from '@/lib/apiClient';
import type { SignStep } from '@/lib/boldsignService';
import type { Event, UserData } from '@/types';

import { loadRequiredEventSignLinks } from '../../eventRegistrationCommands';
import { useEventSigningController } from '../useEventSigningController';
import { useSigningStatusPoll } from '../useSigningStatusPoll';

jest.mock('@/lib/apiClient', () => ({
    apiRequest: jest.fn(),
}));

jest.mock('../../eventRegistrationCommands', () => ({
    loadRequiredEventSignLinks: jest.fn(),
}));

jest.mock('../useSigningStatusPoll', () => ({
    useSigningStatusPoll: jest.fn(),
}));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const mockedLoadSignLinks = loadRequiredEventSignLinks as jest.MockedFunction<
    typeof loadRequiredEventSignLinks
>;
const mockedUseSigningStatusPoll = useSigningStatusPoll as jest.MockedFunction<
    typeof useSigningStatusPoll
>;

const setWorkflowPhase = jest.fn();
const onFinalize = jest.fn();
const user = { $id: 'user_1' } as UserData;
const event = {
    $id: 'event_1',
    requiredTemplateIds: ['template_1'],
} as Event;
const signStep = {
    templateId: 'template_1',
    documentId: 'document_1',
    type: 'PDF',
    signerContext: 'participant',
} as SignStep;

function useSigningHarness(activeEvent: Event) {
    const [joining, setJoining] = useState(true);
    const [joiningChildFreeAgent, setJoiningChildFreeAgent] = useState(true);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const signing = useEventSigningController({
        event: activeEvent,
        user,
        userEmail: 'player@test.com',
        signingOpened: true,
        timeoutMs: 5_000,
        onFinalize,
        setWorkflowPhase,
        setJoining,
        setJoiningChildFreeAgent,
        setJoinError,
        setJoinNotice,
    });
    return {
        signing,
        joining,
        joiningChildFreeAgent,
        joinError,
        joinNotice,
    };
}

describe('useEventSigningController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedUseSigningStatusPoll.mockImplementation(() => undefined);
        mockedLoadSignLinks.mockResolvedValue([signStep]);
        mockedApiRequest.mockResolvedValue({ ok: true });
    });

    it('skips signing when the event has no required templates', async () => {
        const { result } = renderHook(() => useSigningHarness({
            ...event,
            requiredTemplateIds: [],
        } as Event));

        await act(async () => {
            await expect(result.current.signing.beginSigningFlow({ mode: 'user' })).resolves.toBe(false);
        });
        expect(mockedLoadSignLinks).not.toHaveBeenCalled();
        expect(setWorkflowPhase).not.toHaveBeenCalled();
    });

    it('loads required links and opens password confirmation for one intent', async () => {
        const intent = { mode: 'team' as const, team: { $id: 'team_1' } };
        const { result } = renderHook(() => useSigningHarness(event));

        await act(async () => {
            await expect(result.current.signing.beginSigningFlow(intent)).resolves.toBe(true);
        });

        expect(mockedLoadSignLinks).toHaveBeenCalledWith(expect.objectContaining({
            intent,
            event,
            user,
            userEmail: 'player@test.com',
            timeoutMs: 5_000,
        }));
        expect(result.current.signing.signLinks).toEqual([signStep]);
        expect(setWorkflowPhase).toHaveBeenLastCalledWith('password', true);
    });

    it('requires a password before calling the confirmation API', async () => {
        const { result } = renderHook(() => useSigningHarness(event));
        await act(async () => {
            await result.current.signing.beginSigningFlow({ mode: 'user' });
        });

        await act(async () => {
            await result.current.signing.confirmPasswordAndStartSigning();
        });

        expect(result.current.signing.passwordError).toBe('Password is required.');
        expect(mockedApiRequest).not.toHaveBeenCalled();
    });

    it('confirms the password and advances to the signing phase', async () => {
        const { result } = renderHook(() => useSigningHarness(event));
        await act(async () => {
            await result.current.signing.beginSigningFlow({ mode: 'user' });
        });
        act(() => result.current.signing.setPassword('swordfish'));

        await act(async () => {
            await result.current.signing.confirmPasswordAndStartSigning();
        });

        expect(mockedApiRequest).toHaveBeenCalledWith('/api/documents/confirm-password', {
            method: 'POST',
            timeoutMs: 5_000,
            body: {
                email: 'player@test.com',
                password: 'swordfish',
                eventId: 'event_1',
            },
        });
        expect(setWorkflowPhase).toHaveBeenCalledWith('password', false);
        expect(setWorkflowPhase).toHaveBeenCalledWith('signing', true);
        expect(result.current.signing.password).toBe('');
        expect(result.current.signing.confirmingPassword).toBe(false);
    });

    it('finalizes the pending intent after the last signing poll confirms', async () => {
        const intent = { mode: 'user' as const };
        const { result } = renderHook(() => useSigningHarness(event));
        await act(async () => {
            await result.current.signing.beginSigningFlow(intent);
        });
        const pollOptions = mockedUseSigningStatusPoll.mock.calls.at(-1)?.[0];
        expect(pollOptions).toBeDefined();

        await act(async () => {
            await pollOptions?.onConfirmed();
        });

        expect(onFinalize).toHaveBeenCalledWith(intent);
        expect(result.current.signing.signLinks).toEqual([]);
        expect(result.current.joining).toBe(false);
        expect(result.current.joiningChildFreeAgent).toBe(false);
    });

    it('cancels and resets both password and signing state', async () => {
        const { result } = renderHook(() => useSigningHarness(event));
        await act(async () => {
            await result.current.signing.beginSigningFlow({ mode: 'user' });
        });
        act(() => result.current.signing.setPassword('secret'));

        act(() => result.current.signing.cancelSigning());

        expect(result.current.signing.signLinks).toEqual([]);
        expect(result.current.signing.password).toBe('');
        expect(result.current.joinError).toBe('Signature process canceled.');
        expect(result.current.joining).toBe(false);
        expect(setWorkflowPhase).toHaveBeenCalledWith('signing', false);
        expect(setWorkflowPhase).toHaveBeenCalledWith('password', false);
    });
});
