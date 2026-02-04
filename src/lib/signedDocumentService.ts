import { apiRequest } from '@/lib/apiClient';

class SignedDocumentService {
  async getSignedDocument(
    documentId: string,
    userId?: string,
  ): Promise<Record<string, any> | null> {
    try {
      const params = new URLSearchParams();
      params.set('documentId', documentId);
      if (userId) {
        params.set('userId', userId);
      }
      const response = await apiRequest<{ signedDocuments?: any[] }>(`/api/documents/signed?${params.toString()}`);
      const rows = Array.isArray(response.signedDocuments) ? response.signedDocuments : [];
      return (rows[0] as Record<string, any>) ?? null;
    } catch (error) {
      return null;
    }
  }

  async isDocumentSigned(documentId: string, userId?: string): Promise<boolean> {
    const row = await this.getSignedDocument(documentId, userId);
    if (!row) {
      return false;
    }
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    return status === 'signed';
  }
}

export const signedDocumentService = new SignedDocumentService();
