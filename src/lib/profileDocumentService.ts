import { apiRequest } from '@/lib/apiClient';
import type { SignerContext } from '@/lib/templateSignerTypes';

export type ProfileDocumentCard = {
  id: string;
  status: 'UNSIGNED' | 'SIGNED';
  eventId?: string;
  eventName?: string;
  organizationId?: string;
  organizationName: string;
  templateId: string;
  title: string;
  type: 'PDF' | 'TEXT';
  requiredSignerType: string;
  requiredSignerLabel: string;
  signerContext: SignerContext;
  signerContextLabel: string;
  childUserId?: string;
  childEmail?: string;
  consentStatus?: string;
  requiresChildEmail?: boolean;
  statusNote?: string;
  signedAt?: string;
  signedDocumentRecordId?: string;
  viewUrl?: string;
  content?: string;
};

type ProfileDocumentsResponse = {
  unsigned?: ProfileDocumentCard[];
  signed?: ProfileDocumentCard[];
  error?: string;
};

class ProfileDocumentService {
  async listDocuments(): Promise<{ unsigned: ProfileDocumentCard[]; signed: ProfileDocumentCard[] }> {
    const response = await apiRequest<ProfileDocumentsResponse>('/api/profile/documents', {
      method: 'GET',
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    return {
      unsigned: Array.isArray(response?.unsigned) ? response.unsigned : [],
      signed: Array.isArray(response?.signed) ? response.signed : [],
    };
  }
}

export const profileDocumentService = new ProfileDocumentService();
