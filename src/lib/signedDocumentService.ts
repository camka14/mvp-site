import { databases } from '@/app/appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const SIGNED_DOCUMENTS_TABLE_ID =
  process.env.NEXT_PUBLIC_APPWRITE_SIGNED_DOCUMENTS_TABLE_ID ?? 'signedDocuments';

class SignedDocumentService {
  async getSignedDocument(documentId: string): Promise<Record<string, any> | null> {
    try {
      const response = await databases.getRow({
        databaseId: DATABASE_ID,
        tableId: SIGNED_DOCUMENTS_TABLE_ID,
        rowId: documentId,
      });
      return response ?? null;
    } catch (error) {
      return null;
    }
  }

  async isDocumentSigned(documentId: string): Promise<boolean> {
    const row = await this.getSignedDocument(documentId);
    if (!row) {
      return false;
    }
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    return status === 'signed';
  }
}

export const signedDocumentService = new SignedDocumentService();
