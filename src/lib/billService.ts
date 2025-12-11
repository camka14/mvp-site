import { databases, functions } from '@/app/appwrite';
import { Bill, BillPayment, PaymentIntent, UserData } from '@/types';
import { ExecutionMethod, Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const BILLS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_BILLS_TABLE_ID!;
const BILL_PAYMENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_BILL_PAYMENTS_TABLE_ID!;

const parseExecutionResponse = <T = unknown>(responseBody: string | null | undefined): T => {
    if (!responseBody) {
        return {} as T;
    }

    try {
        return JSON.parse(responseBody) as T;
    } catch (error) {
        throw new Error('Unable to parse Appwrite function response.');
    }
};

class BillService {
    async listBills(ownerType: 'USER' | 'TEAM', ownerId: string): Promise<Bill[]> {
        const response = await databases.listRows({
            databaseId: DATABASE_ID,
            tableId: BILLS_TABLE_ID,
            queries: [
                Query.equal('ownerType', ownerType),
                Query.equal('ownerId', ownerId),
                Query.limit(100),
                Query.orderDesc('$createdAt'),
            ],
        });

        const rows = response.rows || [];
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
        const response = await functions.createExecution({
            functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
            xpath: '/billing/bills',
            method: ExecutionMethod.POST,
            async: false,
            body: JSON.stringify({
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
            }),
        });

        const result = parseExecutionResponse<{ bill?: Bill; error?: string }>(response.responseBody);
        if (result.error) {
            throw new Error(result.error);
        }
        if (!result.bill) {
            throw new Error('Failed to create bill');
        }
        return result.bill;
    }

    async getBill(billId: string): Promise<Bill | null> {
        const response = await functions.createExecution({
            functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
            xpath: `/billing/bills/${billId}`,
            method: ExecutionMethod.GET,
            async: false,
        });
        const result = parseExecutionResponse<{ bill?: Bill; error?: string }>(response.responseBody);
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

        const response = await functions.createExecution({
            functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
            xpath: `/billing/create_billing_intent`,
            method: ExecutionMethod.POST,
            body: JSON.stringify({ billId: bill.$id, billPaymentId: nextPayment.$id, user }),
            async: false,
        });
        const result = parseExecutionResponse<PaymentIntent & { error?: string }>(response.responseBody);
        if (result.error) {
            throw new Error(result.error);
        }
        return result as PaymentIntent;
    }

    async splitBill(billId: string, playerIds: string[]): Promise<Bill[]> {
        const response = await functions.createExecution({
            functionId: process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!,
            xpath: `/billing/bills/${billId}/split`,
            method: ExecutionMethod.POST,
            body: JSON.stringify({ billId, playerIds }),
            async: false,
        });
        const result = parseExecutionResponse<{ children?: Bill[]; error?: string }>(response.responseBody);
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
                  .filter((p) => p && typeof p === 'object')
                  .map((p) => this.mapRowToBillPayment(p))
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
        const response = await databases.listRows({
            databaseId: DATABASE_ID,
            tableId: BILL_PAYMENTS_TABLE_ID,
            queries: [Query.equal('billId', billId), Query.orderAsc('sequence'), Query.limit(100)],
        });
        return (response.rows || []).map((row) => this.mapRowToBillPayment(row));
    }
}

export const billService = new BillService();
