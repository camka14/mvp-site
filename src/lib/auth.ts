import { account, databases, ID } from '@/app/appwrite';
import type { UserData } from '@/types';
import { OAuthProvider } from 'appwrite';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

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
  async createAccount(email: string, password: string, firstName: string, lastName: string, userName: string): Promise<UserAccount> {
    try {
      // First check if user is already logged in
      const existingUser = await this.getCurrentUser();
      if (existingUser) {
        await this.logout(); // Logout existing session
      }

      const userAccount: UserAccount = await account.create({
        userId: ID.unique(),
        email,
        password,
        name: `${firstName} ${lastName}`.trim()
      });

      // Auto login after registration (required to send verification email via Account API)
      if (userAccount) {
        const loggedIn = await this.login(email, password);

        // Ensure a corresponding user profile exists in the Users table
        try {
          const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
          const USERS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID!;

          // Check if there's already a row (id matches auth account id)
          let userRow: any | null = null;
          try {
            userRow = await databases.getRow({
              databaseId: DATABASE_ID,
              tableId: USERS_TABLE_ID,
              rowId: loggedIn.$id
            });
          } catch {
            userRow = null;
          }

          if (!userRow) {
            await databases.createRow({
              databaseId: DATABASE_ID,
              tableId: USERS_TABLE_ID,
              rowId: loggedIn.$id,
              data: {
                firstName: firstName || '',
                lastName: lastName || '',
                userName,
                teamIds: [],
                friendIds: [],
                friendRequestIds: [],
                friendRequestSentIds: [],
                followingIds: [],
                teamInvites: [],
                eventInvites: [],
                uploadedImages: [],
                profileImageId: ''
              }
            });
          }
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
    await account.createVerification({
      url: `${window.location.origin}/verify`
    });
  },

  async confirmVerification(userId: string, secret: string): Promise<void> {
    // Confirm verification using parameters from the email link
    await account.updateVerification({ userId, secret });
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
    const successUrl = `${window.location.origin}/events`;
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
