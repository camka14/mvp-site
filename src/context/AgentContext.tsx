'use client';

import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { AgentActivePageContext } from '@/lib/agent/types';

type RefreshHandler = () => Promise<void> | void;

type AgentContextValue = {
  activePageContext: AgentActivePageContext | null;
  setActivePageContext: (context: AgentActivePageContext | null) => void;
  isAssistantOpen: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  registerRefreshHandler: (handler: RefreshHandler | null) => void;
  refreshActivePage: () => Promise<void>;
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [activePageContext, setActivePageContext] = useState<AgentActivePageContext | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const refreshHandlerRef = useRef<RefreshHandler | null>(null);

  const openAssistant = useCallback(() => {
    setIsAssistantOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setIsAssistantOpen(false);
  }, []);

  const registerRefreshHandler = useCallback((handler: RefreshHandler | null) => {
    refreshHandlerRef.current = handler;
  }, []);

  const refreshActivePage = useCallback(async () => {
    await refreshHandlerRef.current?.();
  }, []);

  const value = useMemo(
    () => ({
      activePageContext,
      setActivePageContext,
      isAssistantOpen,
      openAssistant,
      closeAssistant,
      registerRefreshHandler,
      refreshActivePage,
    }),
    [activePageContext, closeAssistant, isAssistantOpen, openAssistant, refreshActivePage, registerRefreshHandler],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgentContext() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgentContext must be used within AgentProvider');
  }
  return context;
}
