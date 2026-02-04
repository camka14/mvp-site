import { apiRequest } from '@/lib/apiClient';
import type { RefundRequest } from '@/types';

type RefundRequestFilters = {
  organizationId?: string;
  userId?: string;
  hostId?: string;
};

class RefundRequestService {
  private mapRowToRefundRequest(row: Record<string, any>): RefundRequest {
    return {
      $id: row.$id,
      eventId: row.eventId ?? '',
      userId: row.userId ?? '',
      hostId: row.hostId ?? undefined,
      organizationId: row.organizationId ?? undefined,
      reason: row.reason ?? '',
      status: row.status ?? 'WAITING',
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

  async updateRefundStatus(refundId: string, status: 'WAITING' | 'APPROVED' | 'REJECTED'): Promise<RefundRequest> {
    const response = await apiRequest<any>(`/api/refund-requests/${refundId}`, {
      method: 'PATCH',
      body: { status },
    });

    return this.mapRowToRefundRequest(response);
  }
}

export const refundRequestService = new RefundRequestService();
