import { PaymentIntent } from '@/types';
import { functions } from '@/app/appwrite';

interface CreatePurchaseIntentRequest {
    userId: string;
    eventId: string;
    teamId?: string;
    isTournament: boolean;
    command: string;
}

interface AddParticipantRequest {
    eventId: string;
    userId: string;
    teamId?: string;
    isTournament: boolean;
    command: string;
}

class PaymentService {
    async createPaymentIntent(
        eventId: string,
        userId: string,
        teamId?: string,
        isTournament: boolean = false
    ): Promise<PaymentIntent> {
        try {
            const response = await functions.createExecution({
                functionId: process.env.NEXT_PUBLIC_BILLING_FUNCTION_ID!,
                body: JSON.stringify({
                    userId,
                    eventId,
                    teamId: teamId || null,
                    isTournament,
                    command: "create_purchase_intent"
                } as CreatePurchaseIntentRequest),
                async: false
            });

            const result = JSON.parse(response.responseBody);

            if (result.error) {
                throw new Error(result.error);
            }

            return result as PaymentIntent;
        } catch (error) {
            console.error('Failed to create payment intent:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to create payment intent');
        }
    }

    async joinEvent(eventId: string, userId?: string, teamId?: string, isTournament: boolean = false): Promise<void> {
        try {
            const response = await functions.createExecution({
                functionId: process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!,
                body: JSON.stringify({
                    eventId,
                    userId,
                    teamId: teamId || null,
                    isTournament,
                    task: "editEvent",
                    command: "addParticipant"
                } as AddParticipantRequest),
                async: false
            });

            const result = JSON.parse(response.responseBody);

            if (result.error) {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to join event:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to join event');
        }
    }

    async requestRefund(eventId: string, userId: string, reason?: string): Promise<{
        success: boolean;
        message?: string;
        emailSent?: boolean;
    }> {
        try {
            const response = await functions.createExecution({
                functionId: process.env.NEXT_PUBLIC_BILLING_FUNCTION_ID!,
                body: JSON.stringify({
                    eventId,
                    userId: userId,
                    reason: reason || 'requested_by_customer',
                    command: "refund_payment"
                }),
                async: false
            });

            const result = JSON.parse(response.responseBody);
            if (result.error) {
                throw new Error(result.error);
            }

            return result;
        } catch (error) {
            console.error('Failed to request refund:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to request refund');
        }
    }
}

export const paymentService = new PaymentService();
