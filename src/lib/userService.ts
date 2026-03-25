import { Invite, StaffMemberType, UserData, Subscription } from '@/types';
import { normalizeOptionalName } from '@/lib/nameCase';

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'Request failed');
  }
  return res.json() as Promise<T>;
};

const normalizeUserDataNames = (user: UserData): UserData => ({
  ...user,
  firstName: normalizeOptionalName(user.firstName) ?? '',
  lastName: normalizeOptionalName(user.lastName) ?? '',
});

const normalizeUserDataList = (users: UserData[]): UserData[] => users.map(normalizeUserDataNames);

const normalizeInviteNames = (invite: Invite): Invite => ({
  ...invite,
  firstName: normalizeOptionalName(invite.firstName) ?? undefined,
  lastName: normalizeOptionalName(invite.lastName) ?? undefined,
});

interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  userName?: string;
  dateOfBirth?: string;
  profileImageId?: string;
}

export interface UserVisibilityContext {
  teamId?: string;
  eventId?: string;
}

export interface UserSocialGraph {
  user: UserData;
  friends: UserData[];
  following: UserData[];
  followers: UserData[];
  incomingFriendRequests: UserData[];
  outgoingFriendRequests: UserData[];
}

class UserService {
  private chunkIds(ids: string[], size: number = 100): string[][] {
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += size) {
      chunks.push(ids.slice(index, index + size));
    }
    return chunks;
  }

  async createUser(id: string, data: Partial<UserData>): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ id, data }),
    });
    return normalizeUserDataNames(response.user);
  }

  async getUserById(id: string, context: UserVisibilityContext = {}): Promise<UserData | undefined> {
    try {
      const params = new URLSearchParams();
      if (context.teamId) params.set('teamId', context.teamId);
      if (context.eventId) params.set('eventId', context.eventId);
      const query = params.toString();
      const response = await apiFetch<{ user: UserData }>(`/api/users/${id}${query ? `?${query}` : ''}`);
      return normalizeUserDataNames(response.user);
    } catch {
      return undefined;
    }
  }

  async getUsersByIds(ids: string[], context: UserVisibilityContext = {}): Promise<UserData[]> {
    if (ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
    if (!uniqueIds.length) return [];

    try {
      const responses = await Promise.all(
        this.chunkIds(uniqueIds).map((batch) => {
          const params = new URLSearchParams();
          params.set('ids', batch.join(','));
          if (context.teamId) params.set('teamId', context.teamId);
          if (context.eventId) params.set('eventId', context.eventId);
          return apiFetch<{ users?: UserData[] }>(`/api/users?${params.toString()}`);
        }),
      );

      const users = responses.flatMap((response) => response.users ?? []);
      const normalizedUsers = normalizeUserDataList(users);
      const byId = new Map(normalizedUsers.map((user) => [user.$id, user] as const));
      return uniqueIds
        .map((id) => byId.get(id))
        .filter((user): user is UserData => Boolean(user));
    } catch {
      const results = await Promise.all(uniqueIds.map((id) => this.getUserById(id, context)));
      return results.filter(Boolean) as UserData[];
    }
  }

  async searchUsers(query: string): Promise<UserData[]> {
    if (!query || query.trim().length < 2) return [];
    const params = new URLSearchParams();
    params.set('query', query.trim());
    const response = await apiFetch<{ users: UserData[] }>(`/api/users?${params.toString()}`);
    return normalizeUserDataList(response.users ?? []);
  }

  async ensureUserByEmail(email: string): Promise<UserData> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new Error('Email is required');
    }

    const response = await apiFetch<{ user: UserData }>('/api/users/ensure', {
      method: 'POST',
      body: JSON.stringify({ email: normalized }),
    });
    return normalizeUserDataNames(response.user);
  }

  async lookupEmailMembership(emails: string[], userIds: string[]): Promise<Array<{ email: string; userId: string }>> {
    const normalizedEmails = Array.from(new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ));
    const normalizedUserIds = Array.from(new Set(
      userIds
        .map((userId) => userId.trim())
        .filter((userId) => userId.length > 0),
    ));

    if (!normalizedEmails.length || !normalizedUserIds.length) {
      return [];
    }

    const response = await apiFetch<{
      matches?: Array<{ email?: string | null; userId?: string | null }>;
    }>('/api/users/email-membership', {
      method: 'POST',
      body: JSON.stringify({ emails: normalizedEmails, userIds: normalizedUserIds }),
    });

    return (response.matches ?? []).flatMap((match) => {
      const email = typeof match.email === 'string' ? match.email.trim().toLowerCase() : '';
      const userId = typeof match.userId === 'string' ? match.userId.trim() : '';
      return email && userId ? [{ email, userId }] : [];
    });
  }

  async updateUser(id: string, updates: Partial<UserData>): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: updates }),
    });
    return normalizeUserDataNames(response.user);
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<UserData> {
    return this.updateUser(userId, data as Partial<UserData>);
  }

  async updateEmail(email: string, currentPassword: string): Promise<void> {
    await apiFetch('/api/auth/email', {
      method: 'POST',
      body: JSON.stringify({ newEmail: email, currentPassword }),
    });
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async getSocialGraph(): Promise<UserSocialGraph> {
    const response = await apiFetch<{
      user: UserData;
      friends?: UserData[];
      following?: UserData[];
      followers?: UserData[];
      incomingFriendRequests?: UserData[];
      outgoingFriendRequests?: UserData[];
    }>('/api/users/social');

    return {
      user: normalizeUserDataNames(response.user),
      friends: normalizeUserDataList(response.friends ?? []),
      following: normalizeUserDataList(response.following ?? []),
      followers: normalizeUserDataList(response.followers ?? []),
      incomingFriendRequests: normalizeUserDataList(response.incomingFriendRequests ?? []),
      outgoingFriendRequests: normalizeUserDataList(response.outgoingFriendRequests ?? []),
    };
  }

  async sendFriendRequest(targetUserId: string): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>('/api/users/social/friend-requests', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    return normalizeUserDataNames(response.user);
  }

  async acceptFriendRequest(requesterUserId: string): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>(`/api/users/social/friend-requests/${encodeURIComponent(requesterUserId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return normalizeUserDataNames(response.user);
  }

  async declineFriendRequest(requesterUserId: string): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>(`/api/users/social/friend-requests/${encodeURIComponent(requesterUserId)}`, {
      method: 'DELETE',
    });
    return normalizeUserDataNames(response.user);
  }

  async removeFriend(friendUserId: string): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>(`/api/users/social/friends/${encodeURIComponent(friendUserId)}`, {
      method: 'DELETE',
    });
    return normalizeUserDataNames(response.user);
  }

  async followUser(targetUserId: string): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>('/api/users/social/following', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
    return normalizeUserDataNames(response.user);
  }

  async unfollowUser(targetUserId: string): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>(`/api/users/social/following/${encodeURIComponent(targetUserId)}`, {
      method: 'DELETE',
    });
    return normalizeUserDataNames(response.user);
  }

  async listUserSubscriptions(_userId: string): Promise<Subscription[]> {
    return [];
  }

  async listInvites(filters: { userId?: string; type?: string; types?: readonly string[]; teamId?: string } = {}): Promise<Invite[]> {
    const params = new URLSearchParams();
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.type) params.set('type', filters.type);
    if (filters.teamId) params.set('teamId', filters.teamId);
    if (filters.types && filters.types.length) {
      const dedupedTypes = Array.from(new Set(filters.types));
      const inviteLists = await Promise.all(dedupedTypes.map(async (inviteType) => {
        const typeParams = new URLSearchParams(params);
        typeParams.set('type', inviteType);
        const response = await apiFetch<{ invites?: Invite[] }>(`/api/invites?${typeParams.toString()}`);
        return response.invites ?? [];
      }));
      return inviteLists.flat().map(normalizeInviteNames);
    }
    const response = await apiFetch<{ invites?: Invite[] }>(`/api/invites?${params.toString()}`);
    return (response.invites ?? []).map(normalizeInviteNames);
  }

  async inviteUsersByEmail(
    inviterId: string,
    invites: Array<{
      firstName?: string;
      lastName?: string;
      email?: string;
      userId?: string;
      type?: string;
      staffTypes?: StaffMemberType[];
      eventId?: string;
      organizationId?: string;
      teamId?: string;
      replaceStaffTypes?: boolean;
    }>,
  ): Promise<{ sent?: Invite[]; not_sent?: Invite[]; failed?: Invite[] }> {
    const payload = {
      invites: invites.map((invite) => ({
        ...invite,
        createdBy: inviterId,
        status: 'PENDING',
      })),
    };
    const response = await apiFetch<{ invites?: Invite[] }>(`/api/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = (response.invites ?? []).map(normalizeInviteNames);
    return { sent: created, not_sent: [], failed: [] };
  }

  async addTeamInvitation(userId: string, teamId: string, _inviteType: string = 'TEAM'): Promise<boolean> {
    await apiFetch('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ invites: [{ type: 'TEAM', teamId, userId, status: 'PENDING' }] }),
    });
    return true;
  }

  async removeTeamInvitation(userId: string, teamId: string, _inviteType: string = 'TEAM'): Promise<boolean> {
    await apiFetch('/api/invites', {
      method: 'DELETE',
      body: JSON.stringify({ userId, teamId, type: 'TEAM' }),
    });
    return true;
  }

  async deleteInviteById(inviteId: string): Promise<boolean> {
    await apiFetch(`/api/invites/${encodeURIComponent(inviteId)}`, {
      method: 'DELETE',
    });
    return true;
  }

  async acceptInvite(inviteId: string): Promise<boolean> {
    await apiFetch(`/api/invites/${encodeURIComponent(inviteId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return true;
  }

  async declineInvite(inviteId: string): Promise<boolean> {
    await apiFetch(`/api/invites/${encodeURIComponent(inviteId)}/decline`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return true;
  }

  async uploadProfileImage(file: File): Promise<{ fileId: string; imageUrl: string }> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/files/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Upload failed');
    }
    const data = await res.json();
    const fileId = data?.file?.id as string;
    return { fileId, imageUrl: `/api/files/${fileId}/preview?w=320&h=320&fit=cover` };
  }
}

export const userService = new UserService();
