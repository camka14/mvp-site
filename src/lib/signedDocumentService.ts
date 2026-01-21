import { Query } from 'appwrite';
import { databases } from '@/app/appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const SIGNED_DOCUMENTS_TABLE_ID =
  process.env.NEXT_PUBLIC_APPWRITE_SIGNED_DOCUMENTS_TABLE_ID ?? 'signedDocuments';

class SignedDocumentService {
  async getSignedDocument(
    documentId: string,
    userId?: string,
  ): Promise<Record<string, any> | null> {
    try {
      const response = await databases.getRow({
        databaseId: DATABASE_ID,
        tableId: SIGNED_DOCUMENTS_TABLE_ID,
        rowId: documentId,
      });
      if (response) {
        return response as Record<string, any>;
      }
    } catch (error) {
      // Fall back to a lookup by signedDocumentId for multi-signer records.
    }

    try {
      const queries = [Query.equal('signedDocumentId', documentId), Query.limit(1)];
      if (userId) {
        queries.unshift(Query.equal('userId', userId));
      }
      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: SIGNED_DOCUMENTS_TABLE_ID,
        queries,
      });
      const rows = Array.isArray(response.rows) ? response.rows : [];
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
