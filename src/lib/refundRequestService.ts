import { databases } from '@/app/appwrite';
import type { RefundRequest } from '@/types';
import { Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const REFUND_REQUESTS_TABLE_ID =
  process.env.NEXT_PUBLIC_APPWRITE_REFUND_REQUESTS_TABLE_ID ?? 'refundRequests';

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
    const queries = [Query.orderDesc('$createdAt'), Query.limit(100)];
    const filterQueries: string[] = [];

    if (filters.organizationId) {
      filterQueries.push(Query.equal('organizationId', filters.organizationId));
    }
    if (filters.userId) {
      filterQueries.push(Query.equal('userId', filters.userId));
    }
    if (filters.hostId) {
      filterQueries.push(Query.equal('hostId', filters.hostId));
    }

    if (filterQueries.length === 1) {
      queries.push(filterQueries[0]);
    } else if (filterQueries.length > 1) {
      queries.push(Query.or(filterQueries));
    }

    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: REFUND_REQUESTS_TABLE_ID,
      queries,
    });

    const rows = Array.isArray(response.rows) ? response.rows : [];
    return rows.map((row) => this.mapRowToRefundRequest(row)).filter((row) => row.eventId && row.userId);
  }

  async updateRefundStatus(refundId: string, status: 'WAITING' | 'APPROVED' | 'REJECTED'): Promise<RefundRequest> {
    const response = await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: REFUND_REQUESTS_TABLE_ID,
      rowId: refundId,
      data: { status },
    });

    return this.mapRowToRefundRequest(response);
  }
}

export const refundRequestService = new RefundRequestService();
