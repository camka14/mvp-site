'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService } from '@/lib/auth';
import { userService } from '@/lib/userService';
import { account, ID } from '@/app/appwrite';
import { UserData } from '@/types';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

interface AppContextType {
  user: UserData | null;
  authUser: UserAccount | null;
  loading: boolean;
  setUser: (user: UserData | null) => void;
  setAuthUser: (authUser: UserAccount | null) => void;
  updateUser: (updates: Partial<UserData>) => Promise<UserData | null>;
  refreshUser: () => Promise<void>;
  isGuest: boolean;
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
  const [authUser, setAuthUserState] = useState<UserAccount | null>(() => {
    return typeof window !== 'undefined' ? authService.getStoredAuthUser() : null;
  });
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState<boolean>(() => (typeof window !== 'undefined' ? authService.isGuest() : false));

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // First get the authenticated user from Appwrite Auth
      const currentAuthUser = await authService.getCurrentUser();
      const guest = authService.isGuest();
      setAuthUser(currentAuthUser);
      setIsGuest(guest);

      if (guest) {
        // In guest mode, do not fetch or create extended user data
        setUser(null);
        authService.setCurrentUserData(null);
      } else if (currentAuthUser) {
        // Then get or create the extended user data from your custom user table
        let userData = await userService.getUserById(currentAuthUser.$id);
        if (!userData) {
          try {
            let firstName = '';
            let lastName = '';

            // Try to enrich from current OAuth session (e.g., Google)
            try {
              const session = await account.getSession({ sessionId: 'current' });
              const provider = (session.provider || '').toLowerCase();
              const accessToken = (session as any).providerAccessToken as string | undefined;
              if (provider === 'google' && accessToken) {
                const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (resp.ok) {
                  const info = await resp.json();
                  firstName = (info.given_name || '').toString();
                  lastName = (info.family_name || '').toString();
                }
              }
            } catch {}

            // Fallback to name or email if OAuth enrichment unavailable
            if (!firstName && !lastName) {
              const fullName = (currentAuthUser.name || '').trim();
              if (fullName) {
                const parts = fullName.split(/\s+/);
                firstName = parts[0] || '';
                lastName = parts.slice(1).join(' ');
              }
            }
            if (!firstName) firstName = (currentAuthUser.email.split('@')[0] || 'user');
            if (!lastName) lastName = '';

            const userName = `${firstName.replace(/\s+/g, '').toLowerCase()}${ID.unique()}`;

            userData = await userService.createUser(currentAuthUser.$id, {
              firstName,
              lastName,
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
            } as any);
          } catch (e) {
            console.warn('Failed to create missing user profile row:', e);
          }
        }
        if (userData) {
          setUser(userData);
          authService.setCurrentUserData(userData);
        } else {
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
  const setAuthUser = (value: UserAccount | null) => {
    setAuthUserState(value);
    authService.setCurrentAuthUser(value);
  };

  const refreshUser = async () => {
    if (!authUser) return;
    try {
      const latest = await userService.getUserById(authUser.$id);
      if (latest) setUser(latest);
    } catch (e) {
      console.warn('Failed to refresh user', e);
    }
  };

  const updateUser = async (updates: Partial<UserData>) => {
    if (!user) return null;
    try {
      const updated = await userService.updateUser(user.$id, updates);
      setUser(updated);
      return updated;
    } catch (e) {
      console.warn('Failed to update user', e);
      return null;
    }
  };

  const isAuthenticated = (authUser !== null || user !== null) && !isGuest;

  return (
    <AppContext.Provider value={{
      user,
      authUser,
      loading,
      setUser,
      setAuthUser,
      updateUser,
      refreshUser,
      isGuest,
      isAuthenticated
    }}>
      {children}
    </AppContext.Provider>
  );
}
