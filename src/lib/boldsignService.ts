import { functions } from '@/app/appwrite';
import { ExecutionMethod } from 'appwrite';
import type { TemplateDocument, UserData } from '@/types';

const FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!;

export type BoldSignLink = {
  templateId: string;
  documentId: string;
  url: string;
  title?: string;
  signOnce?: boolean;
};

type TemplateListResponse = {
  templates?: TemplateDocument[];
  error?: string;
};

type CreateTemplateResponse = {
  createUrl?: string;
  template?: TemplateDocument;
  error?: string;
};

type SignLinksResponse = {
  signLinks?: BoldSignLink[];
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
  async listTemplates(
    organizationId: string,
    userId?: string,
  ): Promise<TemplateDocument[]> {
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: `/organizations/${organizationId}/templates`,
      method: ExecutionMethod.GET,
      body: JSON.stringify({ userId }),
      async: false,
    });

    const result = parseExecutionResponse<TemplateListResponse>(
      response.responseBody,
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    return Array.isArray(result?.templates) ? result.templates : [];
  }

  async createTemplate(params: {
    organizationId: string;
    userId: string;
    title: string;
    description?: string;
    signOnce: boolean;
  }): Promise<{ createUrl: string; template: TemplateDocument }> {
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
    if (!result?.createUrl || !result?.template) {
      throw new Error('Template creation response is missing data.');
    }
    return { createUrl: result.createUrl, template: result.template };
  }

  async createSignLinks(params: {
    eventId: string;
    user: UserData;
    userEmail: string;
    redirectUrl?: string;
  }): Promise<BoldSignLink[]> {
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
    return Array.isArray(result?.signLinks) ? result.signLinks : [];
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
