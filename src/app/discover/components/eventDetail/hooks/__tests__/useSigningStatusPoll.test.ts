import { renderHook, waitFor } from '@testing-library/react';

jest.mock('@/lib/boldsignService', () => ({
    boldsignService: {
        getOperationStatus: jest.fn(),
    },
}));

jest.mock('@/lib/signedDocumentService', () => ({
    signedDocumentService: {
        isDocumentSigned: jest.fn(),
    },
}));

import { boldsignService } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import { useSigningStatusPoll } from '../useSigningStatusPoll';

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe('useSigningStatusPoll', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('confirms a synchronized signature operation', async () => {
        const onConfirmed = jest.fn();
        const onError = jest.fn();
        (boldsignService.getOperationStatus as jest.Mock).mockResolvedValue({ status: 'CONFIRMED' });

        renderHook(() => useSigningStatusPoll({
            operationId: 'operation_1',
            onConfirmed,
            onError,
        }));

        await waitFor(() => {
            expect(onConfirmed).toHaveBeenCalledTimes(1);
        });
        expect(boldsignService.getOperationStatus).toHaveBeenCalledWith('operation_1');
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports terminal operation failures once', async () => {
        const onConfirmed = jest.fn();
        const onError = jest.fn();
        (boldsignService.getOperationStatus as jest.Mock).mockResolvedValue({
            status: 'FAILED_RETRYABLE',
            error: 'Signature synchronization failed.',
        });

        renderHook(() => useSigningStatusPoll({
            operationId: 'operation_failed',
            onConfirmed,
            onError,
        }));

        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith('Signature synchronization failed.');
        });
        expect(onConfirmed).not.toHaveBeenCalled();
        expect(boldsignService.getOperationStatus).toHaveBeenCalledTimes(1);
    });

    it('uses the signed-document fallback when no operation id exists', async () => {
        const onConfirmed = jest.fn();
        const onError = jest.fn();
        (signedDocumentService.isDocumentSigned as jest.Mock).mockResolvedValue(true);

        renderHook(() => useSigningStatusPoll({
            documentId: 'document_1',
            signerUserId: 'user_1',
            onConfirmed,
            onError,
        }));

        await waitFor(() => {
            expect(onConfirmed).toHaveBeenCalledTimes(1);
        });
        expect(signedDocumentService.isDocumentSigned).toHaveBeenCalledWith('document_1', 'user_1');
        expect(boldsignService.getOperationStatus).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it('ignores a deferred status response after unmount and clears its interval', async () => {
        const deferredStatus = createDeferred<{ status: string }>();
        const onConfirmed = jest.fn();
        const onError = jest.fn();
        const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
        (boldsignService.getOperationStatus as jest.Mock).mockReturnValue(deferredStatus.promise);

        const { unmount } = renderHook(() => useSigningStatusPoll({
            operationId: 'operation_pending',
            onConfirmed,
            onError,
        }));
        await waitFor(() => {
            expect(boldsignService.getOperationStatus).toHaveBeenCalledTimes(1);
        });

        unmount();
        deferredStatus.resolve({ status: 'CONFIRMED' });
        await deferredStatus.promise;
        await Promise.resolve();

        expect(clearIntervalSpy).toHaveBeenCalled();
        expect(onConfirmed).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });

    it('does not restart the same signing target after its event scope changes', async () => {
        const deferredStatus = createDeferred<{ status: string }>();
        const onConfirmed = jest.fn();
        const onError = jest.fn();
        (boldsignService.getOperationStatus as jest.Mock).mockReturnValue(deferredStatus.promise);

        const { rerender } = renderHook(
            ({ scopeKey }) => useSigningStatusPoll({
                operationId: 'operation_scoped',
                scopeKey,
                onConfirmed,
                onError,
            }),
            { initialProps: { scopeKey: 'event_a' } },
        );
        await waitFor(() => {
            expect(boldsignService.getOperationStatus).toHaveBeenCalledTimes(1);
        });

        rerender({ scopeKey: 'event_b' });
        deferredStatus.resolve({ status: 'CONFIRMED' });
        await deferredStatus.promise;
        await Promise.resolve();

        expect(boldsignService.getOperationStatus).toHaveBeenCalledTimes(1);
        expect(onConfirmed).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });
});
