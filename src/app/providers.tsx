'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService } from '@/lib/auth';
import { userService } from '@/lib/userService';
import { UserData } from '@/types';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

interface AppContextType {
  user: UserData | null; // Changed from UserAccount to UserData
  authUser: UserAccount | null; // Keep auth user separate
  loading: boolean;
  setUser: (user: UserData | null) => void;
  isAuthenticated: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Initialize from localStorage for faster hydration
  const [user, setUserState] = useState<UserData | null>(() => {
    return typeof window !== 'undefined' ? authService.getStoredUserData() : null;
  });
  const [authUser, setAuthUser] = useState<UserAccount | null>(() => {
    return typeof window !== 'undefined' ? authService.getStoredAuthUser() : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // First get the authenticated user from Appwrite Auth
      const currentAuthUser = await authService.getCurrentUser();
      setAuthUser(currentAuthUser);

      if (currentAuthUser) {
        // Then get the extended user data from your custom user table
        const userData = await userService.getUserById(currentAuthUser.$id);
        if (userData) {
          setUser(userData);
          authService.setCurrentUserData(userData);
        } else {
          // If no user data exists in your custom table, you might want to create it
          // or handle this case based on your app logic
          console.warn('Auth user exists but no user data found in database');
          setUser(null);
          authService.setCurrentUserData(null);
        }
      } else {
        setUser(null);
        authService.setCurrentUserData(null);
      }
    } catch (error) {
      console.warn('Auth check error:', error);
      setAuthUser(null);
      setUser(null);
      authService.setCurrentUserData(null);
    } finally {
      setLoading(false);
    }
  };

  // Ensure setUser persists to localStorage for consumers
  const setUser = (value: UserData | null) => {
    setUserState(value);
    authService.setCurrentUserData(value);
  };

  const isAuthenticated = authUser !== null && user !== null;

  return (
    <AppContext.Provider value={{
      user,
      authUser,
      loading,
      setUser,
      isAuthenticated
    }}>
      {children}
    </AppContext.Provider>
  );
}
