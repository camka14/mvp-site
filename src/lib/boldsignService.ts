import { apiRequest } from '@/lib/apiClient';
import type { TemplateDocument, TemplateDocumentType, UserData } from '@/types';

export type SignStep = {
  templateId: string;
  type: TemplateDocumentType;
  documentId?: string;
  url?: string;
  title?: string;
  signOnce?: boolean;
  content?: string;
};

type CreateTemplateResponse = {
  createUrl?: string;
  template?: TemplateDocument;
  error?: string;
};

type SignLinksResponse = {
  signLinks?: SignStep[];
  error?: string;
};

class BoldSignService {
  async createTemplate(params: {
    organizationId: string;
    userId: string;
    title: string;
    description?: string;
    signOnce: boolean;
    type: TemplateDocumentType;
    content?: string;
  }): Promise<{ createUrl?: string; template: TemplateDocument }> {
    const result = await apiRequest<CreateTemplateResponse>(
      `/api/organizations/${params.organizationId}/templates`,
      {
        method: 'POST',
        body: {
          userId: params.userId,
          template: {
            title: params.title,
            description: params.description,
            signOnce: params.signOnce,
            type: params.type,
            content: params.content,
          },
        },
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!result?.template) {
      throw new Error('Template creation response is missing data.');
    }
    return { createUrl: result.createUrl, template: result.template };
  }

  async createSignLinks(params: {
    eventId: string;
    user: UserData;
    userEmail: string;
    redirectUrl?: string;
  }): Promise<SignStep[]> {
    const result = await apiRequest<SignLinksResponse>(
      `/api/events/${params.eventId}/sign`,
      {
        method: 'POST',
        body: {
          user: params.user,
          userId: params.user.$id,
          userEmail: params.userEmail,
          redirectUrl: params.redirectUrl,
        },
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!Array.isArray(result?.signLinks)) {
      return [];
    }
    return result.signLinks.map((link) => ({
      ...link,
      type: (link.type ?? 'PDF') as TemplateDocumentType,
    }));
  }

  async markSigned(params: {
    documentId: string;
    templateId: string;
    eventId?: string;
    user: UserData;
    userEmail?: string;
  }): Promise<void> {
    const result = await apiRequest<{ error?: string }>('/api/documents/signed', {
      method: 'POST',
      body: {
        documentId: params.documentId,
        templateId: params.templateId,
        eventId: params.eventId,
        user: params.user,
        userId: params.user.$id,
        userEmail: params.userEmail,
      },
    });
    if (result?.error) {
      throw new Error(result.error);
    }
  }
}

export const boldsignService = new BoldSignService();
