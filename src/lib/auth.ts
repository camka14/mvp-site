import type { UserData } from '@/types';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

const normalizeUserData = (user: UserData | null): UserData | null => {
  if (!user) return null;
  if (user.$id) return user;
  const raw = user as UserData & { id?: string };
  if (raw.id) {
    return { ...user, $id: raw.id };
  }
  return user;
};

type ExistingUserLookup = { userId: string; sensitiveUserId?: string };

type AuthPayload = {
  user: { id: string; email: string; name?: string | null } | null;
  session?: { userId: string; isAdmin: boolean } | null;
  token?: string | null;
  profile?: UserData | null;
};

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

export const authService = {
  AUTH_USER_KEY: 'auth-user',
  APP_USER_KEY: 'app-user',
  GUEST_KEY: 'guest-session',

  getStoredAuthUser(): UserAccount | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(this.AUTH_USER_KEY);
      return raw ? (JSON.parse(raw) as UserAccount) : null;
    } catch {
      return null;
    }
  },

  getStoredUserData(): UserData | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(this.APP_USER_KEY);
      const parsed = raw ? (JSON.parse(raw) as UserData) : null;
      return normalizeUserData(parsed);
    } catch {
      return null;
    }
  },

  setCurrentAuthUser(user: UserAccount | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (user) {
        window.localStorage.setItem(this.AUTH_USER_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(this.AUTH_USER_KEY);
      }
    } catch {
      // ignore storage errors
    }
  },

  setCurrentUserData(user: UserData | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (user) {
        window.localStorage.setItem(this.APP_USER_KEY, JSON.stringify(normalizeUserData(user)));
      } else {
        window.localStorage.removeItem(this.APP_USER_KEY);
      }
    } catch {
      // ignore storage errors
    }
  },

  setGuest(flag: boolean) {
    if (typeof window === 'undefined') return;
    try {
      if (flag) {
        window.localStorage.setItem(this.GUEST_KEY, '1');
      } else {
        window.localStorage.removeItem(this.GUEST_KEY);
      }
    } catch {}
  },

  isGuest(): boolean {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(this.GUEST_KEY) === '1';
  },

  async findExistingUserDataByEmail(_email: string): Promise<ExistingUserLookup | null> {
    return null;
  },

  async fetchSession(): Promise<{ user: UserAccount | null; profile: UserData | null; session: AuthPayload['session'] | null; token: string | null }> {
    const data = await apiFetch<AuthPayload>('/api/auth/me');
    if (!data?.user || !data.session) {
      return { user: null, profile: null, session: null, token: null };
    }
    const mapped: UserAccount = { $id: data.user.id, email: data.user.email, name: data.user.name ?? undefined };
    this.setCurrentAuthUser(mapped);
    if (data.profile) this.setCurrentUserData(data.profile as UserData);
    return { user: mapped, profile: (data.profile as UserData) ?? null, session: data.session ?? null, token: data.token ?? null };
  },

  async createAccount(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    userName: string,
    dateOfBirth: string,
  ): Promise<UserAccount> {
    const data = await apiFetch<AuthPayload>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: `${firstName} ${lastName}`.trim(), firstName, lastName, userName, dateOfBirth }),
    });
    if (!data.user) throw new Error('Authentication failed');
    const mapped: UserAccount = { $id: data.user.id, email: data.user.email, name: data.user.name ?? undefined };
    this.setCurrentAuthUser(mapped);
    if (data.profile) this.setCurrentUserData(data.profile as UserData);
    this.setGuest(false);
    return mapped;
  },

  async login(email: string, password: string): Promise<UserAccount> {
    const data = await apiFetch<AuthPayload>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!data.user) throw new Error('Authentication failed');
    const mapped: UserAccount = { $id: data.user.id, email: data.user.email, name: data.user.name ?? undefined };
    this.setCurrentAuthUser(mapped);
    if (data.profile) this.setCurrentUserData(data.profile as UserData);
    this.setGuest(false);
    return mapped;
  },

  async getCurrentUser(): Promise<UserAccount | null> {
    const cached = this.getStoredAuthUser();
    if (cached) return cached;
    try {
      const { user } = await this.fetchSession();
      return user;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    this.setCurrentAuthUser(null);
    this.setCurrentUserData(null);
    this.setGuest(false);
  },

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async updateEmail(): Promise<void> {
    throw new Error('Email updates are not yet supported in the self-hosted auth flow.');
  },

  async resendVerification(): Promise<void> {
    return;
  },

  async confirmVerification(_userId: string, _secret: string): Promise<void> {
    return;
  },

  async oauthLoginWithGoogle(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Google OAuth is only available in the browser.');
    }

    // Preserve where the user was, but only as a same-origin path.
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const url = new URL('/api/auth/google/start', window.location.origin);
    url.searchParams.set('next', next || '/discover');
    window.location.assign(url.toString());
  },

  async guestLogin(): Promise<void> {
    this.setCurrentAuthUser(null);
    this.setCurrentUserData(null);
    this.setGuest(true);
  },
};
