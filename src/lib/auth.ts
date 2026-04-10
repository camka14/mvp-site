import type { UserData } from '@/types';
import { normalizeOptionalName } from '@/lib/nameCase';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

export type RequiredProfileField = 'firstName' | 'lastName' | 'dateOfBirth';

export interface AuthSessionResult {
  user: UserAccount | null;
  profile: UserData | null;
  session: AuthPayload['session'] | null;
  token: string | null;
  requiresProfileCompletion: boolean;
  missingProfileFields: RequiredProfileField[];
}

const normalizeUserData = (user: UserData | null): UserData | null => {
  if (!user) return null;
  const normalizedUser = {
    ...user,
    firstName: normalizeOptionalName(user.firstName) ?? '',
    lastName: normalizeOptionalName(user.lastName) ?? '',
  };
  if (normalizedUser.$id) return normalizedUser;
  const raw = user as UserData & { id?: string };
  if (raw.id) {
    return { ...normalizedUser, $id: raw.id };
  }
  return normalizedUser;
};

type ExistingUserLookup = { userId: string; sensitiveUserId?: string };

type AuthPayload = {
  user: { id: string; email: string; name?: string | null } | null;
  session?: { userId: string; isAdmin: boolean } | null;
  token?: string | null;
  profile?: UserData | null;
  requiresProfileCompletion?: boolean;
  missingProfileFields?: RequiredProfileField[];
};

type VerificationRequiredPayload = {
  error: string;
  code: 'EMAIL_NOT_VERIFIED';
  email: string;
  requiresEmailVerification?: boolean;
  verificationEmailSent?: boolean;
  user?: { id: string; email: string; name?: string | null } | null;
  profile?: UserData | null;
};

type ApiErrorData = {
  error?: string;
  code?: string;
  email?: string;
  requiresEmailVerification?: boolean;
  verificationEmailSent?: boolean;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  email?: string;
  data: ApiErrorData;

  constructor(message: string, status: number, data: ApiErrorData = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof data.code === 'string' ? data.code : undefined;
    this.email = typeof data.email === 'string' ? data.email : undefined;
    this.data = data;
  }
}

const isVerificationRequiredPayload = (value: unknown): value is VerificationRequiredPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<VerificationRequiredPayload>;
  return candidate.code === 'EMAIL_NOT_VERIFIED' || candidate.requiresEmailVerification === true;
};

const REQUIRED_PROFILE_FIELDS: RequiredProfileField[] = ['firstName', 'lastName', 'dateOfBirth'];

const normalizeRequiredProfileFields = (value: unknown): RequiredProfileField[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (
    typeof entry === 'string' && REQUIRED_PROFILE_FIELDS.includes(entry as RequiredProfileField)
      ? [entry as RequiredProfileField]
      : []
  ));
};

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || 'Request failed', res.status, data ?? {});
  }
  return data as T;
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

  async fetchSession(): Promise<AuthSessionResult> {
    const data = await apiFetch<AuthPayload>('/api/auth/me');
    const missingProfileFields = normalizeRequiredProfileFields(data?.missingProfileFields);
    const requiresProfileCompletion = data?.requiresProfileCompletion === true || missingProfileFields.length > 0;
    if (!data?.user || !data.session) {
      return {
        user: null,
        profile: null,
        session: null,
        token: null,
        requiresProfileCompletion: false,
        missingProfileFields: [],
      };
    }
    const mapped: UserAccount = { $id: data.user.id, email: data.user.email, name: data.user.name ?? undefined };
    this.setCurrentAuthUser(mapped);
    if (data.profile) this.setCurrentUserData(data.profile as UserData);
    return {
      user: mapped,
      profile: (data.profile as UserData) ?? null,
      session: data.session ?? null,
      token: data.token ?? null,
      requiresProfileCompletion,
      missingProfileFields,
    };
  },

  async createAccount(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    userName: string,
    dateOfBirth: string,
  ): Promise<AuthSessionResult> {
    const normalizedFirstName = normalizeOptionalName(firstName) ?? firstName.trim();
    const normalizedLastName = normalizeOptionalName(lastName) ?? lastName.trim();
    const data = await apiFetch<AuthPayload | VerificationRequiredPayload>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        name: `${normalizedFirstName} ${normalizedLastName}`.trim(),
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        userName,
        dateOfBirth,
      }),
    });
    if (isVerificationRequiredPayload(data)) {
      throw new ApiError(data.error || 'Email verification required', 403, data);
    }
    if (!data.user) throw new Error('Authentication failed');
    const missingProfileFields = normalizeRequiredProfileFields(data.missingProfileFields);
    const mapped: UserAccount = { $id: data.user.id, email: data.user.email, name: data.user.name ?? undefined };
    this.setCurrentAuthUser(mapped);
    if (data.profile) this.setCurrentUserData(data.profile as UserData);
    this.setGuest(false);
    return {
      user: mapped,
      profile: (data.profile as UserData) ?? null,
      session: data.session ?? null,
      token: data.token ?? null,
      requiresProfileCompletion: data.requiresProfileCompletion === true || missingProfileFields.length > 0,
      missingProfileFields,
    };
  },

  async login(email: string, password: string): Promise<AuthSessionResult> {
    const data = await apiFetch<AuthPayload | VerificationRequiredPayload>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (isVerificationRequiredPayload(data)) {
      throw new ApiError(data.error || 'Email verification required', 403, data);
    }
    if (!data.user) throw new Error('Authentication failed');
    const missingProfileFields = normalizeRequiredProfileFields(data.missingProfileFields);
    const mapped: UserAccount = { $id: data.user.id, email: data.user.email, name: data.user.name ?? undefined };
    this.setCurrentAuthUser(mapped);
    if (data.profile) this.setCurrentUserData(data.profile as UserData);
    this.setGuest(false);
    return {
      user: mapped,
      profile: (data.profile as UserData) ?? null,
      session: data.session ?? null,
      token: data.token ?? null,
      requiresProfileCompletion: data.requiresProfileCompletion === true || missingProfileFields.length > 0,
      missingProfileFields,
    };
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

  async updateEmail(newEmail: string, currentPassword: string): Promise<void> {
    await apiFetch('/api/auth/email', {
      method: 'POST',
      body: JSON.stringify({ newEmail, currentPassword }),
    });
  },

  async resendVerification(email: string): Promise<void> {
    await apiFetch('/api/auth/verify/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
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
