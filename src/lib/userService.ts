import { UserData, Subscription } from '@/types';

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

  async searchUsers(_query: string): Promise<UserData[]> {
    return [];
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

  async updateEmail(): Promise<void> {
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
    return { fileId, imageUrl: `/api/files/${fileId}` };
  }
}

export const userService = new UserService();
