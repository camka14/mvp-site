import { account, ID } from '../appwrite';

export const authService = {
  // Create new user account
  async createAccount(email, password, name) {
    try {
      const userAccount = await account.create(
        ID.unique(),
        email,
        password,
        name
      );
      
      // Auto login after registration
      if (userAccount) {
        return this.login(email, password);
      }
      
      return userAccount;
    } catch (error) {
      throw error;
    }
  },

  // Login user
  async login(email, password) {
    try {
      const session = await account.createEmailPasswordSession(email, password);
      return session;
    } catch (error) {
      throw error;
    }
  },

  // Get current user
  async getCurrentUser() {
    try {
      return await account.get();
    } catch (error) {
      return null;
    }
  },

  // Logout
  async logout() {
    try {
      return await account.deleteSession('current');
    } catch (error) {
      throw error;
    }
  }
};
