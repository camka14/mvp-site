import { Invite, UserData, Subscription } from '@/types';

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

interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  userName?: string;
  dateOfBirth?: string;
  profileImageId?: string;
}

class UserService {
  async createUser(id: string, data: Partial<UserData>): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ id, data }),
    });
    return response.user;
  }

  async getUserById(id: string): Promise<UserData | undefined> {
    try {
      const response = await apiFetch<{ user: UserData }>(`/api/users/${id}`);
      return response.user;
    } catch {
      return undefined;
    }
  }

  async getUsersByIds(ids: string[]): Promise<UserData[]> {
    if (ids.length === 0) return [];
    const results = await Promise.all(ids.map((id) => this.getUserById(id)));
    return results.filter(Boolean) as UserData[];
  }

  async searchUsers(query: string): Promise<UserData[]> {
    if (!query || query.trim().length < 2) return [];
    const params = new URLSearchParams();
    params.set('query', query.trim());
    const response = await apiFetch<{ users: UserData[] }>(`/api/users?${params.toString()}`);
    return response.users ?? [];
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
    return response.user;
  }

  async updateUser(id: string, updates: Partial<UserData>): Promise<UserData> {
    const response = await apiFetch<{ user: UserData }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: updates }),
    });
    return response.user;
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<UserData> {
    return this.updateUser(userId, data as Partial<UserData>);
  }

  async updateEmail(_email: string, _currentPassword: string): Promise<void> {
    throw new Error('Email updates are not yet supported in the self-hosted auth flow.');
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async listUserSubscriptions(_userId: string): Promise<Subscription[]> {
    return [];
  }

  async listInvites(filters: { userId?: string; type?: string; teamId?: string } = {}): Promise<Invite[]> {
    const params = new URLSearchParams();
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.type) params.set('type', filters.type);
    if (filters.teamId) params.set('teamId', filters.teamId);
    const response = await apiFetch<{ invites?: Invite[] }>(`/api/invites?${params.toString()}`);
    return response.invites ?? [];
  }

  async inviteUsersByEmail(
    inviterId: string,
    invites: Array<{ firstName: string; lastName: string; email: string; type?: string; eventId?: string; organizationId?: string; teamId?: string }>,
  ): Promise<{ sent?: Invite[]; not_sent?: Invite[]; failed?: Invite[] }> {
    const payload = {
      invites: invites.map((invite) => ({
        ...invite,
        createdBy: inviterId,
        status: 'pending',
      })),
    };
    const response = await apiFetch<{ invites?: Invite[] }>(`/api/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = response.invites ?? [];
    return { sent: created, not_sent: [], failed: [] };
  }

  async addTeamInvitation(userId: string, teamId: string): Promise<boolean> {
    // Inviting an existing user by id: UserData is public and does not include email, so the server
    // derives/stores the email from AuthUser/SensitiveUserData.
    await apiFetch('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ invites: [{ type: 'player', teamId, userId, status: 'pending' }] }),
    });
    return true;
  }

  async removeTeamInvitation(userId: string, teamId: string): Promise<boolean> {
    await apiFetch('/api/invites', {
      method: 'DELETE',
      body: JSON.stringify({ userId, teamId, type: 'player' }),
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
