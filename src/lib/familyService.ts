import { functions } from '@/app/appwrite';
import { ExecutionMethod } from 'appwrite';

const FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!;

export type FamilyLinkStatus = 'pending' | 'active' | 'revoked' | 'inactive';

export type FamilyChild = {
  userId: string;
  firstName: string;
  lastName: string;
  age?: number;
  linkStatus?: FamilyLinkStatus;
  email?: string | null;
  hasEmail?: boolean;
};

type FamilyChildrenResponse = {
  children?: FamilyChild[];
  error?: string;
};

type CreateChildResponse = {
  childUserId?: string;
  linkId?: string;
  status?: FamilyLinkStatus;
  error?: string;
};

type LinkChildResponse = {
  linkId?: string;
  status?: FamilyLinkStatus;
  child?: FamilyChild;
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

class FamilyService {
  async listChildren(): Promise<FamilyChild[]> {
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: '/family/children',
      method: ExecutionMethod.GET,
      async: false,
    });

    const result = parseExecutionResponse<FamilyChildrenResponse>(response.responseBody);
    if (result?.error) {
      throw new Error(result.error);
    }
    return Array.isArray(result?.children) ? result.children : [];
  }

  async createChildAccount(params: {
    firstName: string;
    lastName: string;
    email?: string;
    dateOfBirth: string;
    relationship?: string;
  }): Promise<CreateChildResponse> {
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: '/family/children',
      method: ExecutionMethod.POST,
      body: JSON.stringify(params),
      async: false,
    });

    const result = parseExecutionResponse<CreateChildResponse>(response.responseBody);
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }

  async linkChildToParent(params: {
    childUserId?: string;
    childEmail?: string;
    relationship?: string;
  }): Promise<LinkChildResponse> {
    const response = await functions.createExecution({
      functionId: FUNCTION_ID,
      xpath: '/family/links',
      method: ExecutionMethod.POST,
      body: JSON.stringify(params),
      async: false,
    });

    const result = parseExecutionResponse<LinkChildResponse>(response.responseBody);
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }
}

export const familyService = new FamilyService();
