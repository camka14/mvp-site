import { apiRequest } from '@/lib/apiClient';
import type { Match } from '@/types';

type MatchRealtimeTokenResponse = {
  token: string;
  expiresAt?: string;
};

export type MatchRealtimeMessage = {
  type: 'match.changed' | 'subscribed';
  eventId?: string;
  matches?: Match[];
  deleted?: string[];
  sentAt?: string;
};

export type EventMatchSocketOptions = {
  eventId: string;
  onMessage: (message: MatchRealtimeMessage) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
};

const buildMatchSocketUrl = (eventId: string, token: string): string => {
  const url = new URL('/api/realtime/matches', window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('eventId', eventId);
  url.searchParams.set('token', token);
  return url.toString();
};

export const connectEventMatchSocket = async ({
  eventId,
  onMessage,
  onClose,
  onError,
}: EventMatchSocketOptions): Promise<WebSocket> => {
  const { token } = await apiRequest<MatchRealtimeTokenResponse>(
    `/api/realtime/matches/token?eventId=${encodeURIComponent(eventId)}`,
  );
  if (!token || typeof token !== 'string') {
    throw new Error('Match realtime token response did not include a token.');
  }

  const socket = new WebSocket(buildMatchSocketUrl(eventId, token));
  socket.onmessage = (event) => {
    try {
      const parsed = JSON.parse(String(event.data)) as MatchRealtimeMessage;
      onMessage(parsed);
    } catch (parseError) {
      console.warn('Ignoring malformed match realtime message:', parseError);
    }
  };
  if (onClose) socket.onclose = onClose;
  if (onError) socket.onerror = onError;
  return socket;
};
