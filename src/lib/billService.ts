import { apiRequest } from '@/lib/apiClient';
import { Bill, BillPayment, PaymentIntent, UserData } from '@/types';

class BillService {
    async listBills(ownerType: 'USER' | 'TEAM', ownerId: string): Promise<Bill[]> {
        const params = new URLSearchParams();
        params.set('ownerType', ownerType);
        params.set('ownerId', ownerId);
        params.set('limit', '100');
        const response = await apiRequest<{ bills?: any[] }>(`/api/billing/bills?${params.toString()}`);

        const rows = response.bills || [];
        const billsWithPayments = await Promise.all(
            rows.map(async (row) => {
                const payments = await this.fetchBillPayments(row.$id ?? row.id);
                return this.mapRowToBill({ ...row, payments });
            }),
        );

        return billsWithPayments;
    }

    async createBill(params: {
        ownerType: 'USER' | 'TEAM';
        ownerId: string;
        totalAmountCents: number;
        eventId?: string | null;
        organizationId?: string | null;
        installmentAmounts?: number[];
        installmentDueDates?: string[];
        allowSplit?: boolean;
        paymentPlanEnabled?: boolean;
        event?: any;
        user?: any;
    }): Promise<Bill> {
        const result = await apiRequest<{ bill?: Bill; error?: string }>('/api/billing/bills', {
            method: 'POST',
            body: {
                ownerType: params.ownerType,
                ownerId: params.ownerId,
                totalAmountCents: params.totalAmountCents,
                eventId: params.eventId,
                organizationId: params.organizationId,
                installmentAmounts: params.installmentAmounts,
                installmentDueDates: params.installmentDueDates,
                allowSplit: params.allowSplit,
                paymentPlanEnabled: params.paymentPlanEnabled,
                event: params.event,
                user: params.user,
            },
        });
        if (result.error) {
            throw new Error(result.error);
        }
        if (!result.bill) {
            throw new Error('Failed to create bill');
        }
        return result.bill;
    }

    async getBill(billId: string): Promise<Bill | null> {
        const result = await apiRequest<{ bill?: Bill; error?: string }>(`/api/billing/bills/${billId}`);
        if (result.error) {
            throw new Error(result.error);
        }
        const bill = result.bill ?? null;
        if (!bill) return null;
        const payments = await this.fetchBillPayments(bill.$id);
        return { ...bill, payments };
    }

    async payBill(bill: Bill, user: UserData): Promise<PaymentIntent> {
        let payments: BillPayment[] = bill.payments ?? [];
        if (!payments.length) {
            payments = await this.fetchBillPayments(bill.$id);
        }
        const nextPayment = payments.sort((a, b) => a.sequence - b.sequence).find((p) => p.status === 'PENDING');
        if (!nextPayment) {
            throw new Error('Bill has no pending installments');
        }

        const result = await apiRequest<PaymentIntent & { error?: string }>('/api/billing/create_billing_intent', {
            method: 'POST',
            body: { billId: bill.$id, billPaymentId: nextPayment.$id, user },
        });
        if (result.error) {
            throw new Error(result.error);
        }
        return result as PaymentIntent;
    }

    async splitBill(billId: string, playerIds: string[]): Promise<Bill[]> {
        const result = await apiRequest<{ children?: Bill[]; error?: string }>(`/api/billing/bills/${billId}/split`, {
            method: 'POST',
            body: { billId, playerIds },
        });
        if (result.error) {
            throw new Error(result.error);
        }
        return result.children ?? [];
    }

    private mapRowToBill(row: any): Bill {
        const toNumber = (value: any, fallback = 0) => {
            const num = typeof value === 'number' ? value : Number(value ?? fallback);
            return Number.isFinite(num) ? num : fallback;
        };

        const toOptionalNumber = (value: any) => {
            if (value === null || value === undefined) return null;
            const num = typeof value === 'number' ? value : Number(value);
            return Number.isFinite(num) ? num : null;
        };

        const payments: BillPayment[] = Array.isArray(row.payments)
            ? row.payments
                  .filter((p: any) => p && typeof p === 'object')
                  .map((p: any) => this.mapRowToBillPayment(p))
            : [];

        return {
            $id: row.$id,
            ownerType: row.ownerType,
            ownerId: row.ownerId,
            organizationId: row.organizationId ?? null,
            eventId: row.eventId ?? null,
            totalAmountCents: toNumber(row.totalAmountCents),
            paidAmountCents: toNumber(row.paidAmountCents),
            nextPaymentDue: row.nextPaymentDue ?? null,
            nextPaymentAmountCents: toOptionalNumber(row.nextPaymentAmountCents),
            parentBillId: row.parentBillId ?? null,
            allowSplit: Boolean(row.allowSplit),
            status: row.status ?? 'OPEN',
            paymentPlanEnabled: Boolean(row.paymentPlanEnabled),
            createdBy: row.createdBy ?? null,
            payments,
        };
    }

    private mapRowToBillPayment(row: any): BillPayment {
        const toNumber = (value: any, fallback = 0) => {
            const num = typeof value === 'number' ? value : Number(value ?? fallback);
            return Number.isFinite(num) ? num : fallback;
        };

        return {
            $id: row.$id ?? row.id ?? '',
            billId: row.billId ?? '',
            sequence: toNumber(row.sequence),
            dueDate: row.dueDate ?? '',
            amountCents: toNumber(row.amountCents),
            status: row.status ?? 'PENDING',
            paidAt: row.paidAt,
            paymentIntentId: row.paymentIntentId,
            payerUserId: row.payerUserId,
        };
    }

    private async fetchBillPayments(billId?: string): Promise<BillPayment[]> {
        if (!billId) return [];
        const response = await apiRequest<{ payments?: any[] }>(`/api/billing/bills/${billId}/payments`);
        return (response.payments || []).map((row) => this.mapRowToBillPayment(row));
    }
}

export const billService = new BillService();
