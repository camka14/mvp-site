'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from '@/lib/auth';
import { userService } from '@/lib/userService';
import { sportsService } from '@/lib/sportsService';
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
  // Keep initial render deterministic between server and client to avoid hydration mismatches.
  // Any browser-only state (localStorage, cookies via JS, etc.) must be read after mount.
  const [user, setUserState] = useState<UserData | null>(null);
  const [authUser, setAuthUserState] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isGuest, setIsGuest] = useState<boolean>(false);

  const setUser = useCallback((value: UserData | null) => {
    setUserState(value);
    authService.setCurrentUserData(value);
  }, []);

  const setAuthUser = useCallback((value: UserAccount | null) => {
    setAuthUserState(value);
    authService.setCurrentAuthUser(value);
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const session = await authService.fetchSession();
      const currentAuthUser = session.user;
      const guest = authService.isGuest();
      setAuthUser(currentAuthUser);
      setIsGuest(guest);

      if (guest) {
        setUser(null);
        authService.setCurrentUserData(null);
      } else if (currentAuthUser) {
        let userData = await userService.getUserById(currentAuthUser.$id);
        if (!userData && session.profile) {
          userData = session.profile;
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
  }, [setAuthUser, setUser]);

  useEffect(() => {
    // Prime state from localStorage after mount (optional UX improvement), then verify with the server.
    try {
      const guest = authService.isGuest();
      setIsGuest(guest);

      if (guest) {
        setUserState(null);
        setAuthUserState(null);
      } else {
        const storedUser = authService.getStoredUserData();
        const storedAuthUser = authService.getStoredAuthUser();
        if (storedUser) setUserState(storedUser);
        if (storedAuthUser) setAuthUserState(storedAuthUser);
      }
    } catch {
      // ignore storage errors; checkAuth will resolve the truth
    }

    void checkAuth();

    // Warm sports cache once per app load so sport selectors can render immediately.
    sportsService.getAll(true).catch(() => {
      // Ignore failures; consumers still attempt to load sports when needed.
    });
  }, [checkAuth]);

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
