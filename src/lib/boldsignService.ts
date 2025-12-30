import { functions } from '@/app/appwrite';
import { ExecutionMethod } from 'appwrite';
import type { TemplateDocument, TemplateDocumentType, UserData } from '@/types';

const FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!;

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

const parseExecutionResponse = <T = unknown>(
  responseBody: string | null | undefined,
): T => {
  if (!responseBody) {
    return {} as T;
  }
  try {
    return JSON.parse(responseBody) as T;
  } catch (error) {
    throw new Error('Unable to parse Appwrite function response.');
  }
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
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: `/organizations/${params.organizationId}/templates`,
      method: ExecutionMethod.POST,
      body: JSON.stringify({
        userId: params.userId,
        template: {
          title: params.title,
          description: params.description,
          signOnce: params.signOnce,
          type: params.type,
          content: params.content,
        },
      }),
      async: false,
    });

    const result = parseExecutionResponse<CreateTemplateResponse>(
      response.responseBody,
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
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: `/events/${params.eventId}/sign`,
      method: ExecutionMethod.POST,
      body: JSON.stringify({
        user: params.user,
        userId: params.user.$id,
        userEmail: params.userEmail,
        redirectUrl: params.redirectUrl,
      }),
      async: false,
    });

    const result = parseExecutionResponse<SignLinksResponse>(
      response.responseBody,
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
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: '/documents/signed',
      method: ExecutionMethod.POST,
      body: JSON.stringify({
        documentId: params.documentId,
        templateId: params.templateId,
        eventId: params.eventId,
        user: params.user,
        userId: params.user.$id,
        userEmail: params.userEmail,
      }),
      async: false,
    });

    const result = parseExecutionResponse<{ error?: string }>(
      response.responseBody,
    );
    if (result?.error) {
      throw new Error(result.error);
    }
  }
}

export const boldsignService = new BoldSignService();
