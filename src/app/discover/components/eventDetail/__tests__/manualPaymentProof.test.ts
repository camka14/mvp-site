import { apiRequest } from '@/lib/apiClient';
import { billService } from '@/lib/billService';
import type { Bill, Event } from '@/types';

import {
    getNextManualBillPayment,
    submitManualPaymentProof,
} from '../manualPaymentProof';

jest.mock('@/lib/apiClient', () => ({
    apiRequest: jest.fn(),
}));

jest.mock('@/lib/billService', () => ({
    billService: {
        submitManualPaymentProof: jest.fn(),
    },
}));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const mockedSubmitManualPaymentProof = billService.submitManualPaymentProof as jest.MockedFunction<
    typeof billService.submitManualPaymentProof
>;

const bill = {
    $id: 'bill_1',
    payments: [
        { $id: 'payment_2', sequence: 2, status: 'PENDING', amountCents: 750 },
        { $id: 'payment_paid', sequence: 0, status: 'PAID', amountCents: 250 },
        { $id: 'payment_1', sequence: 1, status: 'PENDING', amountCents: 500 },
    ],
} as unknown as Bill;

describe('manual payment proof commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('selects the earliest unpaid, non-void bill payment', () => {
        expect(getNextManualBillPayment(bill)?.$id).toBe('payment_1');
    });

    it('rejects a bill without a pending payment before uploading', async () => {
        await expect(submitManualPaymentProof({
            event: null,
            bill: { $id: 'bill_1', payments: [] } as unknown as Bill,
            proofFile: new File(['proof'], 'proof.png', { type: 'image/png' }),
        })).rejects.toThrow('No pending bill payment was found');
        expect(mockedApiRequest).not.toHaveBeenCalled();
    });

    it('uploads the proof and submits the canonical file and payment ids', async () => {
        mockedApiRequest.mockResolvedValue({ file: { id: 'file_1' } });
        mockedSubmitManualPaymentProof.mockResolvedValue(undefined);

        await submitManualPaymentProof({
            event: { organizationId: 'org_1' } as Event,
            bill,
            proofFile: new File(['proof'], 'proof.png', { type: 'image/png' }),
        });

        expect(mockedApiRequest).toHaveBeenCalledWith('/api/files/upload', expect.objectContaining({
            method: 'POST',
            body: expect.any(FormData),
        }));
        const request = mockedApiRequest.mock.calls[0]?.[1];
        const formData = request?.body as FormData;
        expect(formData.get('organizationId')).toBe('org_1');
        expect((formData.get('file') as File).name).toBe('proof.png');
        expect(mockedSubmitManualPaymentProof).toHaveBeenCalledWith({
            billId: 'bill_1',
            billPaymentId: 'payment_1',
            fileId: 'file_1',
        });
    });

    it('rejects an upload response without a canonical file id', async () => {
        mockedApiRequest.mockResolvedValue({ file: {} });

        await expect(submitManualPaymentProof({
            event: null,
            bill,
            proofFile: new File(['proof'], 'proof.png', { type: 'image/png' }),
        })).rejects.toThrow('Proof image upload failed.');
        expect(mockedSubmitManualPaymentProof).not.toHaveBeenCalled();
    });
});
