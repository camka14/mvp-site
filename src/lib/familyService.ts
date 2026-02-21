import { apiRequest } from '@/lib/apiClient';

export type FamilyLinkStatus = 'pending' | 'active' | 'revoked' | 'inactive';

export type FamilyChild = {
  userId: string;
  firstName: string;
  lastName: string;
  userName?: string | null;
  dateOfBirth?: string | null;
  age?: number;
  linkStatus?: FamilyLinkStatus;
  relationship?: string | null;
  email?: string | null;
  hasEmail?: boolean;
};

export type FamilyJoinRequest = {
  registrationId: string;
  eventId: string;
  eventName?: string;
  eventStart?: string | null;
  childUserId: string;
  childFirstName?: string;
  childLastName?: string;
  childFullName?: string;
  childDateOfBirth?: string | null;
  childEmail?: string | null;
  childHasEmail?: boolean;
  consentStatus?: string;
  divisionId?: string | null;
  divisionTypeId?: string | null;
  divisionTypeKey?: string | null;
  requestedAt?: string | null;
  updatedAt?: string | null;
};

type FamilyChildrenResponse = {
  children?: FamilyChild[];
  error?: string;
};
type FamilyJoinRequestsResponse = {
  requests?: FamilyJoinRequest[];
  error?: string;
};

type CreateChildResponse = {
  childUserId?: string;
  linkId?: string;
  status?: FamilyLinkStatus;
  error?: string;
};

type UpdateChildResponse = {
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

type JoinRequestActionResponse = {
  registration?: {
    id?: string;
    status?: string;
    consentStatus?: string | null;
  };
  action?: 'approved' | 'declined';
  consent?: {
    status?: string | null;
    childEmail?: string | null;
    requiresChildEmail?: boolean;
  };
  warnings?: string[];
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

  async listJoinRequests(): Promise<FamilyJoinRequest[]> {
    const result = await apiRequest<FamilyJoinRequestsResponse>('/api/family/join-requests', {
      method: 'GET',
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return Array.isArray(result?.requests) ? result.requests : [];
  }

  async resolveJoinRequest(
    registrationId: string,
    action: 'approve' | 'decline',
  ): Promise<JoinRequestActionResponse> {
    const result = await apiRequest<JoinRequestActionResponse>(`/api/family/join-requests/${encodeURIComponent(registrationId)}`, {
      method: 'PATCH',
      body: { action },
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    return result;
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

  async updateChildAccount(params: {
    childUserId: string;
    firstName: string;
    lastName: string;
    email?: string;
    dateOfBirth: string;
    relationship?: string;
  }): Promise<UpdateChildResponse> {
    const { childUserId, ...body } = params;
    const result = await apiRequest<UpdateChildResponse>(`/api/family/children/${encodeURIComponent(childUserId)}`, {
      method: 'PATCH',
      body,
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
