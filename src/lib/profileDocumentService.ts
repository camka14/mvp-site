import { apiRequest } from '@/lib/apiClient';
import type { SignerContext } from '@/lib/templateSignerTypes';

export type ProfileDocumentCard = {
  id: string;
  status: 'UNSIGNED' | 'SIGNED';
  eventId?: string;
  eventName?: string;
  teamId?: string;
  teamName?: string;
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
  childName?: string;
  childEmail?: string;
  consentStatus?: string;
  requiresChildEmail?: boolean;
  statusNote?: string;
  signedAt?: string;
  signedDocumentRecordId?: string;
  viewUrl?: string;
  content?: string;
};

export type ChildUnsignedDocumentCount = {
  childUserId: string;
  unsignedCount: number;
};

type ProfileDocumentsResponse = {
  unsigned?: ProfileDocumentCard[];
  signed?: ProfileDocumentCard[];
  childUnsignedCounts?: ChildUnsignedDocumentCount[];
  error?: string;
};

class ProfileDocumentService {
  async listDocuments(): Promise<{
    unsigned: ProfileDocumentCard[];
    signed: ProfileDocumentCard[];
    childUnsignedCounts: ChildUnsignedDocumentCount[];
  }> {
    const response = await apiRequest<ProfileDocumentsResponse>('/api/profile/documents', {
      method: 'GET',
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    return {
      unsigned: Array.isArray(response?.unsigned) ? response.unsigned : [],
      signed: Array.isArray(response?.signed) ? response.signed : [],
      childUnsignedCounts: Array.isArray(response?.childUnsignedCounts) ? response.childUnsignedCounts : [],
    };
  }
}

export const profileDocumentService = new ProfileDocumentService();
