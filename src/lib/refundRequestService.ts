import { apiRequest } from '@/lib/apiClient';
import type { RefundRequest } from '@/types';

type RefundRequestFilters = {
  organizationId?: string;
  userId?: string;
  hostId?: string;
};

type RefundApprovalScopeExpectation = {
  scopeVersion?: number;
  scopeHash?: string | null;
};

class RefundRequestService {
  private mapRowToRefundRequest(row: Record<string, any>): RefundRequest {
    return {
      $id: row.$id,
      eventId: row.eventId ?? '',
      userId: row.userId ?? '',
      requestedByUserId: row.requestedByUserId ?? undefined,
      hostId: row.hostId ?? undefined,
      teamId: row.teamId ?? undefined,
      organizationId: row.organizationId ?? undefined,
      reason: row.reason ?? '',
      status: row.status ?? 'WAITING',
      slotId: row.slotId ?? undefined,
      occurrenceDate: row.occurrenceDate ?? undefined,
      billIds: Array.isArray(row.billIds) ? row.billIds : [],
      paymentIds: Array.isArray(row.paymentIds) ? row.paymentIds : [],
      paymentScope: Array.isArray(row.paymentScope) ? row.paymentScope : [],
      requestedAmountCents: Number.isFinite(row.requestedAmountCents) ? row.requestedAmountCents : 0,
      currency: typeof row.currency === 'string' ? row.currency : 'usd',
      policyDecision: row.policyDecision ?? undefined,
      scopeVersion: Number.isFinite(row.scopeVersion) ? row.scopeVersion : 1,
      scopeHash: row.scopeHash ?? undefined,
      approvalPreview: row.approvalPreview ?? undefined,
      $createdAt: row.$createdAt,
      $updatedAt: row.$updatedAt,
    };
  }

  async listRefundRequests(filters: RefundRequestFilters = {}): Promise<RefundRequest[]> {
    const params = new URLSearchParams();
    if (filters.organizationId) {
      params.set('organizationId', filters.organizationId);
    }
    if (filters.userId) {
      params.set('userId', filters.userId);
    }
    if (filters.hostId) {
      params.set('hostId', filters.hostId);
    }
    params.set('limit', '100');

    const response = await apiRequest<{ refunds?: any[] }>(`/api/refund-requests?${params.toString()}`);
    const rows = Array.isArray(response.refunds) ? response.refunds : [];
    return rows.map((row) => this.mapRowToRefundRequest(row)).filter((row) => row.eventId && row.userId);
  }

  async updateRefundStatus(
    refundId: string,
    status: 'WAITING' | 'APPROVED' | 'REJECTED',
    approvalScope?: RefundApprovalScopeExpectation,
  ): Promise<RefundRequest> {
    const expectedScopeVersion = Number(approvalScope?.scopeVersion);
    const expectedScopeHash = typeof approvalScope?.scopeHash === 'string'
      ? approvalScope.scopeHash.trim()
      : '';
    if (
      status === 'APPROVED'
      && (!Number.isInteger(expectedScopeVersion) || expectedScopeVersion <= 0 || !expectedScopeHash)
    ) {
      throw new Error('This refund request needs a current approval preview before it can be approved. Reload and review it first.');
    }

    const response = await apiRequest<any>(`/api/refund-requests/${refundId}`, {
      method: 'PATCH',
      body: status === 'APPROVED'
        ? { status, expectedScopeVersion, expectedScopeHash }
        : { status },
    });

    return this.mapRowToRefundRequest(response);
  }
}

export const refundRequestService = new RefundRequestService();
