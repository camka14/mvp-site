import { apiRequest } from '@/lib/apiClient';
import { billService } from '@/lib/billService';
import type { Bill, BillPayment, Event } from '@/types';

export function getNextManualBillPayment(bill: Bill | null): BillPayment | null {
    const payments = (bill?.payments ?? [])
        .filter((payment) => payment.status !== 'PAID' && payment.status !== 'VOID')
        .sort((left, right) => left.sequence - right.sequence);
    return payments[0] ?? null;
}

export async function submitManualPaymentProof({
    event,
    bill,
    proofFile,
}: {
    event: Event | null;
    bill: Bill | null;
    proofFile: File;
}): Promise<void> {
    const payment = getNextManualBillPayment(bill);
    if (!bill?.$id || !payment?.$id) {
        throw new Error('No pending bill payment was found for this registration.');
    }

    const formData = new FormData();
    formData.append('file', proofFile);
    if (event?.organizationId) {
        formData.append('organizationId', event.organizationId);
    }

    const upload = await apiRequest<{ file?: { id?: string } }>('/api/files/upload', {
        method: 'POST',
        body: formData,
    });
    const fileId = upload.file?.id;
    if (!fileId) {
        throw new Error('Proof image upload failed.');
    }

    await billService.submitManualPaymentProof({
        billId: bill.$id,
        billPaymentId: payment.$id,
        fileId,
    });
}
