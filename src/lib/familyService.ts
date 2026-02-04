import { apiRequest } from '@/lib/apiClient';

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

class FamilyService {
  async listChildren(): Promise<FamilyChild[]> {
    const result = await apiRequest<FamilyChildrenResponse>('/api/family/children', {
      method: 'GET',
    });
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
    const result = await apiRequest<CreateChildResponse>('/api/family/children', {
      method: 'POST',
      body: params,
    });
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
    const result = await apiRequest<LinkChildResponse>('/api/family/links', {
      method: 'POST',
      body: params,
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
  }
}

export const familyService = new FamilyService();
