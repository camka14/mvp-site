'use client';

import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { AgentActivePageContext, AgentClientAction, AgentClientActionResult } from '@/lib/agent/types';

type RefreshHandler = () => Promise<void> | void;
type ClientActionHandler = (actions: AgentClientAction[]) => Promise<AgentClientActionResult> | AgentClientActionResult;

type AgentContextValue = {
  activePageContext: AgentActivePageContext | null;
  setActivePageContext: (context: AgentActivePageContext | null) => void;
  isAssistantOpen: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  registerRefreshHandler: (handler: RefreshHandler | null) => void;
  refreshActivePage: () => Promise<void>;
  registerClientActionHandler: (handler: ClientActionHandler | null) => void;
  dispatchClientActions: (actions: AgentClientAction[]) => Promise<AgentClientActionResult>;
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [activePageContext, setActivePageContext] = useState<AgentActivePageContext | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const refreshHandlerRef = useRef<RefreshHandler | null>(null);
  const clientActionHandlerRef = useRef<ClientActionHandler | null>(null);

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

  const registerClientActionHandler = useCallback((handler: ClientActionHandler | null) => {
    clientActionHandlerRef.current = handler;
  }, []);

  const dispatchClientActions = useCallback(async (actions: AgentClientAction[]) => {
    if (actions.length === 0) {
      return { applied: 0, errors: [] };
    }
    const handler = clientActionHandlerRef.current;
    if (!handler) {
      return {
        applied: 0,
        errors: ['No active page can apply the assistant draft changes.'],
      };
    }
    return handler(actions);
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
      registerClientActionHandler,
      dispatchClientActions,
    }),
    [
      activePageContext,
      closeAssistant,
      dispatchClientActions,
      isAssistantOpen,
      openAssistant,
      refreshActivePage,
      registerClientActionHandler,
      registerRefreshHandler,
    ],
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
