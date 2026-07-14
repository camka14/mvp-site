import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { apiRequest } from '@/lib/apiClient';
import type { SignStep } from '@/lib/boldsignService';
import { createId } from '@/lib/id';
import type { Event, UserData } from '@/types';

import {
    loadRequiredEventSignLinks,
    type JoinIntent,
} from '../eventRegistrationCommands';
import type { RegistrationWorkflowPhase } from '../registrationWorkflow';
import { useSigningStatusPoll } from './useSigningStatusPoll';

type SetWorkflowPhase = (
    phase: Exclude<RegistrationWorkflowPhase, 'idle'>,
    opened: boolean,
) => void;

type UseEventSigningControllerArgs = {
    event: Event | null;
    user: UserData | null | undefined;
    userEmail?: string | null;
    signingOpened: boolean;
    timeoutMs: number;
    onFinalize: (intent: JoinIntent) => void | Promise<void>;
    setWorkflowPhase: SetWorkflowPhase;
    setJoining: Dispatch<SetStateAction<boolean>>;
    setJoiningChildFreeAgent: Dispatch<SetStateAction<boolean>>;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setJoinNotice: Dispatch<SetStateAction<string | null>>;
};

export function useEventSigningController({
    event,
    user,
    userEmail,
    signingOpened,
    timeoutMs,
    onFinalize,
    setWorkflowPhase,
    setJoining,
    setJoiningChildFreeAgent,
    setJoinError,
    setJoinNotice,
}: UseEventSigningControllerArgs) {
    const [signLinks, setSignLinks] = useState<SignStep[]>([]);
    const [currentSignIndex, setCurrentSignIndex] = useState(0);
    const [pendingJoin, setPendingJoin] = useState<JoinIntent | null>(null);
    const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<string | null>(null);
    const [pendingSignatureOperationId, setPendingSignatureOperationId] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [confirmingPassword, setConfirmingPassword] = useState(false);
    const [recordingSignature, setRecordingSignature] = useState(false);
    const [textAccepted, setTextAccepted] = useState(false);

    const loadRequiredSignLinks = useCallback(async (intent: JoinIntent): Promise<SignStep[]> => (
        loadRequiredEventSignLinks({
            intent,
            event,
            user,
            userEmail,
            timeoutMs,
        })
    ), [event, timeoutMs, user, userEmail]);

    const beginSigningFlow = useCallback(async (intent: JoinIntent) => {
        if (!event || !user) {
            return false;
        }
        const requiredTemplateIds = Array.isArray(event.requiredTemplateIds)
            ? event.requiredTemplateIds
            : [];
        if (!requiredTemplateIds.length) {
            return false;
        }
        if (!userEmail) {
            throw new Error('Sign-in email is required to sign documents.');
        }
        const links = await loadRequiredSignLinks(intent);
        if (!links.length) {
            setPendingJoin(null);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setWorkflowPhase('password', false);
            return false;
        }

        setPendingJoin(intent);
        setSignLinks(links);
        setCurrentSignIndex(0);
        setPassword('');
        setPasswordError(null);
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setWorkflowPhase('password', true);
        return true;
    }, [event, loadRequiredSignLinks, setWorkflowPhase, user, userEmail]);

    const cancelPasswordConfirmation = useCallback(() => {
        setWorkflowPhase('password', false);
        setPassword('');
        setPasswordError(null);
        setPendingJoin(null);
        setJoining(false);
        setJoinError('Password confirmation canceled.');
    }, [setJoinError, setJoining, setWorkflowPhase]);

    const confirmPasswordAndStartSigning = useCallback(async () => {
        if (!pendingJoin || !event || !user || !userEmail) {
            return;
        }
        if (!password.trim()) {
            setPasswordError('Password is required.');
            return;
        }

        setConfirmingPassword(true);
        setPasswordError(null);
        setJoinError(null);
        setJoinNotice(null);
        let stage: 'confirm_password' | 'finalize_join' = 'confirm_password';
        try {
            await apiRequest<{ ok: true }>('/api/documents/confirm-password', {
                method: 'POST',
                timeoutMs,
                body: {
                    email: userEmail,
                    password,
                    eventId: event.$id,
                },
            });
            const links = signLinks.length ? signLinks : await loadRequiredSignLinks(pendingJoin);
            if (!links.length) {
                stage = 'finalize_join';
                setWorkflowPhase('password', false);
                setPassword('');
                const intent = pendingJoin;
                setPendingJoin(null);
                await onFinalize(intent);
                setJoining(false);
                setJoiningChildFreeAgent(false);
                return;
            }

            setSignLinks(links);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setWorkflowPhase('password', false);
            setPassword('');
            setWorkflowPhase('signing', true);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to confirm password.';
            if (stage === 'finalize_join') {
                setJoinError(message || 'Failed to complete registration.');
                setPendingJoin(null);
                setWorkflowPhase('password', false);
                setPassword('');
                setJoining(false);
                setJoiningChildFreeAgent(false);
                return;
            }
            setPasswordError(message);
        } finally {
            setConfirmingPassword(false);
        }
    }, [
        event,
        loadRequiredSignLinks,
        onFinalize,
        password,
        pendingJoin,
        setJoinError,
        setJoinNotice,
        setJoining,
        setJoiningChildFreeAgent,
        setWorkflowPhase,
        signLinks,
        timeoutMs,
        user,
        userEmail,
    ]);

    const recordSignature = useCallback(async (payload: {
        templateId: string;
        documentId: string;
        type: SignStep['type'];
        signerContext?: SignStep['signerContext'];
    }): Promise<{ operationId?: string; syncStatus?: string }> => {
        if (!user || !event) {
            throw new Error('User and event are required to sign documents.');
        }
        const fallbackSignerContext = pendingJoin?.mode === 'child'
            || pendingJoin?.mode === 'child_free_agent'
            || pendingJoin?.mode === 'child_waitlist'
            ? 'parent_guardian'
            : 'participant';
        const signerContext = payload.signerContext ?? fallbackSignerContext;
        const signingUserId = signerContext === 'child' && pendingJoin?.childId
            ? pendingJoin.childId
            : user.$id;
        const response = await fetch('/api/documents/record-signature', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                templateId: payload.templateId,
                documentId: payload.documentId,
                eventId: event.$id,
                type: payload.type,
                userId: signingUserId,
                childUserId: pendingJoin?.childId,
                signerContext,
                user,
            }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.error) {
            throw new Error(result?.error || 'Failed to record signature.');
        }
        return {
            operationId: typeof result?.operationId === 'string' ? result.operationId : undefined,
            syncStatus: typeof result?.syncStatus === 'string' ? result.syncStatus : undefined,
        };
    }, [event, pendingJoin?.childId, pendingJoin?.mode, user]);

    const resetAfterSignatureError = useCallback((message: string) => {
        setJoinError(message);
        setWorkflowPhase('signing', false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingJoin(null);
        setJoining(false);
    }, [setJoinError, setJoining, setWorkflowPhase]);

    const handleSignedDocument = useCallback(async (messageDocumentId?: string) => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type === 'TEXT') {
            return;
        }
        if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
            return;
        }
        if (pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
            return;
        }
        if (!currentLink.documentId) {
            setJoinError('Missing document identifier for signature.');
            return;
        }

        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            const signatureResult = await recordSignature({
                templateId: currentLink.templateId,
                documentId: currentLink.documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setWorkflowPhase('signing', false);
            setPendingSignedDocumentId(currentLink.documentId);
            setPendingSignatureOperationId(
                signatureResult.operationId || currentLink.operationId || null,
            );
        } catch (error) {
            resetAfterSignatureError(
                error instanceof Error ? error.message : 'Failed to record signature.',
            );
        } finally {
            setRecordingSignature(false);
        }
    }, [
        currentSignIndex,
        pendingSignatureOperationId,
        pendingSignedDocumentId,
        recordSignature,
        recordingSignature,
        resetAfterSignatureError,
        setJoinError,
        setJoinNotice,
        setWorkflowPhase,
        signLinks,
    ]);

    const handleTextAcceptance = useCallback(async () => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type !== 'TEXT') {
            return;
        }
        if (!textAccepted || pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
            return;
        }

        const documentId = currentLink.documentId || createId();
        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            const signatureResult = await recordSignature({
                templateId: currentLink.templateId,
                documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setWorkflowPhase('signing', false);
            setPendingSignedDocumentId(documentId);
            setPendingSignatureOperationId(
                signatureResult.operationId || currentLink.operationId || null,
            );
        } catch (error) {
            resetAfterSignatureError(
                error instanceof Error ? error.message : 'Failed to record signature.',
            );
        } finally {
            setRecordingSignature(false);
        }
    }, [
        currentSignIndex,
        pendingSignatureOperationId,
        pendingSignedDocumentId,
        recordSignature,
        recordingSignature,
        resetAfterSignatureError,
        setJoinNotice,
        setWorkflowPhase,
        signLinks,
        textAccepted,
    ]);

    useEffect(() => {
        setTextAccepted(false);
    }, [currentSignIndex, signLinks]);

    useEffect(() => {
        if (!signingOpened) {
            return;
        }
        const handleMessage = (messageEvent: MessageEvent) => {
            if (typeof messageEvent.origin === 'string' && !messageEvent.origin.includes('boldsign')) {
                return;
            }
            const payload = messageEvent.data;
            let eventName = '';
            if (typeof payload === 'string') {
                eventName = payload;
            } else if (payload && typeof payload === 'object') {
                eventName = payload.event || payload.eventName || payload.type || payload.name || '';
            }
            const eventLabel = eventName.toString();
            if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
                return;
            }
            const documentId = (
                payload
                && typeof payload === 'object'
                && (payload.documentId || payload.documentID)
            ) || undefined;
            void handleSignedDocument(typeof documentId === 'string' ? documentId : undefined);
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleSignedDocument, signingOpened]);

    const handleSigningPollConfirmed = useCallback(async () => {
        const nextIndex = currentSignIndex + 1;
        if (nextIndex < signLinks.length) {
            setCurrentSignIndex(nextIndex);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setWorkflowPhase('signing', true);
            setJoinNotice(null);
            return;
        }

        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setWorkflowPhase('signing', false);
        setJoinNotice(null);
        const intent = pendingJoin;
        setPendingJoin(null);
        if (intent) {
            await onFinalize(intent);
        }
        setJoining(false);
        setJoiningChildFreeAgent(false);
    }, [
        currentSignIndex,
        onFinalize,
        pendingJoin,
        setJoinNotice,
        setJoining,
        setJoiningChildFreeAgent,
        setWorkflowPhase,
        signLinks.length,
    ]);

    const handleSigningPollError = useCallback((message: string) => {
        setJoinError(message || 'Failed to confirm signature.');
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setWorkflowPhase('signing', false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingJoin(null);
        setJoining(false);
        setJoiningChildFreeAgent(false);
    }, [setJoinError, setJoining, setJoiningChildFreeAgent, setWorkflowPhase]);

    const pendingSigningLink = signLinks[currentSignIndex];
    const pendingSignerUserId = !user
        ? null
        : pendingSigningLink?.signerContext === 'child' && pendingJoin?.childId
            ? pendingJoin.childId
            : user.$id;
    useSigningStatusPoll({
        operationId: user ? pendingSignatureOperationId : null,
        documentId: user && !pendingSignatureOperationId ? pendingSignedDocumentId : null,
        signerUserId: pendingSignerUserId,
        scopeKey: event?.$id ?? null,
        onConfirmed: handleSigningPollConfirmed,
        onError: handleSigningPollError,
    });

    const resetSigningState = useCallback(() => {
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingJoin(null);
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setPassword('');
        setPasswordError(null);
        setConfirmingPassword(false);
        setRecordingSignature(false);
        setTextAccepted(false);
    }, []);

    const cancelSigning = useCallback(() => {
        setWorkflowPhase('signing', false);
        setWorkflowPhase('password', false);
        resetSigningState();
        setJoining(false);
        setJoinError('Signature process canceled.');
    }, [resetSigningState, setJoinError, setJoining, setWorkflowPhase]);

    return {
        signLinks,
        currentSignIndex,
        password,
        setPassword,
        passwordError,
        confirmingPassword,
        recordingSignature,
        textAccepted,
        setTextAccepted,
        beginSigningFlow,
        cancelPasswordConfirmation,
        confirmPasswordAndStartSigning,
        handleSignedDocument,
        handleTextAcceptance,
        cancelSigning,
        resetSigningState,
    };
}
