export type AgentPageContext = {
  pathname: string;
  auth: {
    isAuthenticated: boolean;
    isGuest: boolean;
  };
  page?: AgentActivePageContext | null;
};

export type AgentActivePageContext = {
  kind: 'event_schedule' | 'generic';
  title?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  eventType?: string | null;
  activeTab?: string | null;
  selectedOccurrence?: {
    slotId?: string | null;
    occurrenceDate?: string | null;
  } | null;
  canManageEvent?: boolean;
  canEditMatches?: boolean;
  hasUnsavedChanges?: boolean;
  matchCount?: number;
  participantCount?: number;
  teamCount?: number;
};

export type AgentChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

export type AgentPendingConfirmation = {
  id: string;
  toolName: string;
  summary: string;
  expiresAt: string;
};

export type AgentToolChange = {
  type: 'match' | 'participant' | 'schedule';
  id?: string;
  eventId?: string;
  operation: 'update' | 'add' | 'remove' | 'regenerate';
  label?: string;
};

export type AgentChatLoadResponse = {
  conversationId: string;
  messages: AgentChatMessage[];
  pendingConfirmations: AgentPendingConfirmation[];
  isGuest: boolean;
  canUseActions: boolean;
};

export type AgentChatSendResponse = {
  conversationId: string;
  reply: string;
  messages?: AgentChatMessage[];
  pendingConfirmations: AgentPendingConfirmation[];
  changes: AgentToolChange[];
};

export type AgentConfirmResponse = {
  reply: string;
  status: 'executed' | 'cancelled' | 'save_required' | 'expired' | 'failed';
  changes: AgentToolChange[];
};
