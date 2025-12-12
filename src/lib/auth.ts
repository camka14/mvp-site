import { account, databases, ID } from '@/app/appwrite';
import type { UserData } from '@/types';
import { OAuthProvider } from 'appwrite';
import { lookupSensitiveUserByEmail, upsertSensitiveUser } from './sensitiveUserDataService';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

type ExistingUserLookup = { userId: string; sensitiveUserId?: string };

export const authService = {
  // LocalStorage keys
  AUTH_USER_KEY: 'auth-user',
  APP_USER_KEY: 'app-user',
  GUEST_KEY: 'guest-session',

  // Helpers: storage accessors
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
      return raw ? (JSON.parse(raw) as UserData) : null;
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
        window.localStorage.setItem(this.APP_USER_KEY, JSON.stringify(user));
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
    } catch { }
  },
  isGuest(): boolean {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(this.GUEST_KEY) === '1';
  },
  /**
   * Look up an existing user profile by email so we can re-use its ID.
   */
  async findExistingUserDataByEmail(email: string): Promise<ExistingUserLookup | null> {
    const lookup = await lookupSensitiveUserByEmail(email);
    if (lookup.exists && lookup.userId) {
      return { userId: lookup.userId, sensitiveUserId: lookup.sensitiveUserId };
    }
    return null;
  },
  async createAccount(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    userName: string,
    existingUserId?: string | null
  ): Promise<UserAccount> {
    try {
      // First check if user is already logged in
      const existingUser = await this.getCurrentUser();
      if (existingUser) {
        await this.logout(); // Logout existing session
      }

      const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
      const USERS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID!;

      // Try to find an existing UserData row by email
      const existingByEmail = existingUserId ? null : await this.findExistingUserDataByEmail(email);
      const userIdForAccount = existingUserId || existingByEmail?.userId || ID.unique();
      const userAccount: UserAccount = await account.create({
        userId: userIdForAccount,
        email,
        password,
        name: `${firstName} ${lastName}`.trim()
      });

      // Auto login after registration (required to send verification email via Account API)
      if (userAccount) {
        const loggedIn = await this.login(email, password);

        // Ensure a corresponding user profile exists in the Users table
        try {
          // Check if there's already a row (id matches auth account id)
          let userRow: any | null = null;
          try {
            userRow = await databases.getRow({
              databaseId: DATABASE_ID,
              tableId: USERS_TABLE_ID,
              rowId: userIdForAccount
            });
          } catch {
            userRow = null;
          }

          const resolvedProfile = userRow;
          const baseData = {
            firstName: firstName || resolvedProfile?.firstName || '',
            lastName: lastName || resolvedProfile?.lastName || '',
            userName: resolvedProfile?.userName || userName,
            teamIds: resolvedProfile?.teamIds ?? [],
            friendIds: resolvedProfile?.friendIds ?? [],
            friendRequestIds: resolvedProfile?.friendRequestIds ?? [],
            friendRequestSentIds: resolvedProfile?.friendRequestSentIds ?? [],
            followingIds: resolvedProfile?.followingIds ?? [],
            teamInvites: resolvedProfile?.teamInvites ?? [],
            eventInvites: resolvedProfile?.eventInvites ?? [],
            uploadedImages: resolvedProfile?.uploadedImages ?? [],
            profileImageId: resolvedProfile?.profileImageId || ''
          };

          await databases.upsertRow({
            databaseId: DATABASE_ID,
            tableId: USERS_TABLE_ID,
            rowId: userIdForAccount,
            data: baseData
          });

          await upsertSensitiveUser(email, userIdForAccount);
        } catch (profileErr) {
          // Don't block login on profile creation issues; surface for debugging
          console.warn('Failed to ensure user profile row:', profileErr);
        }

        // Send email verification link. This requires an active session for the user account.
        try {
          await account.createVerification({
            url: `${window.location.origin}/verify`
          });
        } catch (e) {
          console.warn('Failed to send verification email:', e);
        }

        return loggedIn;
      }

      return userAccount;
    } catch (error) {
      throw error;
    }
  },

  async resendVerification(): Promise<void> {
    // Re-send verification email to the current authenticated user
    await account.createEmailVerification({
      url: `${window.location.origin}/verify`
    });
  },

  async confirmVerification(userId: string, secret: string): Promise<void> {
    // Confirm verification using parameters from the email link
    await account.updateEmailVerification({ userId, secret });
  },

  async login(email: string, password: string): Promise<UserAccount> {
    try {
      // Check if user is already logged in
      const existingUser = await this.getCurrentUser();
      if (existingUser) {
        return existingUser; // Return existing user instead of creating new session
      }

      await account.createEmailPasswordSession({
        email,
        password
      });

      const user = await account.get();
      // Persist to localStorage
      this.setCurrentAuthUser(user as UserAccount);
      this.setGuest(false);
      return user as UserAccount;
    } catch (error) {
      throw error;
    }
  },

  async getCurrentUser(): Promise<UserAccount | null> {
    try {
      // Try localStorage first for faster hydration
      const cached = this.getStoredAuthUser();
      if (cached) return cached;

      // Fallback to Appwrite
      const user = await account.get();
      this.setCurrentAuthUser(user as UserAccount);
      return user as UserAccount;
    } catch (error) {
      // If there's an error getting the user, they're not logged in
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await account.deleteSession({
        sessionId: 'current'
      });
    } catch (error) {
      // If logout fails, user might already be logged out
      console.warn('Logout error:', error);
    }
    // Always clear local cache
    this.setCurrentAuthUser(null);
    this.setCurrentUserData(null);
    this.setGuest(false);
  },

  async checkSession(): Promise<boolean> {
    try {
      await account.get();
      return true;
    } catch (error) {
      return false;
    }
  },

  async oauthLoginWithGoogle(): Promise<void> {
    const successUrl = `${window.location.origin}/discover`;
    const failureUrl = `${window.location.origin}/login`;
    // Clear any guest flag before redirecting to provider
    this.setGuest(false);
    await account.createOAuth2Session({ provider: OAuthProvider.Google, success: successUrl, failure: failureUrl });
  },

  async guestLogin(): Promise<void> {
    try {
      // Ensure we're not carrying over any prior user state
      this.setCurrentAuthUser(null);
      this.setCurrentUserData(null);

      // Create an anonymous (guest) session with Appwrite
      await account.createAnonymousSession();

      // Mark guest mode in localStorage for downstream checks
      this.setGuest(true);
    } catch (error) {
      // Bubble up so caller can show a friendly error
      throw error;
    }
  }
};
