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
  pendingChanges?: {
    hasChanges: boolean;
    count: number;
    summary: string[];
  };
  draftSchedule?: {
    source: 'saved' | 'draft';
    totalMatches: number;
    truncated: boolean;
    matches: Array<{
      id: string;
      displayNumber?: number | null;
      start?: string | null;
      end?: string | null;
      fieldId?: string | null;
      fieldName?: string | null;
      team1Id?: string | null;
      team1Name?: string | null;
      team2Id?: string | null;
      team2Name?: string | null;
      officialId?: string | null;
      locked?: boolean | null;
      division?: string | null;
    }>;
  };
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

export type AgentScheduleDraftMatchUpdates = {
  start?: string | null;
  end?: string | null;
  fieldId?: string | null;
  team1Id?: string | null;
  team2Id?: string | null;
  officialId?: string | null;
  officialIds?: Array<Record<string, unknown>> | null;
  teamOfficialId?: string | null;
  locked?: boolean | null;
  officialCheckedIn?: boolean | null;
  matchId?: number | null;
  division?: string | null;
  losersBracket?: boolean | null;
};

export type AgentClientAction = {
  type: 'schedule.match.update';
  eventId: string;
  matchId: string;
  updates: AgentScheduleDraftMatchUpdates;
  summary: string;
};

export type AgentClientActionResult = {
  applied: number;
  errors: string[];
  message?: string;
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
  clientActions: AgentClientAction[];
};

export type AgentConfirmResponse = {
  reply: string;
  status: 'executed' | 'cancelled' | 'save_required' | 'expired' | 'failed';
  changes: AgentToolChange[];
};
