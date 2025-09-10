import { account, ID } from '@/app/appwrite';
import type { UserData } from '@/types';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

export const authService = {
  // LocalStorage keys
  AUTH_USER_KEY: 'auth-user',
  APP_USER_KEY: 'app-user',

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
  async createAccount(email: string, password: string, name?: string): Promise<UserAccount> {
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
        name
      });

      // Auto login after registration
      if (userAccount) {
        const loggedIn = await this.login(email, password);
        return loggedIn;
      }

      return userAccount;
    } catch (error) {
      throw error;
    }
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
  },

  async checkSession(): Promise<boolean> {
    try {
      await account.get();
      return true;
    } catch (error) {
      return false;
    }
  }
};
