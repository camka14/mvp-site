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
  signal?: AbortSignal;
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
  signal,
}: EventMatchSocketOptions): Promise<WebSocket> => {
  if (signal?.aborted) {
    throw new DOMException('Match realtime connection was aborted.', 'AbortError');
  }

  const { token } = await apiRequest<MatchRealtimeTokenResponse>(
    `/api/realtime/matches/token?eventId=${encodeURIComponent(eventId)}`,
    { signal },
  );
  if (!token || typeof token !== 'string') {
    throw new Error('Match realtime token response did not include a token.');
  }
  if (signal?.aborted) {
    throw new DOMException('Match realtime connection was aborted.', 'AbortError');
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
  await new Promise<void>((resolve, reject) => {
    let shouldCloseAfterOpen = signal?.aborted ?? false;

    const cleanup = () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('error', handleOpenError);
      socket.removeEventListener('close', handleOpenClose);
      signal?.removeEventListener('abort', handleAbort);
    };

    const abortError = () => new DOMException('Match realtime connection was aborted.', 'AbortError');

    const handleAbort = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'Event changed');
        return;
      }
      // Closing during CONNECTING emits a browser-level warning. Let it open,
      // then close immediately so normal React cleanup stays quiet in dev.
      shouldCloseAfterOpen = true;
    };

    function handleOpen() {
      if (shouldCloseAfterOpen) {
        cleanup();
        socket.close(1000, 'Event changed');
        reject(abortError());
        return;
      }
      cleanup();
      resolve();
    }

    function handleOpenError() {
      cleanup();
      reject(new Error('Match realtime socket failed to open.'));
    }

    function handleOpenClose() {
      cleanup();
      reject(new Error('Match realtime socket closed before opening.'));
    }

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('error', handleOpenError);
    socket.addEventListener('close', handleOpenClose);
    signal?.addEventListener('abort', handleAbort, { once: true });

    if (signal?.aborted) {
      handleAbort();
    }
  });

  if (onClose) socket.onclose = onClose;
  if (onError) socket.onerror = onError;
  return socket;
};
