'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authService } from '@/lib/auth';

interface UserAccount {
  $id: string;
  email: string;
  name?: string;
}

interface AppContextType {
  user: UserAccount | null;
  loading: boolean;
  setUser: (user: UserAccount | null) => void;
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
  const [user, setUser] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.warn('Auth check error:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const isAuthenticated = user !== null;

  return (
    <AppContext.Provider value={{ user, loading, setUser, isAuthenticated }}>
      {children}
    </AppContext.Provider>
  );
}
