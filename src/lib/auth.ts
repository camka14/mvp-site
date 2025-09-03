import { account, ID } from '@/app/appwrite';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

export const authService = {
  async createAccount(email: string, password: string, name?: string): Promise<UserAccount> {
    try {
      // First check if user is already logged in
      const existingUser = await this.getCurrentUser();
      if (existingUser) {
        await this.logout(); // Logout existing session
      }

      const userAccount: UserAccount = await account.create(
        ID.unique(),
        email,
        password,
        name
      );

      // Auto login after registration
      if (userAccount) {
        return await this.login(email, password);
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

      await account.createEmailPasswordSession(email, password);
      return await account.get();
    } catch (error) {
      throw error;
    }
  },

  async getCurrentUser(): Promise<UserAccount | null> {
    try {
      const user = await account.get();
      return user;
    } catch (error) {
      // If there's an error getting the user, they're not logged in
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await account.deleteSession('current');
    } catch (error) {
      // If logout fails, user might already be logged out
      console.warn('Logout error:', error);
    }
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
