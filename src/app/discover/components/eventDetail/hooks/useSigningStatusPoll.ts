import { useEffect, useRef } from 'react';

import { boldsignService } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';

type UseSigningStatusPollOptions = {
    operationId?: string | null;
    documentId?: string | null;
    signerUserId?: string | null;
    scopeKey?: string | null;
    onConfirmed: () => void | Promise<void>;
    onError: (message: string) => void;
    operationIntervalMs?: number;
    documentIntervalMs?: number;
    operationTimeoutMs?: number;
};

export function useSigningStatusPoll({
    operationId,
    documentId,
    signerUserId,
    scopeKey,
    onConfirmed,
    onError,
    operationIntervalMs = 1_500,
    documentIntervalMs = 1_000,
    operationTimeoutMs = 90_000,
}: UseSigningStatusPollOptions) {
    const targetScopeRef = useRef<{ targetId: string; scopeKey: string | null | undefined } | null>(null);

    useEffect(() => {
        const usesOperation = Boolean(operationId);
        const usesDocument = !usesOperation && Boolean(documentId && signerUserId);
        if (!usesOperation && !usesDocument) {
            targetScopeRef.current = null;
            return undefined;
        }
        const targetId = operationId ?? documentId!;
        if (
            targetScopeRef.current?.targetId === targetId
            && targetScopeRef.current.scopeKey !== scopeKey
        ) {
            return undefined;
        }
        targetScopeRef.current = { targetId, scopeKey };

        let cancelled = false;
        let settled = false;
        let inFlight = false;
        let intervalId: number | undefined;
        const startedAt = Date.now();

        const clearPollInterval = () => {
            if (intervalId !== undefined) {
                window.clearInterval(intervalId);
                intervalId = undefined;
            }
        };

        const poll = async () => {
            if (cancelled || settled || inFlight) {
                return;
            }
            inFlight = true;
            try {
                if (operationId) {
                    const operation = await boldsignService.getOperationStatus(operationId);
                    if (cancelled || settled) {
                        return;
                    }
                    const status = String(operation.status ?? '').toUpperCase();
                    if (status === 'CONFIRMED') {
                        settled = true;
                        clearPollInterval();
                        await onConfirmed();
                        return;
                    }
                    if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
                        throw new Error(operation.error || 'Failed to synchronize signature status.');
                    }
                    if (Date.now() - startedAt > operationTimeoutMs) {
                        throw new Error('Signature sync is delayed. Please try again shortly.');
                    }
                    return;
                }

                const signed = await signedDocumentService.isDocumentSigned(documentId!, signerUserId!);
                if (!signed || cancelled || settled) {
                    return;
                }
                settled = true;
                clearPollInterval();
                await onConfirmed();
            } catch (error) {
                if (cancelled) {
                    return;
                }
                settled = true;
                clearPollInterval();
                onError(error instanceof Error ? error.message : 'Failed to confirm signature.');
            } finally {
                inFlight = false;
            }
        };

        intervalId = window.setInterval(
            () => { void poll(); },
            operationId ? operationIntervalMs : documentIntervalMs,
        );
        void poll();

        return () => {
            cancelled = true;
            clearPollInterval();
        };
    }, [
        documentId,
        documentIntervalMs,
        onConfirmed,
        onError,
        operationId,
        operationIntervalMs,
        operationTimeoutMs,
        scopeKey,
        signerUserId,
    ]);
}
