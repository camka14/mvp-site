import { apiRequest } from '@/lib/apiClient';
import type { TemplateDocument, TemplateDocumentType, UserData } from '@/types';
import type { TemplateRequiredSignerType } from '@/types';

export type SignStep = {
  templateId: string;
  type: TemplateDocumentType;
  documentId?: string;
  url?: string;
  title?: string;
  signOnce?: boolean;
  content?: string;
  requiredSignerType?: TemplateRequiredSignerType;
  requiredSignerLabel?: string;
};

type CreateTemplateResponse = {
  createUrl?: string;
  template?: TemplateDocument;
  error?: string;
};

type TemplateEditUrlResponse = {
  editUrl?: string;
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
    requiredSignerType: TemplateRequiredSignerType;
    type: TemplateDocumentType;
    content?: string;
    file?: File;
  }): Promise<{ createUrl?: string; template: TemplateDocument }> {
    let result: CreateTemplateResponse;
    if (params.type === 'PDF') {
      if (!params.file) {
        throw new Error('PDF file is required for PDF templates.');
      }
      const form = new FormData();
      form.set('userId', params.userId);
      form.set('title', params.title);
      form.set('description', params.description ?? '');
      form.set('signOnce', String(params.signOnce));
      form.set('requiredSignerType', params.requiredSignerType);
      form.set('type', params.type);
      form.set('file', params.file);
      result = await apiRequest<CreateTemplateResponse>(
        `/api/organizations/${params.organizationId}/templates`,
        {
          method: 'POST',
          body: form,
          timeoutMs: 60_000,
        },
      );
    } else {
      result = await apiRequest<CreateTemplateResponse>(
        `/api/organizations/${params.organizationId}/templates`,
        {
          method: 'POST',
          body: {
            userId: params.userId,
            template: {
              title: params.title,
              description: params.description,
              signOnce: params.signOnce,
              requiredSignerType: params.requiredSignerType,
              type: params.type,
              content: params.content,
            },
          },
        },
      );
    }

    if (result?.error) {
      throw new Error(result.error);
    }
    if (!result?.template) {
      throw new Error('Template creation response is missing data.');
    }
    return { createUrl: result.createUrl, template: result.template };
  }

  async getTemplateEditUrl(params: {
    organizationId: string;
    templateDocumentId: string;
  }): Promise<string> {
    const result = await apiRequest<TemplateEditUrlResponse>(
      `/api/organizations/${params.organizationId}/templates/${params.templateDocumentId}/edit-url`,
      {
        method: 'GET',
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!result?.editUrl) {
      throw new Error('Template edit response is missing editUrl.');
    }
    return result.editUrl;
  }

  async createSignLinks(params: {
    eventId: string;
    user: UserData;
    userEmail: string;
    redirectUrl?: string;
    signerContext?: 'participant' | 'parent_guardian' | 'child';
    childUserId?: string;
    childEmail?: string;
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
          signerContext: params.signerContext ?? 'participant',
          childUserId: params.childUserId,
          childEmail: params.childEmail,
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
