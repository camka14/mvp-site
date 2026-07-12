'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { authService, type RequiredProfileField } from '@/lib/auth';
import { userService } from '@/lib/userService';
import { sportsService } from '@/lib/sportsService';
import { teamService } from '@/lib/teamService';
import { userTeamsStorage } from '@/lib/userTeamsStorage';
import { Team, UserData } from '@/types';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
  isAdmin?: boolean;
  emailVerifiedAt?: string | null;
  emailVerified?: boolean;
}

interface AppContextType {
  user: UserData | null;
  authUser: UserAccount | null;
  loading: boolean;
  setUser: (user: UserData | null) => void;
  setAuthUser: (authUser: UserAccount | null) => void;
  userTeams: Team[];
  userTeamsLoading: boolean;
  setUserTeams: (teams: Team[], userId?: string) => void;
  refreshUserTeams: (userId?: string) => Promise<Team[]>;
  updateUser: (updates: Partial<UserData>) => Promise<UserData | null>;
  refreshUser: () => Promise<void>;
  refreshSession: () => Promise<void>;
  startGuestSession: () => Promise<void>;
  isGuest: boolean;
  isAuthenticated: boolean;
  requiresProfileCompletion: boolean;
  missingProfileFields: RequiredProfileField[];
  requiresEmailVerification: boolean;
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
  const [userTeams, setUserTeamsState] = useState<Team[]>([]);
  const [userTeamsLoading, setUserTeamsLoading] = useState<boolean>(false);
  const [requiresProfileCompletion, setRequiresProfileCompletion] = useState<boolean>(false);
  const [missingProfileFields, setMissingProfileFields] = useState<RequiredProfileField[]>([]);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState<boolean>(false);

  const setUser = useCallback((value: UserData | null) => {
    setUserState(value);
    authService.setCurrentUserData(value);
    if (value) {
      setIsGuest(false);
    }
  }, []);

  const setAuthUser = useCallback((value: UserAccount | null) => {
    setAuthUserState(value);
    authService.setCurrentAuthUser(value);
    if (value) {
      setIsGuest(false);
      if (value.emailVerified === false || value.emailVerifiedAt === null) {
        setRequiresEmailVerification(true);
      } else if (value.emailVerified === true || value.emailVerifiedAt) {
        setRequiresEmailVerification(false);
      }
    } else {
      setRequiresEmailVerification(false);
    }
  }, []);

  const setUserTeams = useCallback((teams: Team[], userId?: string) => {
    const ownerUserId = userId ?? user?.$id;
    setUserTeamsState(teams);
    if (ownerUserId) {
      userTeamsStorage.set(ownerUserId, teams);
    }
  }, [user?.$id]);

  const refreshUserTeams = useCallback(async (userId?: string): Promise<Team[]> => {
    const ownerUserId = userId ?? user?.$id;
    if (!ownerUserId) {
      setUserTeamsState([]);
      return [];
    }

    setUserTeamsLoading(true);
    try {
      const teams = await teamService.getTeamsByUserId(ownerUserId);
      setUserTeamsState(teams);
      userTeamsStorage.set(ownerUserId, teams);
      return teams;
    } catch (error) {
      console.warn('Failed to refresh user teams', error);
      return userTeamsStorage.get(ownerUserId);
    } finally {
      setUserTeamsLoading(false);
    }
  }, [user?.$id]);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const session = await authService.fetchSession();
      const currentAuthUser = session.user;
      const guest = authService.isGuest();
      setAuthUser(currentAuthUser);
      setIsGuest(guest);
      setRequiresProfileCompletion(session.requiresProfileCompletion);
      setMissingProfileFields(session.missingProfileFields);
      setRequiresEmailVerification(session.requiresEmailVerification);

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
      setRequiresProfileCompletion(false);
      setMissingProfileFields([]);
      setRequiresEmailVerification(false);
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

  useEffect(() => {
    const userId = user?.$id;
    if (!userId || isGuest) {
      setUserTeamsState([]);
      setUserTeamsLoading(false);
      return;
    }

    setUserTeamsState(userTeamsStorage.get(userId));
    void refreshUserTeams(userId);
  }, [isGuest, refreshUserTeams, user?.$id]);

  const refreshUser = async () => {
    if (!authUser) return;
    try {
      const latest = await userService.getUserById(authUser.$id);
      if (latest) setUser(latest);
    } catch (e) {
      console.warn('Failed to refresh user', e);
    }
  };

  const refreshSession = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);

  const startGuestSession = useCallback(async () => {
    await authService.guestLogin();

    // Client-side navigation keeps this provider mounted. Reflect the guest
    // transition here rather than waiting for a later storage-backed auth
    // refresh, otherwise protected guest routes see stale signed-out state.
    setAuthUserState(null);
    setUserState(null);
    setUserTeamsState([]);
    setUserTeamsLoading(false);
    setRequiresProfileCompletion(false);
    setMissingProfileFields([]);
    setRequiresEmailVerification(false);
    setIsGuest(true);
  }, []);

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
      userTeams,
      userTeamsLoading,
      setUserTeams,
      refreshUserTeams,
      updateUser,
      refreshUser,
      refreshSession,
      startGuestSession,
      isGuest,
      isAuthenticated,
      requiresProfileCompletion,
      missingProfileFields,
      requiresEmailVerification,
    }}>
      {children}
    </AppContext.Provider>
  );
}
